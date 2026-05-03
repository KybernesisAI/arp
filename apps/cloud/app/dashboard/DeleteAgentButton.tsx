'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui';

/**
 * Hard-deletes a cloud-managed agent. Drops the agent row, revokes the
 * keypair (any bridge still pointing at this DID will fail to connect),
 * and decrements the Stripe per-agent quantity if applicable.
 *
 * The .agent domain registrar binding is NOT removed — to release the
 * .agent name use the UnbindDomainButton instead. They're different
 * concepts: an agent is the cloud-managed identity (keypair + DID doc);
 * a domain binding is the tenant-owns-this-name claim.
 */
type Stage = 'idle' | 'confirming' | 'deleting' | 'error';

export function DeleteAgentButton({
  agentDid,
  agentName,
}: {
  agentDid: string;
  agentName: string;
}): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);

  async function doDelete(): Promise<void> {
    setStage('deleting');
    setError(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentDid)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `failed_${res.status}`);
        setStage('error');
        return;
      }
      // Reload to refresh the dashboard list.
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
        Delete agent
      </Button>
    );
  }

  if (stage === 'confirming') {
    return (
      <div className="flex items-center gap-2 text-body-sm">
        <span className="text-ink-2">
          Delete <strong>{agentName}</strong>? Cannot be undone.
        </span>
        <Button variant="default" size="sm" onClick={() => void doDelete()}>
          Yes, delete
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

  if (stage === 'deleting') {
    return (
      <Button variant="default" size="sm" disabled>
        Deleting…
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
