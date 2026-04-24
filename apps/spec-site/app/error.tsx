'use client';

import Link from 'next/link';
import type * as React from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const showDetails = process.env.NODE_ENV !== 'production';
  return (
    <div className="mx-auto max-w-3xl px-8 py-24">
      <div className="mb-3 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
        // E.500 · UNEXPECTED FAILURE
      </div>
      <h1 className="mb-6 font-display text-h1 text-ink">
        Something went wrong.
      </h1>
      <p className="mb-8 max-w-xl font-sans text-body text-ink-2">
        We hit an error rendering this page. The event has been logged. Try
        again — if it keeps failing, reach out via the support link below.
      </p>
      {showDetails && (
        <div className="mb-8 max-w-2xl border border-rule bg-paper-2 p-4">
          <div className="mb-2 font-mono text-kicker uppercase text-muted">
            // DEV-ONLY DIAGNOSTIC
          </div>
          <pre className="whitespace-pre-wrap break-all font-mono text-body-sm text-ink">
            {error.message}
          </pre>
          {error.digest && (
            <div className="mt-2 font-mono text-body-sm text-muted">
              digest · {error.digest}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 font-sans text-body-sm">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-3 font-mono text-kicker uppercase tracking-[0.1em] text-paper transition-colors hover:bg-signal-blue hover:border-signal-blue"
        >
          Try again
        </button>
        <Link href="/" className="text-ink no-underline hover:opacity-60">
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
