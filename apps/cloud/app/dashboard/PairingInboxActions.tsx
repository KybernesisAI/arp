'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ButtonLink } from '@/components/ui';

/**
 * Per-row action buttons for the dashboard pairing inbox sections.
 *
 * Outgoing (you sent it):
 *   - Copy URL — re-share without re-generating
 *   - Cancel  — DELETE /api/pairing/invitations/:id, refresh the page so
 *               the row drops out of the pending widget
 *
 * Incoming (someone sent it to you):
 *   - Accept (link) — opens /pair/accept#<payload>
 *   - Deny          — DELETE /api/pairing/invitations/:id; the API
 *                     authorizes audience-side callers when their tenant
 *                     owns the agent matching the invitation's
 *                     audience_did
 */
export function OutgoingActions({
  invitationId,
  invitationUrl,
}: {
  invitationId: string;
  invitationUrl: string;
}): React.JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('clipboard blocked — copy manually from the share page');
    }
  }

  async function cancel(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pairing/invitations/${invitationId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `status ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Button
        variant="default"
        size="sm"
        onClick={() => void copy()}
        disabled={busy}
      >
        {copied ? 'Copied' : 'Copy URL'}
      </Button>
      <Button
        variant="default"
        size="sm"
        onClick={() => void cancel()}
        disabled={busy}
      >
        {busy ? 'Cancelling…' : 'Cancel'}
      </Button>
      {error && (
        <span className="font-mono text-kicker uppercase text-signal-red">
          {error}
        </span>
      )}
    </div>
  );
}

export function IncomingActions({
  invitationId,
  acceptHref,
}: {
  invitationId: string;
  acceptHref: string;
}): React.JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deny(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pairing/invitations/${invitationId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `status ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <ButtonLink href={acceptHref} variant="primary" size="sm" arrow>
        Review + accept
      </ButtonLink>
      <Button
        variant="default"
        size="sm"
        onClick={() => void deny()}
        disabled={busy}
      >
        {busy ? 'Denying…' : 'Deny'}
      </Button>
      {error && (
        <span className="font-mono text-kicker uppercase text-signal-red">
          {error}
        </span>
      )}
    </div>
  );
}
