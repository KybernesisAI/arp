import type * as React from 'react';
import { AppShell } from '@/components/app/AppShell';
import { ButtonLink, Link, PlateHead } from '@/components/ui';

export const dynamic = 'force-static';

export default function NotFound(): React.JSX.Element {
  return (
    <AppShell showMainActions={false}>
      <PlateHead
        plateNum="E.404"
        kicker="// STATUS · NOT FOUND"
        title="This page wasn't found."
      />
      <p className="max-w-2xl text-body text-ink-2">
        The URL you tried to open doesn't resolve to anything on ARP Cloud.
        If you followed a link, it may be stale — check the source and try
        again.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <ButtonLink href="/dashboard" variant="primary" arrow>
          Back to dashboard
        </ButtonLink>
        <Link href="/support" variant="mono">
          Contact support →
        </Link>
      </div>
    </AppShell>
  );
}
