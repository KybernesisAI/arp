'use client';

import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Button, FieldError, Input, Label } from '@/components/ui';

type SearchResult = {
  sld: string;
  domain: string;
  available: boolean;
  reason: string;
  price_cents_per_year: number;
  max_years: number;
};

/**
 * "Claim a name" (AgentID S2 / T9): search → price → checkout redirect.
 * Prefills from `?claim=<sld>` so the lander's form lands here ready to go.
 */
export function ClaimNamePanel({ initialQuery }: { initialQuery?: string | undefined }): React.JSX.Element {
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
      const body = (await res.json()) as SearchResult & { error?: string; message?: string };
      if (!res.ok) {
        setError(body.message ?? 'That name could not be checked. Try another.');
        return;
      }
      setResult(body);
    } catch {
      setError('Name lookup failed. Please try again.');
    } finally {
      setBusy('idle');
    }
  }

  useEffect(() => {
    if (initialQuery) void search(initialQuery);
  }, []);

  async function checkout(): Promise<void> {
    if (!result) return;
    setBusy('checkout');
    setError(null);
    try {
      const res = await fetch('/api/registrar/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sld: result.sld, years }),
      });
      const body = (await res.json()) as { url?: string; message?: string };
      if (!res.ok || !body.url) {
        setError(body.message ?? 'Checkout could not be started.');
        setBusy('idle');
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError('Checkout could not be started.');
      setBusy('idle');
    }
  }

  const price = result ? ((result.price_cents_per_year * years) / 100).toFixed(2) : null;

  return (
    <div className="p-5">
      <form
        className="flex flex-col sm:flex-row gap-3 items-stretch"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <div className="flex-1">
          <Label htmlFor="claim-name">Pick a name</Label>
          <div className="flex items-stretch border border-rule bg-paper focus-within:border-ink">
            <Input
              id="claim-name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="yourname"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 border-0"
            />
            <span className="px-3 flex items-center font-mono text-[14px] text-signal-blue border-l border-rule select-none">
              .agent
            </span>
          </div>
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="default" disabled={busy !== 'idle' || query.trim().length === 0}>
            {busy === 'searching' ? 'Checking…' : 'Check'}
          </Button>
        </div>
      </form>

      {error && <FieldError className="mt-3">{error}</FieldError>}

      {result && (
        <div className="mt-4 border-t border-rule pt-4 grid grid-cols-12 gap-4 items-center">
          <div className="col-span-12 md:col-span-5">
            <span className="font-display font-medium text-h5 block">{result.domain}</span>
            <span className="font-mono text-kicker uppercase text-muted">
              {result.available ? 'AVAILABLE' : `TAKEN${result.reason ? ` · ${result.reason.toUpperCase()}` : ''}`}
            </span>
          </div>
          {result.available && (
            <>
              <div className="col-span-6 md:col-span-3">
                <Label htmlFor="claim-years">Years</Label>
                <select
                  id="claim-years"
                  value={years}
                  onChange={(e) => setYears(Number(e.target.value))}
                  className="w-full border border-rule bg-paper px-3 py-2 font-mono text-[13px]"
                >
                  {Array.from({ length: result.max_years }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-6 md:col-span-4 flex items-end justify-end gap-3">
                <span className="font-mono text-[13px] text-ink">${price}</span>
                <Button type="button" variant="primary" onClick={() => void checkout()} disabled={busy !== 'idle'}>
                  {busy === 'checkout' ? 'Opening checkout…' : 'Claim'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
