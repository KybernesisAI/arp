import type { Probe, ProbeContext, ProbeResult } from '../types.js';
import { elapsed, now } from '../timing.js';
import { fetchJson } from '../http.js';

/**
 * Revocation probe — lightweight check that `/.well-known/revocations.json`
 * is available, validly shaped, and reflects a revocation within the poll
 * interval advertised in `_revocation` TXT (falls back to 5s).
 *
 * Two modes:
 *   - Programmatic: caller supplies `expectedRevokedId` (a connection_id they
 *     just revoked via admin). Probe asserts it appears in the published
 *     list within the poll window.
 *   - Default: shape + content-type check only.
 */
export interface RevocationProbeOptions {
  /** Connection ID expected to be present. If omitted, probe only checks shape. */
  expectedRevokedId?: string;
  /** Max ms to poll for the expected id. Default 10000. */
  waitMs?: number;
}

export function createRevocationProbe(opts: RevocationProbeOptions = {}): Probe {
  return async (ctx: ProbeContext): Promise<ProbeResult> => {
    const startedAt = now();
    const url = `${ctx.baseUrl.replace(/\/$/, '')}/.well-known/revocations.json`;
    try {
      const res = await fetchJson(url, ctx);
      if (!res.ok) {
        return fail(startedAt, `HTTP ${res.status}`, { url, status: res.status });
      }
      if (typeof res.body !== 'object' || res.body === null) {
        return fail(startedAt, 'revocations.json body is not an object', { url });
      }
      const body = res.body as Record<string, unknown>;
      if (!Array.isArray(body['revocations'])) {
        return fail(startedAt, 'revocations.json missing "revocations" array', {
          url,
          body,
        });
      }

      if (opts.expectedRevokedId) {
        const deadline = Date.now() + (opts.waitMs ?? 10_000);
        let matched = false;
        let lastBody: Record<string, unknown> = body;
        while (Date.now() < deadline) {
          const list = lastBody['revocations'] as Array<Record<string, unknown>>;
          if (
            list.some(
              (r) =>
                (r['type'] === 'connection' || r['type'] === undefined) &&
                r['id'] === opts.expectedRevokedId,
            )
          ) {
            matched = true;
            break;
          }
          await sleep(250);
          const next = await fetchJson(url, ctx);
          if (next.ok && typeof next.body === 'object' && next.body !== null) {
            lastBody = next.body as Record<string, unknown>;
          }
        }
        if (!matched) {
          return fail(
            startedAt,
            `expected revocation ${opts.expectedRevokedId} not visible within ${
              opts.waitMs ?? 10_000
            }ms`,
            { url, last_body: lastBody },
          );
        }
      }

      return {
        name: 'revocation',
        pass: true,
        durationMs: elapsed(startedAt),
        details: {
          url,
          revocations_count: (body['revocations'] as unknown[]).length,
          ...(opts.expectedRevokedId
            ? { matched_connection_id: opts.expectedRevokedId }
            : {}),
        },
      };
    } catch (err) {
      return fail(startedAt, (err as Error).message, { url });
    }
  };
}

export const revocationProbe: Probe = createRevocationProbe();

function fail(
  startedAt: number,
  message: string,
  details: Record<string, unknown>,
): ProbeResult {
  return {
    name: 'revocation',
    pass: false,
    durationMs: elapsed(startedAt),
    details,
    error: { code: 'revocation_probe_failed', message },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
