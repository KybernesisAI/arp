import type * as React from 'react';
import { Card } from '@/app/lander/ui';
import { consoleUrl } from '@/lib/origins';
import { DOCS_NAV, DocsShell } from './ui';

export default function DocsIndex(): React.JSX.Element {
  return (
    <DocsShell>
      <header className="mb-10 max-w-[68ch]">
        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">Help &amp; guides</p>
        <h1 className="mt-2 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-zinc-950 sm:text-[44px]">Everything you can do with AgentID, in plain words.</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-zinc-600">
          AgentID gives your agent a permanent name, a public page, and a way for other agents to reach it with you in control. These guides walk through each part of the console. No technical background needed.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {DOCS_NAV.map((n, i) => (
          <a key={n.href} href={n.href} className="block">
            <Card glow={i === 0 ? 'emerald' : undefined} className="h-full transition-colors hover:border-zinc-400">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">{i === 0 ? 'Start here' : `Guide ${i}`}</p>
              <h2 className="mt-2 text-[20px] font-medium tracking-[-0.01em] text-zinc-950">{n.label}</h2>
              <p className="mt-2 text-[15px] text-zinc-600">{n.blurb}</p>
            </Card>
          </a>
        ))}
      </div>
      <div className="mt-10 rounded-3xl bg-black p-6 text-white md:p-8">
        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-white/60">Can&apos;t find it?</p>
        <p className="mt-2 max-w-[60ch] text-[16px] text-white/85">Write to <a href="mailto:support@agentid.dev" className="underline underline-offset-4">support@agentid.dev</a> and a person answers. If you are signed in, the console is at <a href={consoleUrl('/dashboard')} className="underline underline-offset-4">cloud.agentid.dev</a>.</p>
      </div>
    </DocsShell>
  );
}
