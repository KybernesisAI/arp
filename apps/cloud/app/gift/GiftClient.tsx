'use client';

import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Button, ButtonLink, Card, Dot, FieldError } from '@/components/ui';

type Preview = { state: 'pending' | 'claimed' | 'cancelled' | 'expired' | 'invalid'; domain: string | null; sld: string | null; message: string | null; from: string | null; expiresAt: string | null };
type Stage = { kind: 'loading' } | { kind: 'preview'; p: Preview } | { kind: 'accepting'; p: Preview } | { kind: 'done'; sld: string; identity: 'ready' | 'pending' } | { kind: 'error'; message: string };

const CLOSED: Record<Exclude<Preview['state'], 'pending'>, string> = {
  claimed: 'This gift has already been accepted.',
  cancelled: 'This gift was cancelled by the sender.',
  expired: 'This gift link has expired. Ask the sender for a new one.',
  invalid: 'This gift link is not valid. Open the full link you received.',
};

export function GiftClient({ principalDid, hasTenant }: { principalDid: string | null; hasTenant: boolean }): React.JSX.Element {
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [token, setToken] = useState('');

  useEffect(() => {
    const t = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
    setToken(t);
    if (!t) { setStage({ kind: 'error', message: CLOSED.invalid }); return; }
    void (async () => {
      try {
        const res = await fetch('/api/gifts/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: t }) });
        const p = (await res.json()) as Preview;
        if (!res.ok || p.state === 'invalid') { setStage({ kind: 'error', message: CLOSED.invalid }); return; }
        setStage({ kind: 'preview', p });
      } catch {
        setStage({ kind: 'error', message: 'Could not load this gift right now. Please try again.' });
      }
    })();
  }, []);

  function signIn(): void {
    const next = `/gift#${token}`;
    const target = !principalDid ? '/cloud/login' : '/onboarding';
    window.location.assign(`${target}?next=${encodeURIComponent(next)}`);
  }

  async function accept(p: Preview): Promise<void> {
    setStage({ kind: 'accepting', p });
    try {
      const res = await fetch('/api/gifts/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
      const body = (await res.json()) as { ok?: boolean; sld?: string; identity?: 'ready' | 'pending'; message?: string };
      if (!res.ok || !body.ok || !body.sld) { setStage({ kind: 'error', message: body.message ?? 'The gift could not be accepted.' }); return; }
      setStage({ kind: 'done', sld: body.sld, identity: body.identity ?? 'pending' });
    } catch {
      setStage({ kind: 'error', message: 'The gift could not be accepted. Please try again.' });
    }
  }

  if (stage.kind === 'loading') return <p className="text-body text-ink-2">Loading your gift…</p>;
  if (stage.kind === 'error') return <Card tone="paper-2" padded className="border border-rule"><FieldError>{stage.message}</FieldError></Card>;
  if (stage.kind === 'done') {
    return (
      <Card tone="paper-2" padded className="border border-rule">
        <div className="font-mono text-kicker uppercase text-muted mb-2">DONE</div>
        <p className="font-display font-medium text-h4 m-0">{stage.sld}.agent is yours.</p>
        <p className="text-body text-ink-2 mt-2 mb-5 max-w-[56ch]">
          {stage.identity === 'ready'
            ? 'Its identity is live under your account. Next, connect your agent so it can be reached at this name.'
            : 'The name is in your account. Open it to finish setting up its identity.'}
        </p>
        <ButtonLink href={`/names/${stage.sld}`} variant="primary" size="sm">Open {stage.sld}.agent</ButtonLink>
      </Card>
    );
  }

  const p = stage.p;
  if (p.state !== 'pending') return <Card tone="paper-2" padded className="border border-rule"><FieldError>{CLOSED[p.state]}</FieldError></Card>;
  const busy = stage.kind === 'accepting';
  return (
    <Card tone="paper-2" padded className="border border-rule">
      <div className="font-mono text-kicker uppercase text-muted mb-2">{p.from ? `FROM ${p.from.toUpperCase()}` : 'A GIFT'}</div>
      <p className="font-display font-medium text-h3 m-0 inline-flex items-center gap-3"><Dot tone="green" /> {p.domain}</p>
      {p.message && <blockquote className="mt-4 mb-0 border-l-2 border-rule pl-4 text-body text-ink-2 italic">“{p.message}”</blockquote>}
      <p className="text-body-sm text-ink-2 mt-5 mb-5 max-w-[60ch]">
        Accepting moves this name into your account. It gets a fresh identity that you own, and the sender's setup for it is retired. Nothing else about the name changes.
      </p>
      {principalDid && hasTenant ? (
        <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => void accept(p)}>{busy ? 'Accepting…' : `Accept ${p.domain}`}</Button>
      ) : (
        <div className="flex flex-col gap-2 items-start">
          <p className="text-body-sm text-ink-2 m-0">Sign in or create your account to accept it. You'll come straight back here.</p>
          <Button type="button" variant="primary" size="sm" onClick={signIn}>{principalDid ? 'Finish setting up my account' : 'Sign in to accept'}</Button>
        </div>
      )}
    </Card>
  );
}
