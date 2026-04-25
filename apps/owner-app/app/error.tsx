'use client';

import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const showDetails = process.env.NODE_ENV !== 'production';
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-arp-muted">
        E.500 · UNEXPECTED FAILURE
      </div>
      <h1 className="mb-4 text-2xl font-semibold">Something went wrong.</h1>
      <p className="mb-6 max-w-xl text-sm text-arp-muted">
        We hit an error rendering this page. The event has been logged. Try
        again — if it persists, reach out via the support link below.
      </p>
      {showDetails && (
        <div className="card mb-6">
          <div className="mb-1 text-xs uppercase tracking-wide text-arp-muted">
            DEV-ONLY DIAGNOSTIC
          </div>
          <pre className="whitespace-pre-wrap break-all text-xs text-arp-text">
            {error.message}
          </pre>
          {error.digest && (
            <div className="mt-2 text-xs text-arp-muted">
              digest · {error.digest}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" type="button" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="btn no-underline">
          Back to connections
        </Link>
        <Link
          href="https://cloud.arp.run/support"
          className="text-sm no-underline"
        >
          Contact support →
        </Link>
      </div>
    </div>
  );
}
