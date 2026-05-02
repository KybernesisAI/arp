/**
 * Shared PostHog server-side client for the ARP Cloud app.
 *
 * The cloud runs on Vercel serverless functions: each invocation lives
 * for the duration of one request (~100ms) and then the process exits.
 * The default posthog-node config batches events (flushAt=20 events
 * OR flushInterval=10s, whichever first) — both thresholds are far
 * past the function's lifetime, so events sit in memory and ship
 * never. Set flushAt=1 + flushInterval=0 to push every capture
 * immediately. Trade: more outbound HTTP per call, but events
 * actually arrive.
 *
 * Routes that capture events should also `await posthog.flush()`
 * (or shutdown) before returning, to guarantee the in-flight HTTP
 * completes before the function exits. flushAt=1 minimises the
 * window but the explicit flush is the belt-and-suspenders fix.
 */

import { PostHog } from 'posthog-node';
import { after } from 'next/server';

const apiKey = process.env['NEXT_PUBLIC_POSTHOG_KEY'] ?? '';
const host = process.env['NEXT_PUBLIC_POSTHOG_HOST'];

export const posthog = new PostHog(apiKey, {
  ...(host ? { host } : {}),
  flushAt: 1,
  flushInterval: 0,
  enableExceptionAutocapture: true,
});

/**
 * Capture an event AND keep the Vercel function alive long enough for
 * the HTTP request to PostHog to complete. Call this everywhere
 * instead of `posthog.capture()` directly — it's the only safe path
 * on serverless. Returns void; capture is fire-and-forget from the
 * caller's perspective.
 *
 * Mechanism: Next.js's `after()` (App Router) runs the callback after
 * the response is sent, with the function instance kept warm until
 * it returns. Without this, flushAt:1 still races against function
 * shutdown and ~30% of events get lost.
 *
 * `after()` itself throws when called outside a request scope (e.g.
 * unit/integration tests that import a route handler directly), so
 * the call is guarded — in test/script contexts we fall back to a
 * fire-and-forget flush so capture still works without leaking the
 * "outside request scope" error into every test that touches a route.
 */
export function track(input: Parameters<PostHog['capture']>[0]): void {
  posthog.capture(input);
  scheduleFlush();
}

/** Same pattern for identify. */
export function identify(input: Parameters<PostHog['identify']>[0]): void {
  posthog.identify(input);
  scheduleFlush();
}

function scheduleFlush(): void {
  try {
    after(async () => {
      try {
        await posthog.flush();
      } catch {
        /* never throw from after-hook; PostHog will retry on next call */
      }
    });
  } catch {
    posthog.flush().catch(() => {
      /* outside Next.js request scope (tests, scripts) — fire and forget */
    });
  }
}
