import type { Metadata } from 'next';
import type * as React from 'react';
import { Card, Kicker } from '@/app/lander/ui';

export const metadata: Metadata = {
  title: 'Legal · AgentID',
  description: 'Terms of service, privacy policy and data processing addendum for AgentID.',
};

const DOCS: Array<{ href: string; title: string; blurb: string }> = [
  { href: '/legal/terms', title: 'Terms of Service', blurb: 'The agreement between you and Kybernesis when you use AgentID.' },
  { href: '/legal/privacy', title: 'Privacy Policy', blurb: 'What we collect, what we never collect, and how long we keep it.' },
  { href: '/legal/dpa', title: 'Data Processing Addendum', blurb: 'For customers who need processor terms, subprocessors and audit rights.' },
];

export default function LegalIndex(): React.JSX.Element {
  return (
    <>
      <header className="max-w-[72ch]">
        <Kicker>Legal</Kicker>
        <h1 className="mt-2 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-zinc-950 sm:text-[44px]">The fine print.</h1>
        <p className="mt-4 text-[16px] text-zinc-600">Three documents, written to be read. Questions go to legal@agentid.dev.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {DOCS.map((d) => (
          <a key={d.href} href={d.href} className="block">
            <Card className="h-full">
              <h2 className="text-[20px] font-medium leading-[1.15] tracking-[-0.015em] text-zinc-950">{d.title}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">{d.blurb}</p>
              <span className="mt-auto pt-6 font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">Read →</span>
            </Card>
          </a>
        ))}
      </div>
    </>
  );
}
