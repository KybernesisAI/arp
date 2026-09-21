'use client';

import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Card, ErrorText, Kicker, PrimaryButton, TextArea } from '@/app/lander/ui';
import { loadPrincipalKeyFor, unlockKeyFromPhrase, type PrincipalKey } from '@/lib/principal-key-browser';

/**
 * "This device does not have your account key" — shown by any action that
 * must sign with the account key (change permissions, pair, approve, verify
 * a name) when the session came from an email code or a passkey on a device
 * that never held the key. The owner pastes the 12 words once; the key then
 * lives in this browser like on the original device.
 */
export function UnlockKey({ sessionPrincipalDid, action, onUnlocked, className = '' }: { sessionPrincipalDid: string; action: string; onUnlocked: (key: PrincipalKey) => void; className?: string }): React.JSX.Element {
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
    <Card glow="emerald" className={className}>
      <Kicker>Account key needed</Kicker>
      <h2 className="mt-2 text-[20px] font-medium tracking-[-0.01em] text-zinc-950">This device does not have your account key yet.</h2>
      <p className="mt-2 max-w-[60ch] text-[15px] text-zinc-600">
        You are signed in, but to {action} this browser has to sign with your key. Enter your 12-word recovery phrase once and the key stays here, like on the device you set up with.
      </p>
      {error && <ErrorText className="mt-3">{error}</ErrorText>}
      <TextArea className="mt-4" value={phrase} onChange={(e) => setPhrase(e.target.value)} rows={2} placeholder="twelve words, separated by spaces" spellCheck={false} autoComplete="off" aria-label="Recovery phrase" data-testid="unlock-key-phrase" />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">{words} / 12 words</span>
        <PrimaryButton onClick={() => void unlock()} disabled={busy || words !== 12} data-testid="unlock-key-btn">{busy ? 'Unlocking…' : 'Unlock on this device'}</PrimaryButton>
      </div>
      <p className="mt-3 text-[13px] text-zinc-500">Your phrase is on the account page of the device you set up with, under Recovery phrase.</p>
    </Card>
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
