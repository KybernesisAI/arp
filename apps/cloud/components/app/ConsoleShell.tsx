import type * as React from 'react';
import { LanderShell } from '@/app/lander/ui';
import { ConsoleLogout } from './ConsoleLogout';

/**
 * Signed-in console chrome in the lander's language: black top bar with the
 * AgentID mark, a few app links and Log out; white content; quiet footer.
 * Pages that still use the Swiss `AppShell` keep working; this shell is for
 * the surfaces being moved over, starting with the dashboard.
 */
export function ConsoleShell({ children, active }: { children: React.ReactNode; active?: 'agents' | 'connections' | 'pair' | 'billing' }): React.JSX.Element {
  const links: Array<[string, string, 'agents' | 'connections' | 'pair' | 'billing' | null]> = [
    ['Agents', '/dashboard', 'agents'],
    ['Connections', '/connections', 'connections'],
    ['Pair', '/pair', 'pair'],
    ['Billing', '/billing', 'billing'],
    ['Docs', 'https://arp.run', null],
  ];
  return (
    <LanderShell>
      <header className="bg-black text-white">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6">
          <a href="/dashboard" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
            <span className="inline-block h-4 w-4 rounded-[4px] bg-white" /> AgentID
          </a>
          <nav className="hidden items-center gap-7 text-[14px] md:flex">
            {links.map(([label, href, key]) => (
              <a key={href} href={href} className={key && key === active ? 'text-white' : 'text-white/60 hover:text-white'}>
                {label}
              </a>
            ))}
          </nav>
          <ConsoleLogout />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] px-6 py-10 lg:py-14">{children}</main>
      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-8 font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">
          <span>AgentID · by Kybernesis</span>
          <div className="flex flex-wrap gap-6">
            <a href="/legal/terms" className="hover:text-zinc-900">Terms</a>
            <a href="/legal/privacy" className="hover:text-zinc-900">Privacy</a>
            <a href="/support" className="hover:text-zinc-900">Support</a>
            <a href="https://status.arp.run" className="hover:text-zinc-900">Status</a>
          </div>
        </div>
      </footer>
    </LanderShell>
  );
}
