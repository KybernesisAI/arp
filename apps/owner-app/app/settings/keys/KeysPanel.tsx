'use client';

import { useCallback, useState } from 'react';

export function KeysPanel({ agentDid }: { agentDid: string }) {
  const [response, setResponse] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rotate = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/keys/rotate', { method: 'POST' });
      const body = await res.text();
      setResponse(`${res.status}: ${body}`);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="card max-w-xl space-y-3 text-sm">
      <p className="text-arp-muted">
        Rotates the agent signing key for <code>{agentDid}</code>. v0 returns
        <code> 501 Not Implemented</code> and expects the operator to restart
        the runtime with a fresh keystore path.
      </p>
      <button
        type="button"
        className="btn"
        onClick={rotate}
        disabled={busy}
        data-testid="rotate-btn"
      >
        {busy ? 'Rotating…' : 'Trigger rotation'}
      </button>
      {response && (
        <pre
          className="whitespace-pre-wrap rounded bg-arp-bg p-2 text-xs"
          data-testid="rotate-response"
        >
          {response}
        </pre>
      )}
    </section>
  );
}
