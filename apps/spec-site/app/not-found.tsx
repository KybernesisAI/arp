import Link from 'next/link';
import type * as React from 'react';

export const dynamic = 'force-static';

export default function NotFound(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-8 py-24">
      <div className="mb-3 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
        // E.404 · NOT FOUND
      </div>
      <h1 className="mb-6 font-display text-h1 text-ink">
        This page wasn't found.
      </h1>
      <p className="mb-8 max-w-xl font-sans text-body text-ink-2">
        The URL you tried to open doesn't resolve to anything on the ARP spec
        site. If you followed a link from outside, it may be stale — check the
        source and try again.
      </p>
      <div className="flex flex-wrap items-center gap-4 font-sans text-body-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-3 font-mono text-kicker uppercase tracking-[0.1em] text-paper no-underline transition-colors hover:bg-signal-blue hover:border-signal-blue"
        >
          Back to spec home →
        </Link>
        <Link
          href="https://cloud.arp.run/support"
          className="text-ink no-underline hover:opacity-60"
        >
          Contact support →
        </Link>
      </div>
    </div>
  );
}
