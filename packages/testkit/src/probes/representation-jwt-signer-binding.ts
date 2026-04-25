/**
 * representation-jwt-signer-binding probe (v2.1 §6).
 *
 * Resolves the JWT URL from the `_principal.<owner>.<apex>` TXT
 * record's `rep=` field, fetches the JWT, then:
 *
 *   1. Extracts `kid` from the header and `iss` from the payload.
 *   2. Resolves `iss` through the ARP resolver (any DID method).
 *   3. Finds the verification method in the resolved DID document whose
 *      `id` matches `kid`.
 *   4. Verifies the JWS signature with that verification method's
 *      `publicKeyMultibase` (Ed25519).
 *
 * v2.1 §3.1 (clarification): the `rep=` URL is operationally up to the
 * registrar — it can live on the owner subdomain, on the registrar's
 * apex, or on any HTTPS host that serves the JWT bytes. The probe
 * follows whatever URL the TXT advertises.
 *
 * Fails when:
 *   - TXT lookup fails, has no rep= field, or rep= is not a valid HTTPS URL
 *   - JWT fetch fails or the response is not a compact JWS
 *   - header/payload don't parse or `kid`/`iss` missing
 *   - `iss` cannot be resolved
 *   - `kid` doesn't match any verificationMethod id in the resolved doc
 *   - Ed25519 signature verification fails
 *
 * Skips when:
 *   - target is localhost (no real representation JWT)
 *   - `ctx.ownerLabel` is unset
 */

import * as ed25519 from '@noble/ed25519';
import {
  createFetchDohClient,
  createLocalHnsdClient,
  createResolver,
  resolveHnsRaw,
  type DohClient,
  type Resolver,
} from '@kybernesis/arp-resolver';
import { base64urlDecode, multibaseEd25519ToRaw } from '@kybernesis/arp-transport';
import type { Probe, ProbeContext, ProbeResult } from '../types.js';
import { elapsed, now, withTimeout } from '../timing.js';

interface JwsHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface JwsPayload {
  iss?: string;
  sub?: string;
  [k: string]: unknown;
}

export interface RepresentationJwtProbeOptions {
  /** Inject a resolver for tests. */
  resolver?: Resolver;
  /** Inject a DoH client for tests. Defaults derived from ctx. */
  dohClient?: DohClient;
}

