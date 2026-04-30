'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Button, FieldError } from '@/components/ui';

export default function BillingButtons({
  currentPlan,
  canManage,
  agentCount,
}: {
  currentPlan: 'free' | 'pro';
  canManage: boolean;
  agentCount: number;
}): React.JSX.Element {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(): Promise<void> {
    setBusy('checkout');
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Initial Stripe quantity defaults to current agent count so the
        // first invoice matches what they have provisioned. Server clamps
        // to >= 1.
        body: JSON.stringify({ quantity: Math.max(1, agentCount) }),
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
      {currentPlan === 'free' && (
        <Button
          variant="primary"
          arrow
          onClick={() => void checkout()}
          disabled={busy !== null}
        >
          {busy === 'checkout' ? 'Redirecting…' : 'Upgrade to Pro'}
        </Button>
      )}
      {canManage && (
        <Button
          variant="default"
          onClick={() => void openPortal()}
          disabled={busy !== null}
        >
          {busy === 'portal' ? 'Redirecting…' : 'Manage subscription'}
        </Button>
      )}
      {currentPlan === 'pro' && (
        <p className="text-body-sm text-ink-2 m-0">
          Need more agents? Provision one — billing auto-scales by $5/mo per agent.
        </p>
      )}
      {error && <FieldError className="m-0">{error}</FieldError>}
    </div>
  );
}
