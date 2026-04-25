'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui';

/**
 * Mints (or recovers) a self-loop "self-test" connection for an agent
 * — used by the `arp-send` script to round-trip a DIDComm message
 * through the cloud-gateway → bridge → kyberbot pipeline without
 * going through the full pairing handshake.
 *
 * On success, displays the connection_id with a copy button.
 */
type Stage = 'idle' | 'submitting' | 'ready' | 'error';

export function SelfTestConnectionButton({
  agentDid,
}: {
  agentDid: string;
}): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('idle');
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mint(): Promise<void> {
    setStage('submitting');
    setError(null);
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(agentDid)}/self-test-connection`,
        { method: 'POST' },
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError((body['error'] as string) ?? `failed_${res.status}`);
        setStage('error');
        return;
      }
      setConnectionId(String(body['connection_id']));
      setStage('ready');
    } catch (err) {
      setError((err as Error).message);
      setStage('error');
    }
  }

  if (stage === 'idle' || stage === 'submitting') {
    return (
      <Button variant="default" size="sm" onClick={() => void mint()} disabled={stage === 'submitting'}>
        {stage === 'submitting' ? 'Minting…' : 'Self-test connection'}
      </Button>
    );
  }

  if (stage === 'error') {
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

  // ready
  return (
    <div className="border border-rule bg-paper p-3">
      <p className="font-mono text-kicker uppercase text-muted mb-2">
        SELF-TEST CONNECTION READY
      </p>
      <p className="text-body-sm text-ink-2 mb-2 break-all">
        <code className="font-mono">{connectionId}</code>
      </p>
      <p className="text-body-sm text-ink-2 mb-2">
        Pass this to <code className="font-mono">arp-send</code> via{' '}
        <code className="font-mono">--connection-id</code>:
      </p>
      <pre className="text-xs leading-snug overflow-x-auto bg-paper-2 p-2 mb-2">
{`node ~/arp/scripts/arp-send.mjs \\
  --handoff ~/atlas/arp-handoff.json \\
  --connection-id ${connectionId} \\
  --text "Hello Atlas"`}
      </pre>
      <Button
        variant="default"
        size="sm"
        onClick={() => void navigator.clipboard.writeText(connectionId ?? '')}
      >
        Copy connection_id
      </Button>
    </div>
  );
}
