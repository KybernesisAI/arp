'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Button, FieldError } from '@/components/ui';

export default function BillingButtons({
  currentPlan,
  canManage,
}: {
  currentPlan: string;
  canManage: boolean;
}): React.JSX.Element {
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

  async function openPortal(): Promise<void> {
    setBusy('portal');
    setError(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json()) as { error: string; hint?: string };
        throw new Error(body.hint ?? body.error);
      }
      const { url } = (await res.json()) as { url: string | null };
      if (url) window.location.href = url;
      else throw new Error('no_portal_url');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      {(['pro', 'team'] as const).map((plan) => (
        <Button
          key={plan}
          variant={currentPlan === plan ? 'ghost' : 'primary'}
          arrow
          onClick={() => void checkout(plan)}
          disabled={busy !== null || currentPlan === plan}
        >
          {busy === plan ? 'Redirecting…' : `Upgrade to ${plan}`}
        </Button>
      ))}
      {canManage && (
        <Button
          variant="default"
          onClick={() => void openPortal()}
          disabled={busy !== null}
        >
          {busy === 'portal' ? 'Redirecting…' : 'Manage subscription'}
        </Button>
      )}
      {error && <FieldError className="m-0">{error}</FieldError>}
    </div>
  );
}
