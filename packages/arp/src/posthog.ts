/**
 * PostHog client for the arpc CLI.
 *
 * The CLI is short-lived, so flushAt=1 and flushInterval=0 ensure events
 * ship immediately. Disabled when POSTHOG_KEY is unset so CI and users
 * without a key stay quiet.
 */

import { PostHog } from 'posthog-node';

const key = process.env['POSTHOG_KEY'] ?? process.env['NEXT_PUBLIC_POSTHOG_KEY'] ?? '';
const host = process.env['POSTHOG_HOST'] ?? process.env['NEXT_PUBLIC_POSTHOG_HOST'];

export const posthog: PostHog = new PostHog(key || 'disabled', {
  ...(host ? { host } : {}),
  flushAt: 1,
  flushInterval: 0,
  enableExceptionAutocapture: true,
  disabled: !key,
});

export async function shutdownPosthog(): Promise<void> {
  await posthog.shutdown();
}
