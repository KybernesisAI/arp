'use client';

import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Card, ErrorText, Kicker, PrimaryButton, TextArea } from '@/app/lander/ui';
import { installTransferredKey, loadPrincipalKeyFor, unlockKeyFromPhrase, type PrincipalKey } from '@/lib/principal-key-browser';
import { createReceiver, openFromSender } from '@/lib/device-link-crypto';

/**
 * "This device does not have your account key" — shown by any action that
 * must sign with the account key when the session came from an email code or
 * a passkey on a device that never held the key. Two ways in:
 *   1. get it from a device that has it (6-digit code, key travels sealed)
 *   2. type the 12-word recovery phrase
 * Either way the key then lives in this browser like on the original device.
 */
export function UnlockKey({ sessionPrincipalDid, action, onUnlocked, className = '' }: { sessionPrincipalDid: string; action: string; onUnlocked: (key: PrincipalKey) => void; className?: string }): React.JSX.Element {
  const [mode, setMode] = useState<'device' | 'phrase'>('device');
  return (
    <Card glow="emerald" className={className}>
      <Kicker>Account key needed</Kicker>
      <h2 className="mt-2 text-[20px] font-medium tracking-[-0.01em] text-zinc-950">This device does not have your account key yet.</h2>
      <p className="mt-2 max-w-[60ch] text-[15px] text-zinc-600">
        You are signed in, but to {action} this browser has to sign with your key. Bring it here once and it stays, like on the device you set up with.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <ModeTab on={mode === 'device'} onClick={() => setMode('device')}>From a device that has it</ModeTab>
        <ModeTab on={mode === 'phrase'} onClick={() => setMode('phrase')}>Type the recovery phrase</ModeTab>
      </div>
      {mode === 'device' ? <DeviceLinkReceiver sessionPrincipalDid={sessionPrincipalDid} onUnlocked={onUnlocked} /> : <PhraseUnlock sessionPrincipalDid={sessionPrincipalDid} onUnlocked={onUnlocked} />}
    </Card>
  );
}

