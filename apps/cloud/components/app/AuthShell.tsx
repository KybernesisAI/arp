import type * as React from 'react';
import { LanderShell } from '@/app/lander/ui';
import '@/app/console-theme.css';

/**
 * Signed-out chrome (log in, create account) in the lander language: the
 * black bar with the AgentID mark and one link to the other door; white
 * content; the same quiet footer the console uses.
 */
export function AuthShell({ children, other }: { children: React.ReactNode; other: { label: string; href: string } }): React.JSX.Element {
  return (
    <LanderShell>
      <header className="bg-black text-white">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6">
          <a href="/lander" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
            <span className="inline-block h-4 w-4 rounded-[4px] bg-white" /> AgentID
          </a>
          <a href={other.href} className="rounded-full border border-white/20 px-4 py-2 text-[14px] text-white/80 hover:border-white hover:text-white">{other.label}</a>
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
          </div>
        </div>
      </footer>
    </LanderShell>
  );
}
