import type * as React from 'react';
import { LanderFooter, LanderNav, LanderShell } from '@/app/lander/ui';
import { consoleUrl } from '@/lib/origins';

/**
 * Customer docs (agentid.dev/docs) in the lander language. Written for
 * owners who are not technical: short pages, numbered steps, plain words.
 */

export const DOCS_NAV: Array<{ href: string; label: string; blurb: string }> = [
  { href: '/docs/getting-started', label: 'Getting started', blurb: 'What AgentID is and your first ten minutes.' },
  { href: '/docs/names', label: 'Your names', blurb: 'Claiming, renewing, verifying and giving a name.' },
  { href: '/docs/profile', label: 'Profile and public page', blurb: 'What people and other agents see.' },
  { href: '/docs/connect', label: 'Connecting your agent', blurb: 'Link the name to where your agent runs.' },
  { href: '/docs/pairing', label: 'Pairing two agents', blurb: 'Invite another agent to talk to yours.' },
  { href: '/docs/permissions', label: 'Connections and permissions', blurb: 'What each agent may do, and how to change it.' },
  { href: '/docs/account', label: 'Your account and devices', blurb: 'Sign-in, your key, the recovery phrase, adding a computer.' },
  { href: '/docs/billing', label: 'Billing', blurb: 'Prices, renewals, invoices.' },
  { href: '/docs/faq', label: 'Questions', blurb: 'The ones we get asked most.' },
];

export function DocsShell({ children, current }: { children: React.ReactNode; current?: string }): React.JSX.Element {
  return (
    <LanderShell>
      <LanderNav />
      <div className="mx-auto w-full max-w-[1200px] px-6 py-10 lg:py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <a href="/docs" className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-900">Help &amp; guides</a>
            <nav className="mt-4 flex flex-row flex-wrap gap-2 lg:flex-col lg:gap-0">
              {DOCS_NAV.map((n) => (
                <a key={n.href} href={n.href} className={`rounded-full px-3 py-1.5 text-[14px] lg:rounded-none lg:border-l-2 lg:px-4 lg:py-2 ${current === n.href ? 'bg-black text-white lg:border-black lg:bg-transparent lg:text-zinc-950 lg:font-medium' : 'border border-zinc-200 text-zinc-600 hover:text-zinc-950 lg:border-y-0 lg:border-r-0 lg:border-l-2 lg:border-zinc-200'}`}>
                  {n.label}
                </a>
              ))}
            </nav>
            <div className="mt-8 hidden lg:block">
              <a href={consoleUrl('/dashboard')} className="inline-flex rounded-full bg-black px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800">Open the console</a>
            </div>
          </aside>
          <main className="min-w-0">{children}</main>
        </div>
      </div>
      <LanderFooter />
    </LanderShell>
  );
}

export function DocTitle({ kicker, title, lead }: { kicker: string; title: string; lead: string }): React.JSX.Element {
  return (
    <header className="mb-10 max-w-[68ch]">
      <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">{kicker}</p>
      <h1 className="mt-2 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-zinc-950 sm:text-[44px]">{title}</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-zinc-600">{lead}</p>
    </header>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section id={id} className="mb-12 max-w-[68ch] scroll-mt-24">
      <h2 className="text-[22px] font-medium tracking-[-0.02em] text-zinc-950">{title}</h2>
      <div className="mt-3 space-y-4 text-[16px] leading-relaxed text-zinc-700">{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p>{children}</p>;
}

/** Numbered steps, one sentence or two each. */
export function Steps({ items }: { items: Array<React.ReactNode> }): React.JSX.Element {
  return (
    <ol className="space-y-3">
      {items.map((it, i) => (
        <li key={i} className="flex gap-4">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black font-mono text-[12px] text-white">{i + 1}</span>
          <div className="pt-0.5">{it}</div>
        </li>
      ))}
    </ol>
  );
}

export function Bullets({ items }: { items: Array<React.ReactNode> }): React.JSX.Element {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
          <div>{it}</div>
        </li>
      ))}
    </ul>
  );
}

export function Callout({ tone = 'note', title, children }: { tone?: 'note' | 'tip' | 'important'; title: string; children: React.ReactNode }): React.JSX.Element {
  const bar = tone === 'important' ? 'bg-amber-400' : tone === 'tip' ? 'bg-cyan-400' : 'bg-emerald-400';
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 p-5 pl-6">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">{title}</p>
      <div className="mt-2 text-[15px] leading-relaxed text-zinc-700">{children}</div>
    </div>
  );
}

/** A UI label as the user sees it on screen. */
export function UI({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-[14px] font-medium text-zinc-900">{children}</span>;
}

export function Where({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">Where: {children}</p>;
}

export function NextUp({ items }: { items: Array<{ href: string; label: string }> }): React.JSX.Element {
  return (
    <div className="mt-14 border-t border-zinc-200 pt-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">Next</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((i) => (
          <a key={i.href} href={i.href} className="rounded-full border border-zinc-300 px-4 py-2 text-[14px] text-zinc-900 hover:border-zinc-900">{i.label} →</a>
        ))}
      </div>
    </div>
  );
}

export function ConsoleLink({ path, children }: { path: string; children: React.ReactNode }): React.JSX.Element {
  return <a href={consoleUrl(path)} className="font-medium text-zinc-950 underline underline-offset-4">{children}</a>;
}