export function createRepresentationJwtSignerBindingProbe(
  opts: RepresentationJwtProbeOptions = {},
): Probe {
  return async (ctx: ProbeContext): Promise<ProbeResult> => {
    const startedAt = now();
    const apex = apexFromTarget(ctx.target);
    if (isLocalhost(apex)) {
      return skip(startedAt, 'target is localhost; probe requires real .agent apex');
    }
    if (!ctx.ownerLabel) {
      return skip(startedAt, 'no ownerLabel provided in ProbeContext');
    }

    // Resolve rep= URL from the _principal TXT record. v2.1 §3.1 lets the
    // registrar host the JWT anywhere — we follow the URL the TXT
    // advertises rather than guessing the owner-subdomain pattern.
    const ownerApex = `${ctx.ownerLabel}.${apex}`;
    const doh =
      opts.dohClient ??
      (ctx.dohClient as DohClient | undefined) ??
      (ctx.dohEndpoint === 'local:hnsd'
        ? createLocalHnsdClient()
        : createFetchDohClient({
            endpoint: ctx.dohEndpoint ?? 'https://hnsdoh.com/dns-query',
            ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
            timeoutMs: ctx.timeoutMs ?? 10_000,
          }));

    let url: string;
    try {
      const resolution = await resolveHnsRaw(doh, ownerApex);
      const txtValues = resolution.txt['_principal'] ?? [];
      const first = txtValues[0];
      if (!first) {
        return fail(startedAt, `no _principal.${ownerApex} TXT record found`, {
          ownerApex,
        });
      }
      const rep = parseRepFromTxt(first);
      if (!rep) {
        return fail(startedAt, '_principal TXT missing `rep=` URL', {
          ownerApex,
          raw: first,
        });
      }
      let parsed: URL;
      try {
        parsed = new URL(rep);
      } catch {
        return fail(startedAt, `rep= URL not parseable: ${rep}`, {
          ownerApex,
          rep,
        });
      }
      if (parsed.protocol !== 'https:') {
        return fail(startedAt, `rep= URL must be https://, got ${parsed.protocol}`, {
          ownerApex,
          rep,
        });
      }
      url = parsed.toString();
    } catch (err) {
      return fail(startedAt, `rep URL resolution failed: ${(err as Error).message}`, {
        ownerApex,
      });
    }

    const fetchImpl = ctx.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl) {
      return fail(startedAt, 'no fetch implementation available', { url });
    }

    let rawJwt: string;
    try {
      const res = await withTimeout(
        fetchImpl(url, {
          headers: {
            accept: 'application/jwt,application/jws,text/plain',
            ...(ctx.extraHeaders ?? {}),
          },
        }),
        ctx.timeoutMs ?? 10_000,
        `GET ${url}`,
      );
      if (!res.ok) {
        return fail(startedAt, `representation.jwt HTTP ${res.status}`, { url });
      }
      rawJwt = (await res.text()).trim();
    } catch (err) {
      return fail(startedAt, (err as Error).message, { url });
    }

    const parts = rawJwt.split('.');
    if (parts.length !== 3) {
      return fail(startedAt, `not a compact JWS (got ${parts.length} segments)`, {
        url,
      });
    }
    const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

    let header: JwsHeader;
    let payload: JwsPayload;
    try {
      header = JSON.parse(new TextDecoder().decode(base64urlDecode(headerB64))) as JwsHeader;
      payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64))) as JwsPayload;
    } catch (err) {
      return fail(startedAt, `JWS header/payload not JSON: ${(err as Error).message}`, {
        url,
      });
    }

    if (header.alg !== 'EdDSA') {
      return fail(startedAt, `unsupported alg: ${header.alg ?? '<missing>'}`, {
        url,
        alg: header.alg,
      });
    }
    const { kid } = header;
    const iss = payload.iss;
    if (!kid) {
      return fail(startedAt, 'JWS header missing `kid`', { url });
    }
    if (!iss) {
      return fail(startedAt, 'JWT payload missing `iss`', { url });
    }

    const resolver =
      opts.resolver ??
      createResolver({
        ...(ctx.dohEndpoint ? { dohEndpoint: ctx.dohEndpoint } : {}),
        ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
        ...(ctx.timeoutMs ? { timeoutMs: ctx.timeoutMs } : {}),
      });
    const resolveFn = resolver.resolveDid;
    if (!resolveFn) {
      return fail(
        startedAt,
        'resolver does not support resolveDid (method-agnostic dispatch)',
        { url, iss },
      );
    }
    const resolved = await resolveFn(iss);
    if (!resolved.ok) {
      return fail(startedAt, `could not resolve iss ${iss}: ${resolved.error.message}`, {
        url,
        iss,
        code: resolved.error.code,
      });
    }

    const doc = resolved.value;
    const vm = doc.verificationMethod.find((m) => m.id === kid);
    if (!vm) {
      return fail(
        startedAt,
        `no verificationMethod in ${iss} DID doc matches kid=${kid}`,
        { url, kid, iss, available_kids: doc.verificationMethod.map((m) => m.id) },
      );
    }

    let pubRaw: Uint8Array;
    try {
      pubRaw = multibaseEd25519ToRaw(vm.publicKeyMultibase);
    } catch (err) {
      return fail(startedAt, `kid pubkey not parseable: ${(err as Error).message}`, {
        url,
        kid,
      });
    }
    if (pubRaw.length !== 32) {
      return fail(startedAt, `kid pubkey is ${pubRaw.length} bytes, expected 32`, {
        url,
        kid,
      });
    }

    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sig = base64urlDecode(sigB64);
    const ok = await ed25519.verifyAsync(sig, signingInput, pubRaw);
    if (!ok) {
      return fail(startedAt, 'Ed25519 signature verification failed', {
        url,
        kid,
        iss,
      });
    }

    return {
      name: 'representation-jwt-signer-binding',
      pass: true,
      durationMs: elapsed(startedAt),
      details: {
        url,
        kid,
        iss,
        alg: header.alg,
      },
    };
  };
}

export const representationJwtSignerBindingProbe: Probe =
  createRepresentationJwtSignerBindingProbe();

function apexFromTarget(target: string): string {
  const noScheme = target.replace(/^https?:\/\//i, '');
  const hostOnly = noScheme.split('/')[0] ?? noScheme;
  return (hostOnly.split(':')[0] ?? hostOnly).toLowerCase();
}

function isLocalhost(apex: string): boolean {
  return (
    apex === 'localhost' ||
    apex === '127.0.0.1' ||
    apex === '::1' ||
    apex.endsWith('.local')
  );
}

function parseRepFromTxt(txt: string): string | null {
  // Shape: `did=<did>; rep=<url>` (v2 §5.2). Accept any order.
  // The TXT may have wrapping quotes from the DNS layer — strip them.
  const stripped = txt.replace(/^"+|"+$/g, '');
  for (const part of stripped.split(';')) {
    const [rawK, ...rest] = part.split('=');
    if (!rawK) continue;
    const k = rawK.trim().toLowerCase();
    if (k === 'rep') return rest.join('=').trim();
  }
  return null;
}

function fail(
  startedAt: number,
  message: string,
  details: Record<string, unknown>,
): ProbeResult {
  return {
    name: 'representation-jwt-signer-binding',
    pass: false,
    durationMs: elapsed(startedAt),
    details,
    error: { code: 'representation_jwt_invalid', message },
  };
}

function skip(startedAt: number, reason: string): ProbeResult {
  return {
    name: 'representation-jwt-signer-binding',
    pass: true,
    skipped: true,
    skipReason: reason,
    durationMs: elapsed(startedAt),
    details: { reason },
  };
}
