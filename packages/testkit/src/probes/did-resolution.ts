import { DidDocumentSchema } from '@kybernesis/arp-spec';
import { multibaseEd25519ToRaw } from '@kybernesis/arp-transport';
import type { Probe, ProbeContext, ProbeResult } from '../types.js';
import { elapsed, now } from '../timing.js';
import { fetchJson } from '../http.js';

/**
 * DID resolution probe — mirrors the `did:web` resolution path the runtime
 * uses. We fetch `<baseUrl>/.well-known/did.json`, validate against the
 * published schema, then sanity-check that `id`, the first verification
 * method id, and the publicKeyMultibase parse cleanly (32-byte Ed25519).
 *
 * `baseUrl` usually matches the DID's implied URL. Tests that point at a
 * local sidecar override `baseUrl` to `http://127.0.0.1:<port>`.
 */
export const didResolutionProbe: Probe = async (ctx: ProbeContext): Promise<ProbeResult> => {
  const startedAt = now();
  const didJsonUrl = `${ctx.baseUrl.replace(/\/$/, '')}/.well-known/did.json`;
  const expectedDid = didFromTarget(ctx.target);

  try {
    const res = await fetchJson(didJsonUrl, ctx);
    if (!res.ok) {
      return fail(startedAt, `did.json fetch failed: HTTP ${res.status}`, { didJsonUrl });
    }
    const parsed = DidDocumentSchema.safeParse(res.body);
    if (!parsed.success) {
      return fail(
        startedAt,
        `did.json schema invalid: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
        { didJsonUrl },
      );
    }
    const doc = parsed.data;
    if (expectedDid && doc.id !== expectedDid) {
      return fail(
        startedAt,
        `did.id "${doc.id}" does not match target-derived "${expectedDid}"`,
        { didJsonUrl, doc_id: doc.id, expectedDid },
      );
    }
    const vm = doc.verificationMethod[0];
    if (!vm) {
      return fail(startedAt, 'did.json has no verificationMethod', { didJsonUrl });
    }
    try {
      const raw = multibaseEd25519ToRaw(vm.publicKeyMultibase);
      if (raw.length !== 32) {
        return fail(startedAt, `verificationMethod[0] key is ${raw.length} bytes, expected 32`, {
          didJsonUrl,
        });
      }
    } catch (err) {
      return fail(
        startedAt,
        `verificationMethod[0] publicKeyMultibase not parseable: ${(err as Error).message}`,
        { didJsonUrl },
      );
    }

    // service[] is optional on DidDocument (did:key); agents published under
    // did:web for the testkit MUST advertise a DIDComm endpoint.
    const didcommSvc = doc.service?.find((s) => s.type === 'DIDCommMessaging');
    if (!didcommSvc) {
      return fail(startedAt, 'did.json has no DIDCommMessaging service', { didJsonUrl });
    }

    return {
      name: 'did-resolution',
      pass: true,
      durationMs: elapsed(startedAt),
      details: {
        didJsonUrl,
        did: doc.id,
        controller: doc.controller,
        didcomm_endpoint: didcommSvc.serviceEndpoint,
        verification_method_id: vm.id,
      },
    };
  } catch (err) {
    return fail(startedAt, (err as Error).message, { didJsonUrl });
  }
};

function fail(
  startedAt: number,
  message: string,
  details: Record<string, unknown>,
): ProbeResult {
  return {
    name: 'did-resolution',
    pass: false,
    durationMs: elapsed(startedAt),
    details,
    error: { code: 'did_resolution_failed', message },
  };
}

function didFromTarget(target: string): string | null {
  const noScheme = target.replace(/^https?:\/\//i, '');
  const hostOnly = noScheme.split('/')[0] ?? noScheme;
  const apex = hostOnly.split(':')[0] ?? hostOnly;
  if (!apex) return null;
  if (
    apex === 'localhost' ||
    apex === '127.0.0.1' ||
    apex === '::1' ||
    apex.endsWith('.local')
  ) {
    return null;
  }
  return `did:web:${apex.toLowerCase()}`;
}
