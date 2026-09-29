import type * as React from 'react';
import { SiteShell } from '@/components/app/SiteShell';
import { Kicker, PrimaryLink } from '@/app/lander/ui';
import { consoleUrl, siteUrl } from '@/lib/origins';

export const dynamic = 'force-static';

export default function NotFound(): React.JSX.Element {
  return (
    <SiteShell>
      <header className="max-w-[60ch]">
        <Kicker>Not found</Kicker>
        <h1 className="mt-2 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-zinc-950 sm:text-[44px]">This page does not exist.</h1>
        <p className="mt-4 text-[16px] text-zinc-600">
          If you followed a link, it may be out of date. Check where it came from and try again.
        </p>
      </header>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <PrimaryLink href={siteUrl('/')}>Go to AgentID</PrimaryLink>
        <a href={consoleUrl('/dashboard')} className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-[14px] font-medium text-zinc-900 transition hover:border-zinc-900">
          Open the console
        </a>
        <a href="/support" className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-900">Support →</a>
      </div>
    </SiteShell>
  );
}
