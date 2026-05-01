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

const apiKey = process.env['NEXT_PUBLIC_POSTHOG_KEY'] ?? '';
const host = process.env['NEXT_PUBLIC_POSTHOG_HOST'];

export const posthog = new PostHog(apiKey, {
  ...(host ? { host } : {}),
  flushAt: 1,
  flushInterval: 0,
  enableExceptionAutocapture: true,
});
