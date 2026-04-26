'use client';

import type * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ButtonLink } from '@/components/ui';

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

  if (status === 'revoked') {
    // Revoked is terminal — only "view audit" is meaningful.
    return (
      <ButtonLink
        href={`/connections/${encodeURIComponent(connectionId)}/audit`}
        variant="default"
        size="sm"
        arrow
      >
        View audit log
      </ButtonLink>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ButtonLink
        href={`/connections/${encodeURIComponent(connectionId)}/audit`}
        variant="default"
        size="sm"
        arrow
      >
        View audit log
      </ButtonLink>

      {status === 'active' && (
        <ButtonLink
          href={`/connections/${encodeURIComponent(connectionId)}/edit`}
          variant="primary"
          size="sm"
          arrow
        >
          Edit scopes
        </ButtonLink>
      )}

      {status === 'active' && (
        <Button
          variant="default"
          size="sm"
          onClick={() => void call('suspend')}
          disabled={stage === 'submitting'}
        >
          {stage === 'submitting' ? 'Suspending…' : 'Suspend'}
        </Button>
      )}

      {status === 'suspended' && (
        <Button
          variant="primary"
          size="sm"
          arrow
          onClick={() => void call('resume')}
          disabled={stage === 'submitting'}
        >
          {stage === 'submitting' ? 'Resuming…' : 'Resume'}
        </Button>
      )}

      {status === 'active' && (
        <ButtonLink
          href={`/connections/${encodeURIComponent(connectionId)}/revoke`}
          variant="default"
          size="sm"
          arrow
        >
          Revoke
        </ButtonLink>
      )}

      {error && (
        <span className="font-mono text-kicker uppercase text-signal-red">
          {error}
        </span>
      )}
    </div>
  );
}
