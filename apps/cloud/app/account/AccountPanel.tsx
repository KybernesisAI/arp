'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Card, Kicker } from '@/app/lander/ui';

/**
 * Name + email, the two things a non-technical owner actually manages.
 * The name is what "Verify ownership" offers as the owner label; the email
 * is a second way in (one-time code) so the account is reachable from a
 * device that does not hold the key.
 */
export function AccountPanel({ initialName, initialEmail, emailVerified, agentCount, plan }: { initialName: string | null; initialEmail: string | null; emailVerified: boolean; agentCount: number; plan: string }): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <NameCard initialName={initialName} />
      <EmailCard initialEmail={initialEmail} emailVerified={emailVerified} />
      <Card className="md:col-span-2">
        <Kicker>This account</Kicker>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[14px] sm:grid-cols-4">
          <div><dt className="text-zinc-500">Names</dt><dd className="m-0 font-medium text-zinc-900">{agentCount}</dd></div>
          <div><dt className="text-zinc-500">Plan</dt><dd className="m-0 font-medium capitalize text-zinc-900">{plan}</dd></div>
          <div><dt className="text-zinc-500">Key</dt><dd className="m-0 font-medium text-zinc-900">In this browser</dd></div>
          <div><dt className="text-zinc-500">Sign-in</dt><dd className="m-0 font-medium text-zinc-900">{emailVerified ? 'Key, passkey or email' : 'Key or passkey'}</dd></div>
        </dl>
        <p className="mt-4 text-[13px] text-zinc-500">Signing in by email opens the dashboard on any device. Actions that need your key — verifying ownership of a name, approving a pairing — still ask for the recovery phrase or a passkey on that device.</p>
      </Card>
    </div>
  );
}

function NameCard({ initialName }: { initialName: string | null }): React.JSX.Element {
  const [name, setName] = useState(initialName ?? '');
  const [saved, setSaved] = useState(initialName ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function save(): Promise<void> {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/account', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? 'Could not save.');
      setSaved(name.trim()); setMsg('Saved.');
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Card glow="emerald">
      <Kicker>Your name</Kicker>
      <p className="mt-2 text-[14px] text-zinc-600">Shown as the owner on your agents' public pages, and offered as the owner label when you verify a name.</p>
      <div className="mt-4 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ian" maxLength={60} className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-[15px] outline-none focus:border-zinc-900" aria-label="Your name" />
        <button type="button" onClick={() => void save()} disabled={busy || name.trim() === saved || name.trim().length === 0} className="shrink-0 rounded-full bg-black px-5 py-2.5 text-[14px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {msg && <p className="mt-2 text-[13px] text-zinc-500">{msg}</p>}
    </Card>
  );
}

function EmailCard({ initialEmail, emailVerified }: { initialEmail: string | null; emailVerified: boolean }): React.JSX.Element {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [current, setCurrent] = useState<{ email: string | null; verified: boolean }>({ email: initialEmail, verified: emailVerified });
  const [stage, setStage] = useState<'idle' | 'sending' | 'code' | 'confirming' | 'done'>('idle');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const changed = email.trim().toLowerCase() !== (current.email ?? '') || !current.verified;

  async function start(): Promise<void> {
    setError(null); setStage('sending');
    try {
      const res = await fetch('/api/account/email/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? 'The code could not be sent.');
      setStage('code');
    } catch (err) { setError(err instanceof Error ? err.message : 'The code could not be sent.'); setStage('idle'); }
  }
  async function confirm(): Promise<void> {
    setError(null); setStage('confirming');
    try {
      const res = await fetch('/api/account/email/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, code }) });
      const body = (await res.json().catch(() => ({}))) as { message?: string; email?: string };
      if (!res.ok) throw new Error(body.message ?? 'That code is not right.');
      setCurrent({ email: body.email ?? email.trim().toLowerCase(), verified: true }); setStage('done'); setCode('');
    } catch (err) { setError(err instanceof Error ? err.message : 'That code is not right.'); setStage('code'); }
  }

  return (
    <Card glow="cyan">
      <div className="flex items-baseline justify-between gap-3">
        <Kicker>Email</Kicker>
        {current.email && <span className={`font-mono text-[11px] uppercase tracking-[0.14em] ${current.verified ? 'text-emerald-700' : 'text-amber-700'}`}>{current.verified ? 'Verified' : 'Not verified'}</span>}
      </div>
      <p className="mt-2 text-[14px] text-zinc-600">Sign in from any device with a one-time code. We only email you codes you ask for.</p>
      {stage === 'code' || stage === 'confirming' ? (
        <div className="mt-4">
          <p className="text-[14px] text-zinc-800">We sent a 6-digit code to <span className="font-medium">{email.trim().toLowerCase()}</span>. It works for 10 minutes.</p>
          <div className="mt-3 flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 font-mono text-[18px] tracking-[0.3em] outline-none focus:border-zinc-900" aria-label="Code" />
            <button type="button" onClick={() => void confirm()} disabled={code.length !== 6 || stage === 'confirming'} className="shrink-0 rounded-full bg-black px-5 py-2.5 text-[14px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40">{stage === 'confirming' ? 'Checking…' : 'Confirm'}</button>
          </div>
          <button type="button" onClick={() => void start()} className="mt-3 font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-900">Send a new code</button>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" autoComplete="email" className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-[15px] outline-none focus:border-zinc-900" aria-label="Email" />
          <button type="button" onClick={() => void start()} disabled={stage === 'sending' || !changed || !/^\S+@\S+\.\S+$/.test(email.trim())} className="shrink-0 rounded-full bg-black px-5 py-2.5 text-[14px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40">{stage === 'sending' ? 'Sending…' : current.email && current.verified ? 'Change' : 'Verify'}</button>
        </div>
      )}
      {stage === 'done' && <p className="mt-2 text-[13px] text-emerald-700">Email verified. You can sign in with it from any device.</p>}
      {error && <p className="mt-2 text-[13px] text-red-700">{error}</p>}
    </Card>
  );
}
