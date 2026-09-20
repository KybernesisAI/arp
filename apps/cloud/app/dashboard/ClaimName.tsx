'use client';

import type * as React from 'react';
import { useEffect, useState } from 'react';

type SearchResult = { sld: string; domain: string; available: boolean; reason?: string | null; price_cents_per_year: number; max_years: number };

/** Claim a new name from the dashboard (lander-style). Same API as the old panel. */
export function ClaimName({ initialQuery }: { initialQuery?: string | undefined }): React.JSX.Element {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [years, setYears] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState<'idle' | 'searching' | 'checkout'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function search(q: string): Promise<void> {
    const sld = q.trim().toLowerCase().replace(/\.agent$/, '');
    if (!sld) return;
    setBusy('searching');
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/registrar/search?q=${encodeURIComponent(sld)}`);
      const body = (await res.json()) as SearchResult & { message?: string };
      if (!res.ok) { setError(body.message ?? 'That name could not be checked. Try another.'); return; }
      setResult(body);
    } catch {
      setError('Name lookup failed. Please try again.');
    } finally {
      setBusy('idle');
    }
  }
  useEffect(() => { if (initialQuery) void search(initialQuery); }, []);

  async function checkout(): Promise<void> {
    if (!result) return;
    setBusy('checkout');
    setError(null);
    try {
      const res = await fetch('/api/registrar/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sld: result.sld, years }) });
      const body = (await res.json()) as { url?: string; message?: string };
      if (!res.ok || !body.url) { setError(body.message ?? 'Checkout could not be started.'); setBusy('idle'); return; }
      window.location.assign(body.url);
    } catch {
      setError('Checkout could not be started.');
      setBusy('idle');
    }
  }
  const price = result ? ((result.price_cents_per_year * years) / 100).toFixed(2) : null;

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); void search(query); }} className="w-full">
        <div className="flex items-stretch rounded-full border border-zinc-300 bg-white p-1.5 transition-colors focus-within:border-zinc-900">
          <div className="flex flex-1 items-center pl-5">
            <input
              id="claim-name"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setResult(null); setError(null); }}
              placeholder="yourname"
              aria-label="Pick a .agent name"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              className="w-full bg-transparent text-[17px] text-zinc-900 outline-none placeholder:text-zinc-400"
            />
            <span className="select-none pr-3 font-mono text-[14px] text-zinc-500">.agent</span>
          </div>
          <button type="submit" disabled={busy !== 'idle' || query.trim().length === 0} className="rounded-full bg-black px-5 py-3 text-[14px] font-medium text-white transition-opacity disabled:opacity-40">
            {busy === 'searching' ? 'Checking…' : 'Check'}
          </button>
        </div>
      </form>
      <div className="mt-3 min-h-[24px] pl-5 text-[14px]">
        {error && <span className="text-zinc-600">{error}</span>}
        {result && !result.available && <span className="text-zinc-600">{result.domain} is taken{result.reason ? ` · ${result.reason}` : ''}. Try another.</span>}
        {result && result.available && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-[12px] uppercase tracking-[0.14em] text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> available</span>
            <span className="font-mono text-[13px] text-zinc-900">{result.domain}</span>
            <label className="flex items-center gap-2 text-[13px] text-zinc-600">
              for
              <select value={years} onChange={(e) => setYears(Number(e.target.value))} className="rounded-full border border-zinc-300 bg-white px-3 py-1 font-mono text-[13px] text-zinc-900">
                {Array.from({ length: result.max_years }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} {n === 1 ? 'year' : 'years'}</option>)}
              </select>
            </label>
            <span className="font-mono text-[13px] text-zinc-900">${price}</span>
            <button type="button" onClick={() => void checkout()} disabled={busy !== 'idle'} className="rounded-full bg-black px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40">
              {busy === 'checkout' ? 'Opening checkout…' : 'Claim it'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
