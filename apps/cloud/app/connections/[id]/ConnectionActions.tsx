'use client';

import type * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Inline action buttons for a connection's detail page. Suspend /
 * Resume hit /api/connections/:id/(suspend|resume) and refresh the
 * server component on success. Edit + Revoke link out to dedicated
 * routes.
 *
 * Suspend semantics (matches dispatch.ts): non-active connections
 * reject inbound DIDComm with `connection_${status}`. Suspending
 * is reversible (Resume); revocation is permanent.
 */
type Stage = 'idle' | 'submitting' | 'error';

export function ConnectionActions({
  connectionId,
  status,
}: {
  connectionId: string;
  status: 'active' | 'suspended' | 'revoked' | string;
}): React.JSX.Element {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);

  async function call(path: 'suspend' | 'resume'): Promise<void> {
    setError(null);
    setStage('submitting');
    try {
      const res = await fetch(
        `/api/connections/${encodeURIComponent(connectionId)}/${path}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError((body['error'] as string) ?? `${path}_failed_${res.status}`);
        setStage('error');
        return;
      }
      setStage('idle');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setStage('error');
    }
  }

  const PRIMARY = 'rounded-full bg-black px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40';
  const QUIET = 'rounded-full border border-zinc-300 px-4 py-2 text-[13px] font-medium text-zinc-900 hover:border-zinc-900 disabled:opacity-40';
  const log = `/connections/${encodeURIComponent(connectionId)}/audit`;
  if (status === 'revoked') {
    return <a href={log} className={PRIMARY}>Message log</a>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={log} className={QUIET}>Message log</a>
      <a href={`/connections/${encodeURIComponent(connectionId)}/edit`} className={QUIET}>Change permissions</a>
      {status === 'active' ? (
        <button type="button" onClick={() => void call('suspend')} disabled={stage === 'submitting'} className={QUIET}>{stage === 'submitting' ? 'Pausing…' : 'Pause'}</button>
      ) : (
        <button type="button" onClick={() => void call('resume')} disabled={stage === 'submitting'} className={PRIMARY}>{stage === 'submitting' ? 'Resuming…' : 'Resume'}</button>
      )}
      <a href={`/connections/${encodeURIComponent(connectionId)}/revoke`} className="rounded-full border border-amber-500/40 px-4 py-2 text-[13px] font-medium text-amber-800 hover:border-amber-700">End connection</a>
      {error && <span className="text-[12px] text-amber-800">{error}</span>}
    </div>
  );
}
