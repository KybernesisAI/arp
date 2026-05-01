'use client';

/**
 * Client-side PostHog initializer.
 *
 * Mounted once at the root layout. On first render, calls posthog.init()
 * with the public project key + host from env. Capture defaults to
 * autocapture (clicks, form submits, pageleave) plus an explicit
 * $pageview on every Next.js route change.
 *
 * Server-side capture from API routes (lib/posthog.ts) covers
 * server-only events (provision, accept, revoke, etc.). The two layers
 * are wired to the same project key so events from both surfaces land
 * in the same project.
 */

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

let initialised = false;

function ensureInit(): void {
  if (initialised || typeof window === 'undefined') return;
  const key = process.env['NEXT_PUBLIC_POSTHOG_KEY'];
  const host = process.env['NEXT_PUBLIC_POSTHOG_HOST'];
  if (!key) return; // No-op when key missing — preserves dev/local quiet
  posthog.init(key, {
    ...(host ? { api_host: host } : {}),
    defaults: '2026-01-30',
    capture_pageview: false, // Manually fire pageviews on Next.js route change
    capture_pageleave: true,
    person_profiles: 'identified_only',
  });
  initialised = true;
}

export function PostHogProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    ensureInit();
  }, []);

  // Manual pageview on route change. Next.js doesn't fire route-change
  // events the SDK can hook into automatically, so we re-capture from
  // the (pathname, searchParams) tuple.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!initialised) return;
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams]);

  return <>{children}</>;
}
