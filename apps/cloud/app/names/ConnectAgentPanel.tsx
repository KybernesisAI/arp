'use client';

import type * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FieldError, Input, Label } from '@/components/ui';
import { AttachRuntimePanel } from '@/app/names/AttachRuntimePanel';

type ConnectResponse = { ok?: boolean; result?: string; message?: string; detail?: string; push_url?: string; store?: string | null };

/**
 * "Connect your agent" (AgentID S6a): one field, one click. The console does
 * the whole exchange with the agent; the owner sees Connected or a sentence
 * saying what to fix. The manual, variable-based setup stays under
 * "Set up by hand" for agents on other frameworks or hosts without disk.
 */
export function ConnectAgentPanel({ agentDid, attached, pushKind, pushUrl }: { agentDid: string; attached: boolean; pushKind: string | null; pushUrl: string | null }): React.JSX.Element {
  const router = useRouter();
  const [url, setUrl] = useState(pushUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsManual, setNeedsManual] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [done, setDone] = useState<ConnectResponse | null>(null);

  async function connect(): Promise<void> {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentDid)}/connect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const body = (await res.json()) as ConnectResponse;
      if (!res.ok || !body.ok) {
        setError(body.message ?? 'We could not connect your agent.');
        if (body.result === 'store_unwritable' || body.result === 'not_arp_ready') setNeedsManual(true);
        return;
      }
      setDone(body);
      router.refresh();
    } catch {
      setError('We could not connect your agent. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(): Promise<void> {
    setBusy(true);
    try {
      await fetch(`/api/agents/${encodeURIComponent(agentDid)}/runtime`, { method: 'DELETE' });
      router.refresh();
      setDone(null);
    } finally {
      setBusy(false);
    }
  }

  const connected = attached || done?.ok === true;
  const shownUrl = done?.push_url ?? pushUrl;

  return (
    <div className="flex flex-col gap-4">
      {connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-kicker uppercase text-muted mb-1">CONNECTED</div>
            <div className="font-mono text-[12px] break-all">{shownUrl}</div>
            <p className="text-body-sm text-ink-2 mt-2 m-0">
              Your agent answers to this name. Pair it with other agents below; every message is checked against what you allow and logged.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="default" size="sm" onClick={() => void disconnect()} disabled={busy}>
              {busy ? 'Working…' : 'Disconnect'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="connect-url">Your agent’s address</Label>
            <Input id="connect-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://my-agent.example.com" data-testid="connect-url-input" />
            <p className="text-body-sm text-ink-2 mt-2 m-0">
              Paste where your agent runs and click Connect. Agents built with Kybernesis tooling are ready as they are; nothing to install.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="primary" size="sm" onClick={() => void connect()} disabled={busy || !url.trim()} data-testid="connect-button">
              {busy ? 'Connecting…' : 'Connect'}
            </Button>
            {busy && <span className="font-mono text-kicker uppercase text-muted">CONTACTING YOUR AGENT…</span>}
          </div>
          {error && <FieldError>{error}</FieldError>}
        </div>
      )}
      <div className="border-t border-rule pt-3">
        <button type="button" className="font-mono text-kicker uppercase text-muted underline decoration-rule hover:decoration-ink" onClick={() => setShowManual((v) => !v)}>
          {showManual ? 'HIDE MANUAL SETUP' : needsManual ? 'SET UP BY HAND (RECOMMENDED FOR THIS AGENT)' : 'SET UP BY HAND'}
        </button>
        {showManual && (
          <div className="mt-3">
            <p className="text-body-sm text-ink-2 mb-3">
              For agents on other frameworks, or hosts with no writable storage: attach with a verification step and copy the variables it gives you.
            </p>
            <AttachRuntimePanel agentDid={agentDid} attached={attached} pushKind={pushKind} pushUrl={pushUrl} />
          </div>
        )}
      </div>
    </div>
  );
}
