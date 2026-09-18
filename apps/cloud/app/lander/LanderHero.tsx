'use client';

import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { AgentBadge, type BadgeData } from '@/app/badge/AgentBadge';

type Availability = { sld: string; domain: string; available: boolean; reason?: string; price_cents_per_year?: number | null; error?: string; message?: string };

const SLD_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function NameSearch(): React.JSX.Element {
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Availability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sld = raw.trim().toLowerCase().replace(/\.agent$/, '');
  const valid = SLD_RE.test(sld);

  async function check(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!valid) { setError('Lowercase letters, numbers and hyphens.'); return; }
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch(`/api/registrar/availability?q=${encodeURIComponent(sld)}`);
      const body = (await res.json()) as Availability;
      if (!res.ok) { setError(body.message ?? 'Could not check that name right now.'); return; }
      setResult(body);
    } catch {
      setError('Could not check that name right now.');
    } finally {
      setBusy(false);
    }
  }

  const price = result?.price_cents_per_year ? `$${Math.round(result.price_cents_per_year / 100)}/yr` : null;

  return (
    <form onSubmit={(e) => void check(e)} className="w-full max-w-[520px]">
      <div className="flex items-stretch rounded-full border border-white/20 bg-white/[0.04] p-1.5 focus-within:border-white/40 transition-colors">
        <div className="flex flex-1 items-center pl-5">
          <input
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setResult(null); setError(null); }}
            placeholder="yourname"
            aria-label="Pick a .agent name"
            spellCheck={false}
            autoCapitalize="none"
            className="w-full bg-transparent text-[17px] text-white placeholder:text-white/35 outline-none"
          />
          <span className="pr-3 font-mono text-[14px] text-white/45 select-none">.agent</span>
        </div>
        <button type="submit" disabled={busy || !sld} className="rounded-full bg-white px-5 py-3 text-[14px] font-medium text-black transition-opacity disabled:opacity-40">
          {busy ? 'Checking…' : 'Check'}
        </button>
      </div>
      <div className="mt-3 min-h-[24px] pl-5 text-[14px]">
        {error && <span className="text-white/60">{error}</span>}
        {result && result.available && (
          <span className="inline-flex flex-wrap items-center gap-3 text-white/80">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 font-mono text-[12px] uppercase tracking-[0.14em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> available
            </span>
            <span className="font-mono text-[13px]">{result.domain}{price ? ` · ${price}` : ''}</span>
            <a href={`https://cloud.arp.run/dashboard?claim=${encodeURIComponent(result.sld)}`} className="underline decoration-white/30 underline-offset-4 hover:decoration-white">Claim it →</a>
          </span>
        )}
        {result && !result.available && (
          <span className="text-white/60">{result.domain} is taken{result.reason ? ` · ${result.reason}` : ''}. Try another.</span>
        )}
      </div>
    </form>
  );
}

export function LanderHero({ badge }: { badge: BadgeData }): React.JSX.Element {
  const heroRef = useRef<HTMLElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  // Wide (lg+): the rig covers the whole hero and hangs at the measured centre
  // of the right column, so it can be flung anywhere but never starts over
  // the copy. Narrow: the badge lives in its own block under the copy.
  const [wide, setWide] = useState(false);
  const [anchorX, setAnchorX] = useState(0.75);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  useEffect(() => {
    const hero = heroRef.current, slot = slotRef.current;
    if (!hero || !slot) return;
    const measure = () => {
      const h = hero.getBoundingClientRect(), r = slot.getBoundingClientRect();
      if (h.width > 0) setAnchorX((r.left + r.width / 2 - h.left) / h.width);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(hero); ro.observe(slot);
    return () => ro.disconnect();
  }, [wide]);

  return (
    <section ref={heroRef} className="relative overflow-hidden bg-black text-white">
      {wide && (
        <div className="absolute inset-0 z-0">
          <AgentBadge data={badge} theme="dark" zoom={1.7} anchorX={anchorX} eventSource={heroRef} />
        </div>
      )}
      <div className="relative z-[1] mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-8 px-6 pb-8 pt-16 lg:grid-cols-12 lg:pb-0 lg:pt-8" style={{ pointerEvents: wide ? 'none' : 'auto' }}>
        <div className="lg:col-span-6 lg:py-24" style={{ pointerEvents: 'auto' }}>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 font-mono text-[12px] uppercase tracking-[0.14em] text-white/60">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> .agent names are live
          </div>
          <h1 className="text-[44px] font-medium leading-[1.02] tracking-[-0.03em] sm:text-[60px] lg:text-[72px]">
            Give your agent<br />an identity.
          </h1>
          <p className="mt-6 max-w-[48ch] text-[18px] leading-relaxed text-white/65">
            One permanent name for your AI agent. A page people can find, an address other agents can trust, and keys you control. Attach it to any agent, on any platform, and take it with you when you move.
          </p>
          <div className="mt-8"><NameSearch /></div>
          <div className="mt-8 flex flex-wrap gap-2">
            {['Owner control', 'Any agent platform', 'Verified'].map((t) => (
              <span key={t} className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3.5 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{t}
              </span>
            ))}
          </div>
        </div>
        {/* Right column: the rig's anchor on wide screens; the badge's own block on narrow ones. */}
        <div ref={slotRef} className="relative h-[560px] w-full lg:col-span-6 lg:h-[760px]">
          {!wide && <AgentBadge data={badge} theme="dark" zoom={1.35} />}
        </div>
      </div>
    </section>
  );
}
