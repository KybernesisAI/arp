/**
 * DB-backed fixed-window rate limiter.
 *
 * Intentionally simple: each {bucket, window} pair maps to a single row in
 * `rate_limit_hits`. We hash bucket + window-start into the `bucket` column,
 * then issue an INSERT … ON CONFLICT DO UPDATE SET hits = hits + 1. The row
 * returned tells us the new hit count and whether the caller has exceeded
 * the limit; the caller returns 429 + Retry-After if so.
 *
 * Fixed windows (not sliding) is the right trade at launch: simpler to
 * reason about, no extra storage, and a ~1.5× burst at window boundaries is
 * acceptable for what we're protecting (onboarding, registrar callback, mobile
 * push-token registration, DID-doc read). Slice 9d or later can swap for a
 * sliding window if the burst edge case starts mattering.
 *
 * Cleanup: each successful check has a 1/1000 chance of sweeping expired
 * windows (`window_end < now() - 1 hour`). Zero cron dependency.
 */

import { sql } from 'drizzle-orm';
import { rateLimitHits } from '@kybernesis/arp-cloud-db';
import { getDb } from './db';

export interface RateLimitOpts {
  /** Bucket root, e.g. `onboard:ip:1.2.3.4`. Window suffix is appended internally. */
  bucket: string;
  /** Window size in seconds (e.g. 60 for 1-minute burst). */
  windowSeconds: number;
  /** Max hits within a single window. */
  limit: number;
}

export type RateLimitResult =
  | { ok: true; remaining: number; retryAfter: number }
  | { ok: false; retryAfter: number };

const HOUR_MS = 60 * 60 * 1000;

/**
 * Check a rate-limit bucket. Increments the counter and returns `{ ok: false }`
 * once the caller has exceeded the configured limit within the current
 * window. `retryAfter` is expressed in whole seconds (consumer-friendly for
 * the `Retry-After` HTTP header).
 */
export async function checkRateLimit(opts: RateLimitOpts): Promise<RateLimitResult> {
  const db = await getDb();
  const nowMs = Date.now();
  const windowMs = opts.windowSeconds * 1000;
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  const windowEndMs = windowStartMs + windowMs;
  const bucketKey = `${opts.bucket}@${windowStartMs}`;

  // Atomic upsert: on conflict, bump hits by 1. The returning clause gives
  // us the new value so we can decide pass/fail in a single round-trip.
  const rows = await db
    .insert(rateLimitHits)
    .values({
      bucket: bucketKey,
      hits: 1,
      windowStart: new Date(windowStartMs),
      windowEnd: new Date(windowEndMs),
    })
    .onConflictDoUpdate({
      target: rateLimitHits.bucket,
      set: { hits: sql`${rateLimitHits.hits} + 1` },
    })
    .returning({ hits: rateLimitHits.hits });

  const row = rows[0];
  const hits = row?.hits ?? 1;
  const retryAfterSec = Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000));

  // Opportunistic cleanup — ~0.1% of requests sweep expired rows.
  if (Math.random() < 0.001) {
    void db
      .delete(rateLimitHits)
      .where(sql`${rateLimitHits.windowEnd} < ${new Date(nowMs - HOUR_MS)}`)
      .catch(() => {
        // Cleanup is best-effort; failures here must never affect the
        // request path.
      });
  }

  if (hits > opts.limit) {
    return { ok: false, retryAfter: retryAfterSec };
  }
  return {
    ok: true,
    remaining: Math.max(0, opts.limit - hits),
    retryAfter: retryAfterSec,
  };
}

/**
 * Check two limits at once — typical use-case is burst (e.g. 10/min) + sustained
 * (e.g. 100/hour). Returns the first limit that fails; both checks run so each
 * is incremented whether or not the other passes (accurate accounting).
 */
export async function checkDualRateLimit(
  bucketRoot: string,
  burst: { windowSeconds: number; limit: number },
  sustained: { windowSeconds: number; limit: number },
): Promise<RateLimitResult> {
  const [burstResult, sustainedResult] = await Promise.all([
    checkRateLimit({
      bucket: `${bucketRoot}:burst`,
      windowSeconds: burst.windowSeconds,
      limit: burst.limit,
    }),
    checkRateLimit({
      bucket: `${bucketRoot}:sustained`,
      windowSeconds: sustained.windowSeconds,
      limit: sustained.limit,
    }),
  ]);

  if (!burstResult.ok) return burstResult;
  if (!sustainedResult.ok) return sustainedResult;
  return burstResult;
}

/**
 * Extract the client IP from a Next.js request. Prefers the first value in
 * `x-forwarded-for` (Vercel sets this to the real client IP on the edge),
 * falls back to `x-real-ip`, then `unknown`.
 *
 * Never use the raw Host header for rate-limit keying — the caller controls
 * it and can spray it. `x-forwarded-for` is set by Vercel's edge layer on
 * every production request.
 */
export function clientIpFromRequest(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

/**
 * Standard 429 response with `Retry-After` header + structured body. Shared
 * by every route that rate-limits.
 */
export function rateLimitedResponse(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({ error: 'rate_limited', retry_after_seconds: retryAfterSec }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(retryAfterSec),
      },
    },
  );
}
