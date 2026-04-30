/**
 * Shared PostHog server-side client for the ARP Cloud app.
 *
 * Long-running server — no flushAt/flushInterval override; the SDK
 * batches and ships events automatically. Exception autocapture is
 * enabled. All configuration is driven by environment variables so no
 * secrets appear in source code.
 */

import { PostHog } from 'posthog-node';

const apiKey = process.env['NEXT_PUBLIC_POSTHOG_KEY'] ?? '';
const host = process.env['NEXT_PUBLIC_POSTHOG_HOST'];

export const posthog = new PostHog(apiKey, {
  ...(host ? { host } : {}),
  enableExceptionAutocapture: true,
});
