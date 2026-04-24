'use client';

import type * as React from 'react';
import { AppShell } from '@/components/app/AppShell';
import { Button, ButtonLink, Code, Link, PlateHead } from '@/components/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const showDetails = process.env.NODE_ENV !== 'production';
  return (
    <AppShell showMainActions={false}>
      <PlateHead
        plateNum="E.500"
        kicker="// STATUS · UNEXPECTED FAILURE"
        title="Something went wrong."
      />
      <p className="max-w-2xl text-body text-ink-2">
        We hit an error rendering this page. The event has been logged. Try
        again — if it persists, reach out via the support link below.
      </p>
      {showDetails && (
        <div className="mt-6 max-w-2xl border border-rule bg-paper-2 p-4">
          <div className="font-mono text-kicker uppercase text-muted">
            // DEV-ONLY DIAGNOSTIC
          </div>
          <Code className="mt-2 block whitespace-pre-wrap break-all text-[12px]">
            {error.message}
          </Code>
          {error.digest && (
            <div className="mt-2 font-mono text-body-sm text-muted">
              digest · {error.digest}
            </div>
          )}
        </div>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button variant="primary" arrow onClick={reset}>
          Try again
        </Button>
        <ButtonLink href="/dashboard" variant="default">
          Back to dashboard
        </ButtonLink>
        <Link href="/support" variant="mono">
          Contact support →
        </Link>
      </div>
    </AppShell>
  );
}
