'use client';

import type * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PRIMARY = 'rounded-full bg-black px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40';
const QUIET = 'rounded-full border border-zinc-300 px-4 py-2 text-[13px] font-medium text-zinc-900 hover:border-zinc-900 disabled:opacity-40';

async function remove(invitationId: string): Promise<void> {
  const res = await fetch(`/api/pairing/invitations/${invitationId}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new Error(body.message ?? body.error ?? 'That did not work. Please try again.');
  }
}

/**
 * A request you sent. Copy the link to share with the other owner; when the
 * other agent is also yours, approve it right here instead.
 */
export function OutgoingRequestActions({ invitationId, invitationUrl, approveHref }: { invitationId: string; invitationUrl: string; approveHref: string | null }): React.JSX.Element {
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
      setError('Copying was blocked by the browser. Open the link instead.');
    }
  }
  async function cancel(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await remove(invitationId);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {approveHref ? (
        <a href={approveHref} className={PRIMARY}>Review &amp; approve</a>
      ) : (
        <a href={invitationUrl} className={PRIMARY}>Open link</a>
      )}
      <button type="button" onClick={() => void copy()} disabled={busy} className={QUIET}>{copied ? 'Copied' : 'Copy link'}</button>
      <button type="button" onClick={() => void cancel()} disabled={busy} className={QUIET}>{busy ? 'Cancelling…' : 'Cancel'}</button>
      {error && <span className="text-[12px] text-amber-800">{error}</span>}
    </div>
  );
}

/** A request another owner sent to one of your agents. */
export function IncomingRequestActions({ invitationId, acceptHref }: { invitationId: string; acceptHref: string }): React.JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decline(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await remove(invitationId);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={acceptHref} className={PRIMARY}>Review &amp; approve</a>
      <button type="button" onClick={() => void decline()} disabled={busy} className={QUIET}>{busy ? 'Declining…' : 'Decline'}</button>
      {error && <span className="text-[12px] text-amber-800">{error}</span>}
    </div>
  );
}
