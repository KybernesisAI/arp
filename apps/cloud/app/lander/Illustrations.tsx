import type * as React from 'react';

/**
 * Decorative, self-contained illustrations for the AgentID lander bento cards.
 * Pure markup + Tailwind + inline SVG so they render in a server component,
 * need no assets, and stay crisp at any size. Emerald = identity / verified,
 * cyan = reach / motion. Nothing here is interactive.
 */

const MONO = 'font-mono text-[11px] uppercase tracking-[0.14em]';

export function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }): React.JSX.Element {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50 ${className}`}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.035)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_85%)]" />
      {children}
    </div>
  );
}

function Check({ tone = 'emerald', className = '' }: { tone?: 'emerald' | 'cyan'; className?: string }): React.JSX.Element {
  const c = tone === 'emerald' ? 'bg-emerald-500' : 'bg-cyan-500';
  return (
    <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${c} ${className}`}>
      <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5.2l2 2 4-4.4" /></svg>
    </span>
  );
}

export function NameChip({ name, className = '' }: { name: string; className?: string }): React.JSX.Element {
  return (
    <span className={`inline-flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-4 py-2 shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.25)] ${className}`}>
      <Check />
      <span className="font-mono text-[15px] tracking-[-0.01em] text-zinc-900">{name}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- What you get */

export function NameArt(): React.JSX.Element {
  return (
    <Panel className="h-full min-h-[220px]">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-400/25 blur-3xl" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative">
          <span className="absolute -left-6 -top-9 rotate-[-6deg] rounded-full border border-zinc-200 bg-white/70 px-4 py-2 font-mono text-[13px] text-zinc-300 blur-[0.3px]">samantha.agent</span>
          <span className="absolute -right-8 top-11 rotate-[5deg] rounded-full border border-zinc-200 bg-white/70 px-4 py-2 font-mono text-[13px] text-zinc-300">samantha.agent</span>
          <NameChip name="samantha.agent" className="relative z-[1] scale-110" />
        </div>
      </div>
      <div className={`absolute bottom-4 left-5 flex items-center gap-2 ${MONO} text-zinc-500`}>
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> registered · renews on your terms
      </div>
    </Panel>
  );
}

export function ProfileArt(): React.JSX.Element {
  return (
    <Panel className="h-[180px]">
      <div className="absolute left-5 right-5 top-5 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-3">
          <span className="h-9 w-9 rounded-full bg-[conic-gradient(from_200deg,#10b981,#22d3ee,#10b981)]" />
          <div className="flex-1">
            <div className="font-mono text-[13px] text-zinc-900">samantha.agent</div>
            <div className={`mt-1 flex items-center gap-1.5 ${MONO} text-emerald-600`}>
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>
              online
            </div>
          </div>
          <span className="rounded-full bg-black px-3 py-1 text-[11px] font-medium text-white">Connect</span>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-2 w-[86%] rounded bg-zinc-100" />
          <div className="h-2 w-[64%] rounded bg-zinc-100" />
        </div>
      </div>
    </Panel>
  );
}

export function LinksArt(): React.JSX.Element {
  return (
    <Panel className="h-[180px]">
      <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" fill="none">
        <path d="M160 92 L58 44" stroke="#10b981" strokeWidth="1.5" />
        <path d="M160 92 L262 44" stroke="#10b981" strokeWidth="1.5" />
        <path d="M160 92 L160 150" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4 4" />
        <circle cx="160" cy="92" r="26" fill="white" stroke="#e4e4e7" />
        <circle cx="160" cy="92" r="6" fill="#0a0a0a" />
      </svg>
      <span className={`absolute left-5 top-6 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 ${MONO} text-zinc-700`}><Check className="h-3.5 w-3.5" /> workspace</span>
      <span className={`absolute right-5 top-6 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 ${MONO} text-zinc-700`}><Check className="h-3.5 w-3.5" /> control plane</span>
      <span className={`absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 ${MONO} text-zinc-700`}><Check tone="cyan" className="h-3.5 w-3.5" /> endpoint</span>
    </Panel>
  );
}

export function ReachArt(): React.JSX.Element {
  return (
    <Panel className="h-[180px]">
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {[220, 160, 100].map((d, i) => (
          <span key={d} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/40" style={{ width: d, height: d, opacity: 0.9 - i * 0.2 }} />
        ))}
        <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black ring-4 ring-white" />
        <span className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border border-cyan-400/60 [animation-duration:2.4s]" />
      </div>
      <span className={`absolute left-6 top-7 rounded-full border border-zinc-200 bg-white px-2.5 py-1 ${MONO} text-zinc-700`}>atlas.agent</span>
      <span className={`absolute bottom-7 right-6 rounded-full border border-cyan-400/50 bg-cyan-50 px-2.5 py-1 ${MONO} text-cyan-700`}>knock → approved</span>
    </Panel>
  );
}

export function PortableArt(): React.JSX.Element {
  return (
    <Panel className="h-[180px]">
      <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" fill="none">
        <path d="M70 128 C 110 60, 210 60, 250 128" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="5 5" />
        <path d="M244 118 L252 129 L239 131" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="absolute inset-x-6 bottom-6 flex items-end justify-between">
        <div className="flex flex-col items-center gap-2">
          <span className="h-10 w-16 rounded-lg border border-zinc-200 bg-white/70 [background-image:repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,0.04)_6px,rgba(0,0,0,0.04)_7px)]" />
          <span className={`${MONO} text-zinc-400 line-through`}>old host</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="h-10 w-16 rounded-lg border border-emerald-400/50 bg-white shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
          <span className={`${MONO} text-zinc-700`}>new host</span>
        </div>
      </div>
      <NameChip name="samantha.agent" className="absolute left-1/2 top-6 -translate-x-1/2 scale-90" />
    </Panel>
  );
}

export function KeysArt(): React.JSX.Element {
  return (
    <Panel className="h-full min-h-[200px]">
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="absolute left-5 top-5 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.3)]">
        <div className={`${MONO} text-zinc-500`}>owner</div>
        <div className="mt-1 flex items-center gap-2 text-[14px] font-medium text-zinc-900">
          <svg viewBox="0 0 16 16" className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1.5l5 2v4c0 3-2.2 5.4-5 6.5C5.2 12.9 3 10.5 3 7.5v-4l5-2z" /><path d="M5.8 8l1.6 1.6L10.5 6.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Ian · verified
        </div>
      </div>
      <div className="absolute bottom-5 left-5 right-5 flex flex-wrap gap-2">
        {['Rotate key', 'Transfer', 'Retire'].map((x, i) => (
          <span key={x} className={`rounded-full border px-3 py-1.5 text-[12px] font-medium ${i === 0 ? 'border-black bg-black text-white' : 'border-zinc-200 bg-white text-zinc-700'}`}>{x}</span>
        ))}
      </div>
      <svg viewBox="0 0 64 64" className="absolute right-6 top-6 h-16 w-16 text-zinc-900" fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="24" cy="26" r="11" />
        <circle cx="24" cy="26" r="4" fill="#10b981" stroke="none" />
        <path d="M32 33l18 18M44 45l4-4M49 50l4-4" strokeLinecap="round" />
      </svg>
    </Panel>
  );
}

/* ---------------------------------------------------------------- How it works */

export function StepClaimArt(): React.JSX.Element {
  return (
    <Panel className="h-[150px]">
      <div className="absolute inset-x-5 top-5 flex items-center rounded-full border border-zinc-200 bg-white p-1.5 shadow-sm">
        <span className="flex-1 pl-4 text-[14px] text-zinc-900">samantha<span className="font-mono text-zinc-400">.agent</span></span>
        <span className="rounded-full bg-black px-3.5 py-1.5 text-[12px] font-medium text-white">Check</span>
      </div>
      <span className={`absolute bottom-6 left-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 ${MONO} text-emerald-700`}><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> available · $29/yr</span>
    </Panel>
  );
}

export function StepConnectArt(): React.JSX.Element {
  return (
    <Panel className="h-[150px]">
      <div className="absolute inset-x-5 top-5 flex items-center rounded-full border border-zinc-200 bg-white p-1.5 shadow-sm">
        <span className="flex-1 truncate pl-4 font-mono text-[12px] text-zinc-600">https://samantha.example.com</span>
        <span className="rounded-full bg-black px-3.5 py-1.5 text-[12px] font-medium text-white">Connect</span>
      </div>
      <span className={`absolute bottom-6 left-5 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 ${MONO} text-cyan-700`}><Check tone="cyan" className="h-3.5 w-3.5" /> connected in 4s</span>
    </Panel>
  );
}

export function StepLinkArt(): React.JSX.Element {
  return (
    <Panel className="h-[150px]">
      <div className="absolute inset-x-5 top-5 space-y-2">
        {[['Workspace', 'emerald'], ['Control plane', 'emerald'], ['Public endpoint', 'cyan']].map(([label, tone]) => (
          <div key={label} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] text-zinc-800">
            {label}
            <span className={`inline-flex items-center gap-1.5 ${MONO} ${tone === 'cyan' ? 'text-cyan-700' : 'text-emerald-700'}`}><Check tone={tone as 'emerald' | 'cyan'} className="h-3.5 w-3.5" /> verified</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- The problem */

export function ProblemHandlesArt(): React.JSX.Element {
  const items: Array<[string, string]> = [
    ['@sam_bot_prod', 'chat'],
    ['sam-3f9a.host.app', 'url'],
    ['sk-live-••••••••••', 'key'],
    ['sam_assistant_v2', 'platform'],
  ];
  return (
    <Panel className="h-full min-h-[200px]">
      <div className="absolute inset-5 flex flex-wrap content-start gap-2">
        {items.map(([h, k], i) => (
          <span key={h} className={`inline-flex items-center gap-2 rounded-full border border-dashed border-zinc-300 bg-white/80 px-3 py-1.5 font-mono text-[12px] text-zinc-500 ${i % 2 ? 'rotate-[1.5deg]' : 'rotate-[-1.5deg]'}`}>
            <span className={`${MONO} text-zinc-400`}>{k}</span>{h}
          </span>
        ))}
      </div>
      <span className={`absolute bottom-5 left-5 ${MONO} text-zinc-500`}>four names · zero proof</span>
    </Panel>
  );
}

export function ProblemIcon({ kind }: { kind: 'portable' | 'verified' | 'reachable' }): React.JSX.Element {
  return (
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900">
      {kind === 'portable' && (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 15l-2 2a3 3 0 01-4.2-4.2l3-3a3 3 0 014.2 0" /><path d="M15 9l2-2a3 3 0 014.2 4.2l-3 3a3 3 0 01-4.2 0" /><path d="M4 4l16 16" className="text-zinc-400" /></svg>
      )}
      {kind === 'verified' && (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" /><path d="M12 9v3M12 15.5v.5" /></svg>
      )}
      {kind === 'reachable' && (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 21s-6-5.3-6-11a6 6 0 0112 0c0 5.7-6 11-6 11z" /><path d="M9.5 10a2.5 2.5 0 015 0" strokeDasharray="2 2" /></svg>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- Add-ons */

export function MiniBadgeArt(): React.JSX.Element {
  return (
    <div className="relative mx-auto mt-2 h-[132px] w-[96px]">
      <div className="absolute left-1/2 top-0 h-5 w-[3px] -translate-x-1/2 rounded bg-white/25" />
      <div className="absolute inset-x-0 top-4 h-[116px] rounded-[10px] border border-white/15 bg-[linear-gradient(160deg,#2a2a2e,#0c0c0e_60%,#1a1a1d)] p-2.5 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.9)]">
        <div className="mx-auto h-1.5 w-6 rounded-full bg-black/60" />
        <div className="mt-3 h-8 w-8 rounded-full bg-[conic-gradient(from_200deg,#10b981,#22d3ee,#10b981)]" />
        <div className="mt-2.5 h-1.5 w-14 rounded bg-white/60" />
        <div className="mt-1.5 h-1.5 w-9 rounded bg-white/25" />
        <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5"><span className="h-1 w-1 rounded-full bg-emerald-400" /><span className="h-1 w-6 rounded bg-emerald-300/70" /></div>
      </div>
    </div>
  );
}

export function ConnectFlowArt(): React.JSX.Element {
  return (
    <Panel className="h-[132px]">
      <div className="absolute inset-x-5 top-5 flex items-center justify-between">
        <span className={`rounded-full border border-zinc-200 bg-white px-2.5 py-1 ${MONO} text-zinc-700`}>samantha</span>
        <svg viewBox="0 0 120 20" className="mx-2 h-5 flex-1" fill="none"><path d="M0 10h112" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 4" /><path d="M108 5l6 5-6 5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className={`rounded-full border border-zinc-200 bg-white px-2.5 py-1 ${MONO} text-zinc-700`}>atlas</span>
      </div>
      <div className="absolute inset-x-5 bottom-5 flex flex-wrap gap-1.5">
        {['read calendar ✓', 'book meetings ✓', 'send email ✕'].map((x) => (
          <span key={x} className={`rounded-md border px-2 py-1 text-[11px] ${x.endsWith('✕') ? 'border-zinc-200 bg-white text-zinc-400 line-through' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'}`}>{x}</span>
        ))}
      </div>
    </Panel>
  );
}

export function PaymentsArt(): React.JSX.Element {
  return (
    <Panel className="h-[132px]">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-400/25 blur-3xl" />
      <div className="absolute left-5 top-5 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className={`${MONO} text-zinc-500`}>received</div>
        <div className="mt-1 text-[22px] font-medium tracking-[-0.02em] text-zinc-900">$0.42</div>
      </div>
      <span className={`absolute bottom-5 right-5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 ${MONO} text-cyan-700`}>limit $5 / day</span>
    </Panel>
  );
}

/* ---------------------------------------------------------------- Who it's for */

export function AudienceGlyph({ kind }: { kind: 'builders' | 'companies' | 'platforms' }): React.JSX.Element {
  const ring = kind === 'builders' ? 'from-emerald-400/30' : kind === 'companies' ? 'from-cyan-400/30' : 'from-emerald-400/30 via-cyan-400/20';
  return (
    <span className={`relative inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-gradient-to-br ${ring} to-white text-zinc-900`}>
      {kind === 'builders' && <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" /></svg>}
      {kind === 'companies' && <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 21V5a1 1 0 011-1h8a1 1 0 011 1v16M14 9h5a1 1 0 011 1v11M4 21h17M8 8h2M8 12h2M8 16h2M17 13h1M17 17h1" /></svg>}
      {kind === 'platforms' && <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z" /><path d="M4 12l8 4.5 8-4.5M4 16.5L12 21l8-4.5" /></svg>}
    </span>
  );
}
