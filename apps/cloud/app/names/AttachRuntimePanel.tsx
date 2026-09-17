'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Button, FieldError, Input, Label, Pre } from '@/components/ui';

type AttachResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
  credential?: string;
  env?: Record<string, string>;
  expected?: { did: string; challenge: string };
  verification_url?: string;
  push_url?: string;
};

/**
 * Attach a runtime (AgentID S4 / P6): point the name at a hosted agent. The
 * runtime must answer the verification document; on success a credential is
 * shown once with the env block the agent needs. Detach revokes it.
 */
export function AttachRuntimePanel({ agentDid, attached, pushKind, pushUrl }: { agentDid: string; attached: boolean; pushKind: string | null; pushUrl: string | null }): React.JSX.Element {
  const [url, setUrl] = useState(pushUrl ? `${pushUrl}/eve/v1/arp` : '');
  const [kind, setKind] = useState<'eve' | 'generic'>((pushKind as 'eve' | 'generic') ?? 'eve');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AttachResponse | null>(null);
  const [result, setResult] = useState<AttachResponse | null>(null);

  async function attach(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentDid)}/runtime`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, kind }),
      });
      const body = (await res.json()) as AttachResponse;
      if (!res.ok) {
        setError(body.message ?? 'The runtime could not be attached.');
        if (body.expected) setPending(body);
        return;
      }
      setPending(null);
      setResult(body);
    } finally {
      setBusy(false);
    }
  }

  async function detach(): Promise<void> {
    setBusy(true);
    try {
      await fetch(`/api/agents/${encodeURIComponent(agentDid)}/runtime`, { method: 'DELETE' });
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  if (result?.env) {
    return (
      <div className="p-5">
        <p className="text-body-sm text-ink-2 m-0 mb-3">
          Runtime attached. This credential is shown once. Add these variables to the agent&apos;s deployment and redeploy:
        </p>
        <Pre className="text-[11px]">{Object.entries(result.env).map(([k, v]) => `${k}=${v}`).join('\n')}</Pre>
        <p className="text-body-sm text-ink-2 m-0 mt-3">
          Install the identity package (<code>eve add @kybernesis/identity-channel</code> and <code>@kybernesis/identity-peers</code>) if you haven&apos;t.
        </p>
      </div>
    );
  }

  return (
    <div className="p-5">
      {attached && (
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-rule">
          <div>
            <div className="font-mono text-kicker uppercase text-muted mb-1">ATTACHED</div>
            <span className="font-mono text-[12px]">{pushKind} · {pushUrl}</span>
          </div>
          <Button type="button" size="sm" variant="default" onClick={() => void detach()} disabled={busy}>
            Detach
          </Button>
        </div>
      )}
      <div className="grid grid-cols-12 gap-3 items-end">
        <div className="col-span-12 md:col-span-3">
          <Label htmlFor="rt-kind">Runtime</Label>
          <select id="rt-kind" value={kind} onChange={(e) => setKind(e.target.value as 'eve' | 'generic')} className="w-full border border-rule bg-paper px-3 py-2 font-mono text-[13px]">
            <option value="eve">Kybernesis Eve agent</option>
            <option value="generic">Any HTTP agent</option>
          </select>
        </div>
        <div className="col-span-12 md:col-span-7">
          <Label htmlFor="rt-url">{kind === 'eve' ? 'Agent URL (…/eve/v1/arp)' : 'Endpoint URL'}</Label>
          <Input id="rt-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={kind === 'eve' ? 'https://your-agent.vercel.app/eve/v1/arp' : 'https://your-agent.example/arp'} autoComplete="off" spellCheck={false} />
        </div>
        <div className="col-span-12 md:col-span-2">
          <Button type="button" variant="primary" className="w-full" onClick={() => void attach()} disabled={busy || url.trim().length === 0}>
            {busy ? 'Verifying…' : attached ? 'Re-attach' : 'Attach'}
          </Button>
        </div>
        {error && <FieldError className="col-span-12">{error}</FieldError>}
        {pending?.expected && (
          <div className="col-span-12 border-t border-rule pt-3">
            <p className="text-body-sm text-ink-2 m-0 mb-2">
              Serve this document at <code className="font-mono text-[11px]">{pending.verification_url}</code>, then attach again. For Eve agents, set{' '}
              <code className="font-mono text-[11px]">AGENTID_CHALLENGE={pending.expected.challenge}</code> and redeploy.
            </p>
            <Pre className="text-[11px]">{JSON.stringify(pending.expected)}</Pre>
          </div>
        )}
      </div>
    </div>
  );
}
