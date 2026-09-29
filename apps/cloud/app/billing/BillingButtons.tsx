'use client';

import type * as React from 'react';
import { useState } from 'react';
import { ErrorText, PrimaryButton, SecondaryButton } from '@/app/lander/ui';

export default function BillingButtons({ canManage, connectOn, internal }: { canManage: boolean; connectOn: boolean; internal: boolean }): React.JSX.Element {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(path: string, label: string): Promise<void> {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(path, { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.message ?? 'Something went wrong. Try again.');
      window.location.assign(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {!connectOn && !internal && (
          <PrimaryButton onClick={() => void go('/api/billing/checkout', 'connect')} disabled={busy !== null} data-testid="connect-checkout-btn">
            {busy === 'connect' ? 'Opening…' : 'Turn on Connect · $5/mo'}
          </PrimaryButton>
        )}
        {canManage && (
          <SecondaryButton onClick={() => void go('/api/billing/portal', 'portal')} disabled={busy !== null} data-testid="manage-billing-btn">
            {busy === 'portal' ? 'Opening…' : 'Manage billing'}
          </SecondaryButton>
        )}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

export function AutoRenewToggle({ sld, autoRenew }: { sld: string; autoRenew: boolean }): React.JSX.Element {
  const [on, setOn] = useState(autoRenew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function flip(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/autorenew', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sld, auto_renew: !on }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(body.message ?? 'The change could not be saved.');
      setOn(!on);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={() => void flip()} disabled={busy} className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-900 disabled:opacity-50" data-testid="autorenew-toggle">
        {busy ? 'Saving…' : on ? 'Turn renewal off' : 'Turn renewal on'}
      </button>
      {error && <ErrorText className="mt-1">{error}</ErrorText>}
    </div>
  );
}
