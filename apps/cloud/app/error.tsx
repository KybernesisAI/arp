'use client';

import type * as React from 'react';
import { SiteShell } from '@/components/app/SiteShell';
import { Kicker, PrimaryButton } from '@/app/lander/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const showDetails = process.env.NODE_ENV !== 'production';
  return (
    <SiteShell>
      <header className="max-w-[60ch]">
        <Kicker>Something went wrong</Kicker>
        <h1 className="mt-2 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-zinc-950 sm:text-[44px]">Sorry, that did not work.</h1>
        <p className="mt-4 text-[16px] text-zinc-600">
          We hit a problem showing this page. Nothing on your account changed. Try again, and if it keeps happening, let us know.
        </p>
      </header>
      {showDetails && (
        <div className="mt-6 max-w-[60ch] rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <Kicker>Development only</Kicker>
          <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[12px] text-zinc-800">{error.message}</pre>
          {error.digest && <div className="mt-2 font-mono text-[12px] text-zinc-500">digest · {error.digest}</div>}
        </div>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <PrimaryButton onClick={reset}>Try again</PrimaryButton>
        <a href="/dashboard" className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-[14px] font-medium text-zinc-900 transition hover:border-zinc-900">
          Back to the console
        </a>
        <a href="/support" className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-900">Support →</a>
      </div>
    </SiteShell>
  );
}
