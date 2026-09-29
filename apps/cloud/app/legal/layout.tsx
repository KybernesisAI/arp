// Layout wraps the legal pages in the public site chrome and adds a small
// row of links between the three documents. Metadata defaults to
// indexable; individual pages can opt out if needed.
import type { Metadata } from 'next';
import type * as React from 'react';
import { SiteShell } from '@/components/app/SiteShell';

export const metadata: Metadata = {
  title: { default: 'Legal · AgentID', template: '%s · AgentID' },
};

const LEGAL_NAV: Array<[string, string]> = [
  ['Overview', '/legal'],
  ['Terms', '/legal/terms'],
  ['Privacy', '/legal/privacy'],
  ['Data processing', '/legal/dpa'],
];

export default function LegalLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <SiteShell>
      <nav aria-label="Legal documents" className="mb-10 flex flex-wrap gap-6 font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">
        {LEGAL_NAV.map(([label, href]) => (
          <a key={href} href={href} className="hover:text-zinc-900">{label}</a>
        ))}
      </nav>
      <article className="space-y-8">{children}</article>
    </SiteShell>
  );
}
