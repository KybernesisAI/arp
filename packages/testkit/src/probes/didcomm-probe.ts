import { randomUUID } from 'node:crypto';
import * as ed25519 from '@noble/ed25519';
import { signEnvelope } from '@kybernesis/arp-transport';
import type { Probe, ProbeContext, ProbeResult } from '../types.js';
import { elapsed, now, withTimeout } from '../timing.js';

/**
 * DIDComm probe — verifies that the `/didcomm` endpoint:
 *   1. Accepts `application/didcomm-signed+json` POSTs.
 *   2. Parses and signature-verifies the JWS.
 *   3. Rejects envelopes from unknown peers with an `unknown_peer` error.
 *
 * Proof-of-liveness works WITHOUT pre-registration: we sign an envelope
 * with a fresh Ed25519 key under a throwaway `did:web:*-probe.local` DID,
 * POST it, and assert the peer responds with a structured 400 JSON whose
 * `error.code === 'unknown_peer'`. That demonstrates:
 *   - endpoint is alive,
 *   - JWS shape is accepted,
 *   - the runtime resolves peers (fails with unknown_peer rather than
 *     swallowing the request),
 *   - the signature verifier ran (otherwise we'd see invalid_envelope).
 *
 * For a full signed-ack round trip, the caller injects `preregisteredDid` +
 * `preregisteredKey` in the context (not yet wired into ProbeContext's
 * public API — probe-level option only; integration tests set it
 * directly).
 */
export interface DidCommProbeOptions {
  /**
   * If provided, the probe uses this DID (must be pre-trusted by the peer's
   * resolver) and expects a 200 JSON ack instead of 400 unknown_peer.
   */
  preregisteredDid?: string;
  preregisteredPrivateKey?: Uint8Array;
}

export function createDidCommProbe(opts: DidCommProbeOptions = {}): Probe {
  return async (ctx: ProbeContext): Promise<ProbeResult> => {
    const startedAt = now();
    const endpoint = `${ctx.baseUrl.replace(/\/$/, '')}/didcomm`;
    const fetchImpl = ctx.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl) {
      return fail(startedAt, 'no fetch implementation available', { endpoint });
    }

    const signerDid = opts.preregisteredDid ?? `did:web:testkit-probe-${randomUUID().slice(0, 8)}.local`;
    const privateKey = opts.preregisteredPrivateKey ?? ed25519.utils.randomPrivateKey();

    try {
      const envelope = await signEnvelope({
        message: {
          id: `ping-${randomUUID()}`,
          type: 'https://didcomm.org/trust-ping/2.0/ping',
          from: signerDid,
          to: ['did:web:peer'],
          body: { response_requested: true },
        },
        signerDid,
        privateKey,
      });

      const res = await withTimeout(
        fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/didcomm-signed+json',
          },
          body: envelope.compact,
        }),
        ctx.timeoutMs ?? 5_000,
        `POST ${endpoint}`,
      );
      const rawText = await res.text();
      let body: Record<string, unknown> = {};
      try {
        body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        return fail(startedAt, `response body is not JSON: ${rawText.slice(0, 200)}`, {
          endpoint,
          status: res.status,
        });
      }

      if (opts.preregisteredDid) {
        if (res.status === 200 && body['ok'] === true && typeof body['msg_id'] === 'string') {
          return {
            name: 'didcomm-probe',
            pass: true,
            durationMs: elapsed(startedAt),
            details: {
              endpoint,
              mode: 'preregistered',
              status: res.status,
              msg_id: body['msg_id'],
            },
          };
        }
        return fail(startedAt, `preregistered ping not acked: HTTP ${res.status} ${rawText}`, {
          endpoint,
          status: res.status,
          body,
        });
      }

      // Unknown-signer path (default): expect 400 + unknown_peer.
      const err = body['error'] as { code?: string; message?: string } | undefined;
      const code = err?.code;
      if (res.status === 400 && code === 'unknown_peer') {
        return {
          name: 'didcomm-probe',
          pass: true,
          durationMs: elapsed(startedAt),
          details: {
            endpoint,
            mode: 'unknown-signer',
            status: res.status,
            observed_error_code: code,
          },
        };
      }

      return fail(
        startedAt,
        `expected 400/unknown_peer, got ${res.status} ${rawText.slice(0, 200)}`,
        {
          endpoint,
          status: res.status,
          body,
        },
      );
    } catch (err) {
      return fail(startedAt, (err as Error).message, { endpoint });
    }
  };
}

export const didCommProbe: Probe = createDidCommProbe();

function fail(
  startedAt: number,
  message: string,
  details: Record<string, unknown>,
): ProbeResult {
  return {
    name: 'didcomm-probe',
    pass: false,
    durationMs: elapsed(startedAt),
    details,
    error: { code: 'didcomm_probe_failed', message },
  };
}
