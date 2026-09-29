import type * as React from 'react';
import { LanderFooter, LanderNav, LanderShell } from '@/app/lander/ui';
import { siteUrl } from '@/lib/origins';

/**
 * Public page chrome in the lander language (legal, support, not-found):
 * the black AgentID bar with the site's section links, white content in the
 * same 1200px column the console uses, the quiet footer. These pages are
 * served on every host, so the nav links point at the site by absolute URL.
 */
export function SiteShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <LanderShell>
      <LanderNav links={SITE_LINKS} />
      <main className="mx-auto w-full max-w-[1200px] px-6 py-10 lg:py-14">{children}</main>
      <LanderFooter />
    </LanderShell>
  );
}

const SITE_LINKS: Array<[string, string]> = [
  ['How it works', siteUrl('/#how')],
  ['What you get', siteUrl('/#get')],
  ['Pricing', siteUrl('/#pricing')],
  ['FAQ', siteUrl('/#faq')],
];
