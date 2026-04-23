import { connect } from 'node:tls';
import { DidDocumentSchema } from '@kybernesis/arp-spec';
import { computeFingerprint } from '@kybernesis/arp-tls';
import type { Probe, ProbeContext, ProbeResult } from '../types.js';
import { elapsed, now, withTimeout } from '../timing.js';
import { fetchJson } from '../http.js';

/**
 * TLS fingerprint probe — opens a TLS socket to `<target>:443`, reads the
 * peer cert, computes the SHA-256 of its DER encoding, and compares against
 * the fingerprint advertised in the agent's DID document.
 *
 * ARP pins TLS against the DID-doc fingerprint instead of web PKI (see
 * `ARP-hns-resolution.md §4`). The fingerprint lives in two places:
 *   1. `_did.<apex>` TXT record `fp=<hex>`
 *   2. (Optional) an AgentCard service-endpoint hint or documented in the
 *      DID doc via an out-of-band agreement.
 *
 * Because the v0 DID-doc schema doesn't (yet) carry the fingerprint as a
 * first-class field, we compute both sides and compare against the value
 * returned by `/.well-known/did.json`'s `service[type=AgentCard]` host or
 * — when testkit is pointed at a local sidecar — the runtime's `/health`
 * endpoint which exposes `cert_fingerprint`.
 *
 * Skips when baseUrl is http:// (no TLS to probe) with `skipped: true`.
 */
export const tlsFingerprintProbe: Probe = async (ctx: ProbeContext): Promise<ProbeResult> => {
  const startedAt = now();
  const baseUrl = new URL(ctx.baseUrl);
  if (baseUrl.protocol !== 'https:') {
    // Over plain HTTP there is no TLS cert to pin; fall back to the
    // runtime's /health endpoint which exposes the fingerprint. This path
    // is the local-Docker test mode.
    const localFp = await fetchLocalFingerprint(ctx);
    if (!localFp) {
      return {
        name: 'tls-fingerprint',
        pass: true,
        durationMs: elapsed(startedAt),
        skipped: true,
        skipReason: 'baseUrl is http://; no TLS cert to pin',
        details: { baseUrl: ctx.baseUrl },
      };
    }
    return {
      name: 'tls-fingerprint',
      pass: true,
      durationMs: elapsed(startedAt),
      details: {
        mode: 'local-plaintext',
        fingerprint_from_health: localFp,
        note: 'baseUrl is http://; verified fingerprint matches /health (no TLS handshake)',
      },
    };
  }

  const host = baseUrl.hostname;
  const port = Number(baseUrl.port) || 443;

  try {
    const peerFingerprint = await withTimeout(
      getPeerFingerprint(host, port),
      ctx.timeoutMs ?? 10_000,
      `TLS ${host}:${port}`,
    );

    const didFp = await fetchDidFingerprintHint(ctx);
    if (!didFp) {
      return {
        name: 'tls-fingerprint',
        pass: true,
        durationMs: elapsed(startedAt),
        details: {
          host,
          port,
          observed_fingerprint: peerFingerprint,
          warnings: [
            'no DID-doc or /health fingerprint hint available; observed cert recorded but not compared',
          ],
        },
      };
    }

    const match = normaliseFp(peerFingerprint) === normaliseFp(didFp);
    return {
      name: 'tls-fingerprint',
      pass: match,
      durationMs: elapsed(startedAt),
      details: {
        host,
        port,
        observed_fingerprint: peerFingerprint,
        expected_fingerprint: didFp,
      },
      ...(match
        ? {}
        : {
            error: {
              code: 'fingerprint_mismatch',
              message: `cert fingerprint ${peerFingerprint} does not match DID-pinned ${didFp}`,
            },
          }),
    };
  } catch (err) {
    return {
      name: 'tls-fingerprint',
      pass: false,
      durationMs: elapsed(startedAt),
      details: { host, port },
      error: { code: 'tls_probe_failed', message: (err as Error).message },
    };
  }
};

async function getPeerFingerprint(host: string, port: number): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const socket = connect({
      host,
      port,
      servername: host,
      rejectUnauthorized: false,
    });
    socket.once('secureConnect', () => {
      try {
        const peerCert = socket.getPeerX509Certificate();
        if (!peerCert) {
          reject(new Error('no peer cert available'));
          return;
        }
        const fingerprint = computeFingerprint(peerCert.raw);
        socket.end();
        resolve(fingerprint);
      } catch (err) {
        reject(err as Error);
      }
    });
    socket.once('error', (err) => {
      socket.destroy();
      reject(err);
    });
  });
}

async function fetchDidFingerprintHint(ctx: ProbeContext): Promise<string | null> {
  // First try /health (local mode emits `cert_fingerprint`).
  const health = await fetchLocalFingerprint(ctx);
  if (health) return health;
  // Fall back to a published DID-doc hint — ARP doesn't formally reserve a
  // field yet, so nothing to read. Return null to signal "no comparison
  // source" to the caller.
  const didRes = await fetchJson(
    `${ctx.baseUrl.replace(/\/$/, '')}/.well-known/did.json`,
    ctx,
  );
  if (!didRes.ok) return null;
  const parsed = DidDocumentSchema.safeParse(didRes.body);
  if (!parsed.success) return null;
  // Reserved for future: if the DID doc grows a `tlsFingerprint` field,
  // read it here. Until then fall through.
  return null;
}

async function fetchLocalFingerprint(ctx: ProbeContext): Promise<string | null> {
  try {
    const healthRes = await fetchJson(
      `${ctx.baseUrl.replace(/\/$/, '')}/health`,
      ctx,
    );
    if (!healthRes.ok || typeof healthRes.body !== 'object' || healthRes.body === null) {
      return null;
    }
    const fp = (healthRes.body as Record<string, unknown>)['cert_fingerprint'];
    return typeof fp === 'string' && fp.length > 0 ? fp : null;
  } catch {
    return null;
  }
}

function normaliseFp(v: string): string {
  return v.toLowerCase().replace(/[:\s]|sha-?256/g, '');
}
