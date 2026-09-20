'use client';

import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Button, FieldError, FieldHint, Textarea } from '@/components/ui';

type Pending = { created_at: string; expires_at: string; message: string | null } | null;

/**
 * "Give this name" (AgentID): create a one-use gift link for a name you hold.
 * The link is shown once; the pending state and cancel survive reloads.
 */
export function GiftNamePanel({ sld }: { sld: string }): React.JSX.Element {
  const [pending, setPending] = useState<Pending | 'loading'>('loading');
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = `/api/names/${encodeURIComponent(sld)}/gift`;

  useEffect(() => {
    void fetch(api).then(async (r) => { const b = (await r.json()) as { pending?: Pending }; setPending(b.pending ?? null); }).catch(() => setPending(null));
  }, [api]);

  async function create(): Promise<void> {
    setBusy(true); setError(null);
    try {
      const res = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message }) });
      const body = (await res.json()) as { url?: string; expires_at?: string; message?: string };
      if (!res.ok || !body.url) { setError(body.message ?? 'The gift link could not be created.'); return; }
      setUrl(body.url);
      setPending({ created_at: new Date().toISOString(), expires_at: body.expires_at ?? '', message: message || null });
      setOpen(false);
    } catch { setError('The gift link could not be created.'); } finally { setBusy(false); }
  }

  async function cancel(): Promise<void> {
    setBusy(true); setError(null);
    try {
      const res = await fetch(api, { method: 'DELETE' });
      if (!res.ok) { setError('The gift link could not be cancelled.'); return; }
      setPending(null); setUrl(null);
    } catch { setError('The gift link could not be cancelled.'); } finally { setBusy(false); }
  }

  async function copy(): Promise<void> {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable; the link is visible to select */ }
  }

  const expires = pending && pending !== 'loading' && pending.expires_at ? pending.expires_at.slice(0, 10) : null;

  return (
    <div className="p-5">
      {pending === 'loading' ? (
        <p className="text-body-sm text-ink-2 m-0">Loading…</p>
      ) : pending ? (
        <div className="grid grid-cols-12 gap-4 items-start">
          <div className="col-span-12 md:col-span-8">
            <div className="font-mono text-kicker uppercase text-muted mb-1">GIFT LINK · WAITING TO BE ACCEPTED</div>
            {url ? (
              <>
                <code className="block break-all font-mono text-[12px] bg-paper border border-rule px-3 py-2 mt-2">{url}</code>
                <FieldHint>Share this link with the person you're giving the name to. It is shown only once and works for one person. Expires {expires}.</FieldHint>
              </>
            ) : (
              <p className="text-body-sm text-ink-2 m-0 mt-1">A gift link for this name is out and has not been accepted yet. It expires {expires}. When it is accepted the name leaves your account.</p>
            )}
          </div>
          <div className="col-span-12 md:col-span-4 flex justify-end gap-2">
            {url && <Button type="button" variant="default" size="sm" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</Button>}
            <Button type="button" variant="default" size="sm" disabled={busy} onClick={() => void cancel()}>Cancel gift</Button>
          </div>
        </div>
      ) : open ? (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-8">
            <div className="font-mono text-kicker uppercase text-muted mb-2">A NOTE FOR THEM (OPTIONAL)</div>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={280} rows={3} placeholder="Happy launch day — this one's yours." />
            <FieldHint>You'll get a one-use link to share. When they accept, {sld}.agent moves to their account with a fresh identity they own, and your setup for it is retired.</FieldHint>
          </div>
          <div className="col-span-12 md:col-span-4 flex justify-end gap-2 items-start">
            <Button type="button" variant="default" size="sm" onClick={() => setOpen(false)}>Back</Button>
            <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create gift link'}</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4 items-center">
          <p className="col-span-12 md:col-span-8 text-body-sm text-ink-2 m-0">Give {sld}.agent to someone else. They accept it with one link and it becomes theirs, identity and all.</p>
          <div className="col-span-12 md:col-span-4 flex justify-end">
            <Button type="button" variant="default" size="sm" onClick={() => setOpen(true)}>Give this name</Button>
          </div>
        </div>
      )}
      {error && <div className="mt-3"><FieldError>{error}</FieldError></div>}
    </div>
  );
}
