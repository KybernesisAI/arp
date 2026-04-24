/**
 * principal-identity-method probe (v2.1 §6).
 *
 * Resolves the `_principal.<owner>.<domain>` TXT record's `did=` value
 * through the ARP resolver. Passes for both `did:web:...` and `did:key:...`
 * values (v2.1 accepts any DID matching the spec regex; `did:key` is the
 * new default, `did:web` is allowed; legacy `did:web:<x>.self.xyz` is
 * syntactically valid but no longer prompted by the registrar UX).
 *
 * Fails when:
 *   - `_principal` TXT missing or malformed (no `did=...` kv pair)
 *   - DID method unsupported by the resolver
 *   - Resolved document is structurally invalid
 *
 * Skips when:
 *   - target is localhost / .local (no HNS apex)
 *   - `ctx.ownerLabel` is unset (probe needs an owner sub-label)
 */

import { createResolver, type Resolver } from '@kybernesis/arp-resolver';
import {
  createFetchDohClient,
  createLocalHnsdClient,
  resolveHnsRaw,
  type DohClient,
} from '@kybernesis/arp-resolver';
import type { Probe, ProbeContext, ProbeResult } from '../types.js';
import { elapsed, now } from '../timing.js';

const DID_REGEX = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/;

export interface PrincipalIdentityProbeOptions {
  /** Inject a resolver for tests. Defaults to `createResolver()`. */
  resolver?: Resolver;
  /** Inject a DoH client for tests. Defaults derived from ctx. */
  dohClient?: DohClient;
}

export function createPrincipalIdentityMethodProbe(
  opts: PrincipalIdentityProbeOptions = {},
): Probe {
  return async (ctx: ProbeContext): Promise<ProbeResult> => {
    const startedAt = now();
    const apex = apexFromTarget(ctx.target);
    if (isLocalhost(apex)) {
      return skip(startedAt, 'target is localhost; probe requires HNS apex');
    }
    if (!ctx.ownerLabel) {
      return skip(startedAt, 'no ownerLabel provided in ProbeContext');
    }

    const doh =
      opts.dohClient ??
      (ctx.dohEndpoint === 'local:hnsd'
        ? createLocalHnsdClient()
        : createFetchDohClient({
            endpoint: ctx.dohEndpoint ?? 'https://hnsdoh.com/dns-query',
            ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
            timeoutMs: ctx.timeoutMs ?? 10_000,
          }));

    const resolver =
      opts.resolver ??
      createResolver({
        ...(ctx.dohEndpoint ? { dohEndpoint: ctx.dohEndpoint } : {}),
        ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
        ...(ctx.timeoutMs ? { timeoutMs: ctx.timeoutMs } : {}),
      });

    const ownerApex = `${ctx.ownerLabel}.${apex}`;
    try {
      const resolution = await resolveHnsRaw(doh, ownerApex);
      const txtValues = resolution.txt['_principal'] ?? [];
      if (txtValues.length === 0) {
        return fail(
          startedAt,
          `no _principal.${ownerApex} TXT record found`,
          { ownerApex },
        );
      }

      const first = txtValues[0];
      if (!first) {
        return fail(startedAt, '_principal TXT empty', { ownerApex });
      }
      const did = parseDidFromTxt(first);
      if (!did) {
        return fail(startedAt, '_principal TXT missing `did=` value', {
          ownerApex,
          raw: first,
        });
      }
      if (!DID_REGEX.test(did)) {
        return fail(startedAt, `invalid DID syntax: ${did}`, { ownerApex, did });
      }

      const resolveFn = resolver.resolveDid;
      if (!resolveFn) {
        return fail(
          startedAt,
          'resolver instance does not support resolveDid (method-agnostic dispatch)',
          { ownerApex, did },
        );
      }
      const resolved = await resolveFn(did);
      if (!resolved.ok) {
        return fail(
          startedAt,
          `resolver rejected ${did}: ${resolved.error.message}`,
          { ownerApex, did, code: resolved.error.code },
        );
      }

      const doc = resolved.value;
      const method = did.split(':')[1] ?? 'unknown';
      return {
        name: 'principal-identity-method',
        pass: true,
        durationMs: elapsed(startedAt),
        details: {
          ownerApex,
          did,
          method,
          doc_id: doc.id,
        },
      };
    } catch (err) {
      return fail(startedAt, (err as Error).message, { ownerApex });
    }
  };
}

export const principalIdentityMethodProbe: Probe = createPrincipalIdentityMethodProbe();

function parseDidFromTxt(txt: string): string | null {
  // Shape: `did=<did>; rep=<url>` (v2 §5.2). Accept any order.
  for (const part of txt.split(';')) {
    const [rawK, ...rest] = part.split('=');
    if (!rawK) continue;
    const k = rawK.trim().toLowerCase();
    if (k === 'did') return rest.join('=').trim();
  }
  return null;
}

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

function fail(
  startedAt: number,
  message: string,
  details: Record<string, unknown>,
): ProbeResult {
  return {
    name: 'principal-identity-method',
    pass: false,
    durationMs: elapsed(startedAt),
    details,
    error: { code: 'principal_identity_failed', message },
  };
}

function skip(startedAt: number, reason: string): ProbeResult {
  return {
    name: 'principal-identity-method',
    pass: true,
    skipped: true,
    skipReason: reason,
    durationMs: elapsed(startedAt),
    details: { reason },
  };
}
