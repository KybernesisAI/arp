'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui';

/**
 * Releases the tenant's claim on a `.agent` domain. Different from
 * deleting an agent — this removes the registrar binding (so the
 * tenant can no longer provision agents on this domain), but does NOT
 * delete agents already provisioned on it. Delete those separately
 * with DeleteAgentButton if you want to clear them out entirely.
 *
 * Use case: you're transferring the .agent name to someone else, or
 * you don't want this name to be claimable by your tenant any more.
 */
type Stage = 'idle' | 'confirming' | 'unbinding' | 'error';

export function UnbindDomainButton({
  domain,
  hasProvisionedAgent,
}: {
  domain: string;
  hasProvisionedAgent: boolean;
}): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);

  async function doUnbind(): Promise<void> {
    setStage('unbinding');
    setError(null);
    try {
      const res = await fetch(`/api/registrar/bindings/${encodeURIComponent(domain)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `failed_${res.status}`);
        setStage('error');
        return;
      }
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setStage('error');
    }
  }

  if (stage === 'idle') {
    return (
      <Button
        variant="default"
        size="sm"
        onClick={() => setStage('confirming')}
      >
        Unbind domain
      </Button>
    );
  }

  if (stage === 'confirming') {
    return (
      <div className="flex items-center gap-2 text-body-sm">
        <span className="text-ink-2">
          Release{' '}
          <strong>
            <code className="font-mono">{domain}</code>
          </strong>
          ?{' '}
          {hasProvisionedAgent
            ? 'The provisioned agent on this domain stays — delete it separately.'
            : 'No agent currently provisioned on this domain.'}
        </span>
        <Button variant="default" size="sm" onClick={() => void doUnbind()}>
          Yes, unbind
        </Button>
        <button
          type="button"
          className="underline text-muted"
          onClick={() => setStage('idle')}
        >
          cancel
        </button>
      </div>
    );
  }

  if (stage === 'unbinding') {
    return (
      <Button variant="default" size="sm" disabled>
        Unbinding…
      </Button>
    );
  }

  return (
    <div className="text-body-sm text-ink-2">
      Error: {error}{' '}
      <button
        type="button"
        className="underline"
        onClick={() => setStage('idle')}
      >
        retry
      </button>
    </div>
  );
}