function ModeTab({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }): React.JSX.Element {
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-4 py-2 text-[13px] font-medium ${on ? 'border-black bg-black text-white' : 'border-zinc-300 text-zinc-700 hover:border-zinc-900'}`}>
      {children}
    </button>
  );
}

/* ---------------- 1. From a device that has it ---------------- */

function DeviceLinkReceiver({ sessionPrincipalDid, onUnlocked }: { sessionPrincipalDid: string; onUnlocked: (key: PrincipalKey) => void }): React.JSX.Element {
  const [stage, setStage] = useState<'idle' | 'starting' | 'waiting' | 'installing' | 'expired' | 'error'>('idle');
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const receiver = useRef<{ id: string; pub: string; privateKey: CryptoKey } | null>(null);

  async function start(): Promise<void> {
    setError(null);
    setStage('starting');
    try {
      const r = await createReceiver();
      const res = await fetch('/api/account/device-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ receiver_pub: r.pub }) });
      const body = (await res.json().catch(() => ({}))) as { id?: string; code?: string; message?: string };
      if (!res.ok || !body.id || !body.code) throw new Error(body.message ?? 'Could not start. Try again.');
      receiver.current = { id: body.id, pub: r.pub, privateKey: r.privateKey };
      setCode(body.code);
      setStage('waiting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start.');
      setStage('error');
    }
  }

  useEffect(() => {
    if (stage !== 'waiting') return;
    let alive = true;
    const tick = async (): Promise<void> => {
      const r = receiver.current;
      if (!r || !alive) return;
      try {
        const res = await fetch(`/api/account/device-link/${r.id}`, { cache: 'no-store' });
        const body = (await res.json().catch(() => ({}))) as { status?: string; ciphertext?: string; iv?: string; sender_pub?: string };
        if (!alive) return;
        if (body.status === 'expired') { setStage('expired'); return; }
        if (body.status === 'delivered' && body.ciphertext && body.iv && body.sender_pub) {
          setStage('installing');
          const payload = await openFromSender(r.privateKey, r.pub, { ciphertext: body.ciphertext, iv: body.iv, senderPub: body.sender_pub });
          const key = await installTransferredKey(payload, sessionPrincipalDid);
          if (alive) onUnlocked(key);
          return;
        }
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        setStage('error');
        return;
      }
      if (alive) setTimeout(() => void tick(), 2500);
    };
    void tick();
    return () => { alive = false; };
  }, [stage, sessionPrincipalDid, onUnlocked]);

  if (stage === 'waiting' || stage === 'installing') {
    return (
      <div className="mt-5">
        <p className="text-[15px] text-zinc-800">On a device that has your key, open <span className="font-medium">Account → Add another device</span> and enter this code:</p>
        <p className="mt-3 font-mono text-[40px] tracking-[0.3em] text-zinc-950" data-testid="device-link-code">{code?.slice(0, 3)} {code?.slice(3)}</p>
        <p className="mt-2 text-[13px] text-zinc-500">{stage === 'installing' ? 'Key received, setting it up…' : 'Waiting… this code works for 10 minutes.'}</p>
      </div>
    );
  }
  return (
    <div className="mt-5">
      {stage === 'expired' && <p className="mb-3 text-[14px] text-zinc-700">That code expired. Get a new one.</p>}
      {error && <ErrorText className="mb-3">{error}</ErrorText>}
      <p className="text-[14px] text-zinc-600">You get a 6-digit code to type into the device that has the key. The key travels sealed; we cannot read it.</p>
      <div className="mt-4"><PrimaryButton onClick={() => void start()} disabled={stage === 'starting'} data-testid="device-link-start-btn">{stage === 'starting' ? 'One moment…' : 'Show me a code'}</PrimaryButton></div>
    </div>
  );
}

/* ---------------- 2. Recovery phrase ---------------- */

function PhraseUnlock({ sessionPrincipalDid, onUnlocked }: { sessionPrincipalDid: string; onUnlocked: (key: PrincipalKey) => void }): React.JSX.Element {
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = phrase.trim().split(/\s+/).filter(Boolean).length;

  async function unlock(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const key = await unlockKeyFromPhrase(phrase, sessionPrincipalDid);
      onUnlocked(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock the key.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      {error && <ErrorText className="mb-3">{error}</ErrorText>}
      <TextArea value={phrase} onChange={(e) => setPhrase(e.target.value)} rows={2} placeholder="twelve words, separated by spaces" spellCheck={false} autoComplete="off" aria-label="Recovery phrase" data-testid="unlock-key-phrase" />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">{words} / 12 words</span>
        <PrimaryButton onClick={() => void unlock()} disabled={busy || words !== 12} data-testid="unlock-key-btn">{busy ? 'Unlocking…' : 'Unlock on this device'}</PrimaryButton>
      </div>
      <p className="mt-3 text-[13px] text-zinc-500">Your phrase is on the account page of a device that has the key, under Recovery phrase.</p>
    </div>
  );
}

/* ---------------- Sender side: a device that has the key adds another ---------------- */

export function LinkDevicePanel({ sessionPrincipalDid }: { sessionPrincipalDid: string }): React.JSX.Element {
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function send(): Promise<void> {
    setError(null);
    setStage('busy');
    try {
      const { exportStoredKeyFor } = await import('@/lib/principal-key-browser');
      const { sealForReceiver } = await import('@/lib/device-link-crypto');
      const stored = exportStoredKeyFor(sessionPrincipalDid);
      if (!stored) throw new Error('This device does not hold the account key.');
      const claim = await fetch('/api/account/device-link/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
      const cb = (await claim.json().catch(() => ({}))) as { id?: string; receiver_pub?: string; message?: string };
      if (!claim.ok || !cb.id || !cb.receiver_pub) throw new Error(cb.message ?? 'That code is not right.');
      const sealed = await sealForReceiver(cb.receiver_pub, stored);
      const del = await fetch('/api/account/device-link/deliver', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: cb.id, ciphertext: sealed.ciphertext, iv: sealed.iv, sender_pub: sealed.senderPub }) });
      const db = (await del.json().catch(() => ({}))) as { message?: string };
      if (!del.ok) throw new Error(db.message ?? 'Could not send the key.');
      setStage('done');
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the key.');
      setStage('idle');
    }
  }

  return (
    <section>
      <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
        <h2 className="font-display font-medium text-h3">Add another device</h2>
      </header>
      <p className="text-body-sm text-ink-2 mb-4 max-w-[60ch]">
        Signed in on another computer or phone but it says the key is not there? On that device choose "From a device that has it", then type its 6-digit code here. The key travels sealed to that device only.
      </p>
      {error && <ErrorText className="mb-3">{error}</ErrorText>}
      {stage === 'done' ? (
        <p className="text-[15px] text-emerald-700" data-testid="device-link-done">Sent. The other device has your key now.</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="123456" aria-label="Code from the other device" className="w-full max-w-[220px] rounded-xl border border-zinc-300 px-4 py-2.5 font-mono text-[18px] tracking-[0.3em] outline-none focus:border-zinc-900" data-testid="device-link-code-input" />
          <PrimaryButton onClick={() => void send()} disabled={stage === 'busy' || code.length !== 6} data-testid="device-link-send-btn">{stage === 'busy' ? 'Sending…' : 'Send my key there'}</PrimaryButton>
        </div>
      )}
    </section>
  );
}

/**
 * Does this browser hold the key for the signed-in account?
 * `null` while checking; the setter lets a form flip to `true` after an unlock.
 */
export function useDeviceKey(sessionPrincipalDid: string | null): [boolean | null, (v: boolean) => void] {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    if (!sessionPrincipalDid) { setHas(false); return; }
    let alive = true;
    void loadPrincipalKeyFor(sessionPrincipalDid).then((k) => { if (alive) setHas(k !== null); }).catch(() => { if (alive) setHas(false); });
    return () => { alive = false; };
  }, [sessionPrincipalDid]);
  return [has, setHas];
}
