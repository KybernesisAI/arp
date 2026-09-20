import type * as React from 'react';

/**
 * Shared building blocks for the AgentID lander family (`/lander`, the public
 * agent profile at `agent.arp.run/<sld>`): Inter + Space Mono, black hero,
 * black-on-white bento sections, emerald = identity/verified, cyan = reach.
 */

export const CLAIM = 'https://cloud.arp.run/dashboard';
export const LOGIN = 'https://cloud.arp.run/onboarding';

/** Page root: fonts, Space Mono for every mono label, white canvas. */
export function LanderShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="lander min-h-screen bg-white text-zinc-950 antialiased" style={{ fontFamily: 'Inter, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif' }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Mono&display=swap" />
      {/* Every mono label on this page is Space Mono (regular only — the 700 face substitutes badly). */}
      <style>{`.lander .font-mono{font-family:'Space Mono',ui-monospace,monospace;font-weight:400}`}</style>
      {children}
    </div>
  );
}

export function LanderNav({ links = DEFAULT_LINKS }: { links?: Array<[string, string]> }): React.JSX.Element {
  return (
    <header className="bg-black text-white">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6">
        <a href="/lander" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
          <span className="inline-block h-4 w-4 rounded-[4px] bg-white" /> AgentID
        </a>
        <nav className="hidden items-center gap-7 text-[14px] text-white/70 md:flex">
          {links.map(([label, href]) => <a key={href} href={href} className="hover:text-white">{label}</a>)}
        </nav>
        <div className="flex items-center gap-3">
          <a href={LOGIN} className="hidden text-[14px] text-white/70 hover:text-white sm:inline">Log in</a>
          <a href={CLAIM} className="rounded-full bg-white px-4 py-2 text-[14px] font-medium text-black hover:bg-zinc-200">Claim a name</a>
        </div>
      </div>
    </header>
  );
}
const DEFAULT_LINKS: Array<[string, string]> = [
  ['How it works', '/lander#how'],
  ['What you get', '/lander#get'],
  ['Add-ons', '/lander#addons'],
  ['Pricing', '/lander#pricing'],
  ['FAQ', '/lander#faq'],
];

export function LanderFooter(): React.JSX.Element {
  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-8 font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">
        <span>AgentID · by Kybernesis</span>
        <div className="flex flex-wrap gap-6">
          <a href="https://cloud.arp.run/terms" className="hover:text-zinc-900">Terms</a>
          <a href="https://cloud.arp.run/privacy" className="hover:text-zinc-900">Privacy</a>
          <a href="https://cloud.arp.run/support" className="hover:text-zinc-900">Support</a>
          <a href="https://spec.arp.run" className="hover:text-zinc-900">Open protocol</a>
        </div>
      </div>
    </footer>
  );
}

export function Kicker({ children, className = '' }: { children: React.ReactNode; className?: string }): React.JSX.Element {
  return <div className={`font-mono text-[12px] uppercase tracking-[0.16em] text-zinc-500 ${className}`}>{children}</div>;
}

export type TagTone = 'zinc' | 'emerald' | 'cyan' | 'dark';
export function Tag({ children, tone = 'zinc' }: { children: React.ReactNode; tone?: TagTone }): React.JSX.Element {
  const cls =
    tone === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' :
    tone === 'cyan' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700' :
    tone === 'dark' ? 'border-white/15 bg-white/[0.06] text-white/80' :
    'border-zinc-200 bg-zinc-50 text-zinc-600';
  const dot = tone === 'emerald' ? 'bg-emerald-500' : tone === 'cyan' ? 'bg-cyan-500' : null;
  return <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] ${cls}`}>{dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}{children}</span>;
}

/** Hero-side pill (on black). Emerald when the fact holds, muted when it is still pending. */
export function HeroPill({ children, on = true }: { children: React.ReactNode; on?: boolean }): React.JSX.Element {
  return on ? (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3.5 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{children}
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-white/50">
      <span className="h-1.5 w-1.5 rounded-full bg-white/30" />{children}
    </span>
  );
}

export function H2({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h2 className="mt-3 max-w-[22ch] text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-zinc-950 sm:text-[44px]">{children}</h2>;
}
export function Lead({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-zinc-600">{children}</p>;
}

/** Bento tile: white card, hairline border, soft hover lift, optional accent glow in a corner. */
export function Card({ children, className = '', glow }: { children: React.ReactNode; className?: string; glow?: 'emerald' | 'cyan' }): React.JSX.Element {
  const g = glow === 'emerald' ? 'bg-emerald-400/20' : glow === 'cyan' ? 'bg-cyan-400/20' : '';
  return (
    <div className={`group relative overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-[0_1px_0_rgba(0,0,0,0.03)] transition-shadow duration-300 hover:shadow-[0_24px_60px_-40px_rgba(0,0,0,0.35)] ${className}`}>
      {glow && <div className={`pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full ${g} blur-3xl transition-opacity duration-300 opacity-0 group-hover:opacity-100`} />}
      <div className="relative h-full">{children}</div>
    </div>
  );
}

export function CheckItem({ children, tone = 'emerald' }: { children: React.ReactNode; tone?: 'emerald' | 'cyan' | 'light' }): React.JSX.Element {
  const c = tone === 'cyan' ? 'bg-cyan-500' : tone === 'light' ? 'bg-emerald-400' : 'bg-emerald-500';
  return (
    <li className="flex items-start gap-2.5">
      <span className={`mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${c}`}><svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5.2l2 2 4-4.4" /></svg></span>
      <span>{children}</span>
    </li>
  );
}

/** Small state chip used in record rows: verified (emerald), reachable (cyan), pending (muted). */
export function StateChip({ state }: { state: 'verified' | 'live' | 'pending' }): React.JSX.Element {
  if (state === 'pending') return <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">pending</span>;
  const cyan = state === 'live';
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] ${cyan ? 'text-cyan-700' : 'text-emerald-700'}`}>
      <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ${cyan ? 'bg-cyan-500' : 'bg-emerald-500'}`}><svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5.2l2 2 4-4.4" /></svg></span>
      {state}
    </span>
  );
}
