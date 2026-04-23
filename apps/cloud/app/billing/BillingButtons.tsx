'use client';

import type * as React from 'react';
import { useState } from 'react';

export default function BillingButtons({ currentPlan }: { currentPlan: string }): React.JSX.Element {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(plan: 'pro' | 'team'): Promise<void> {
    setBusy(plan);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string; hint?: string };
        throw new Error(body.hint ?? body.error);
      }
      const { url } = (await res.json()) as { url: string | null };
      if (url) window.location.href = url;
      else throw new Error('no_checkout_url');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
      {(['pro', 'team'] as const).map((plan) => (
        <button
          key={plan}
          onClick={() => void checkout(plan)}
          disabled={busy !== null || currentPlan === plan}
          style={{
            padding: '0.75rem 1.25rem',
            border: 'none',
            borderRadius: '0.375rem',
            backgroundColor: currentPlan === plan ? '#334155' : '#3b82f6',
            color: '#0f172a',
            fontWeight: 600,
            cursor: currentPlan === plan ? 'default' : 'pointer',
          }}
        >
          {busy === plan ? 'Redirecting…' : `Upgrade to ${plan}`}
        </button>
      ))}
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
    </div>
  );
}
