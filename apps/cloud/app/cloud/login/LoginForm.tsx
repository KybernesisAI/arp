'use client';

import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Card, ErrorText, Kicker, PrimaryButton, QuietLink, SecondaryButton, Tag, TextArea, TextInput } from '@/app/lander/ui';
import { isPasskeySupported, signInWithPasskey } from '@/lib/principal-key-passkey';
import {
  deriveKeysFromRecoveryPhrase,
  getOrCreatePrincipalKey,
  hasPrincipalKey,
  persistDerivedKey,
  type PrincipalKey,
} from '@/lib/principal-key-browser';
import { base64urlEncode } from '@kybernesis/arp-transport/browser';

/**
 * Login for cloud.arp.run, in the lander language.
 *
 *   0. Silent: a key already in this browser signs a challenge and you are in.
 *   1. Email code — any device; opens the dashboard without the key.
 *   2. Passkey — this device's Touch ID / Face ID / Windows Hello.
 *   3. Recovery phrase — any device; restores the key into this browser.
 *   Advanced (collapsed): a key held elsewhere signs the challenge.
 */

type AutoStage = 'checking' | 'auto-signing' | 'auto-failed' | 'no-tenant' | 'no-auto';
type PasskeyStage = 'idle' | 'pending' | 'success' | 'error';

export default function LoginForm({ nextUrl, signupHref = '/onboarding' }: { nextUrl?: string | null; signupHref?: string } = {}): React.JSX.Element {
  const successHref = nextUrl ?? '/dashboard';
  const [auto, setAuto] = useState<AutoStage>('checking');
  const [autoError, setAutoError] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState<boolean | null>(null);
  const [passkeyStage, setPasskeyStage] = useState<PasskeyStage>('idle');
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const has = await hasPrincipalKey();
        if (has) {
          setAuto('auto-signing');
          await signInExisting();
          window.location.assign(successHref);
          return;
        }
      } catch (err) {
        if (err instanceof NoTenantError) {
          setAuto('no-tenant');
          return;
        }
        setAutoError((err as Error).message);
        setAuto('auto-failed');
        return;
      }
      setAuto('no-auto');
    })();
    void isPasskeySupported().then(setPasskeySupported).catch(() => setPasskeySupported(false));
  }, []);

  async function handleClearAndContinue(): Promise<void> {
    const { clearPrincipalKey } = await import('@/lib/principal-key-browser');
    await clearPrincipalKey();
    setAuto('no-auto');
  }

  async function handlePasskey(): Promise<void> {
    setPasskeyError(null);
    setPasskeyStage('pending');
    try {
      await signInWithPasskey();
      setPasskeyStage('success');
      window.location.assign(successHref);
    } catch (err) {
      setPasskeyError((err as Error).message);
      setPasskeyStage('error');
    }
  }

  if (auto === 'checking' || auto === 'auto-signing') {
    return (
      <Card>
        <Kicker>{auto === 'checking' ? 'Checking this device…' : 'Signing in…'}</Kicker>
        <p className="mt-3 text-[15px] text-zinc-600">If this browser holds your key, you will be on your dashboard in a moment.</p>
      </Card>
    );
  }

  if (auto === 'no-tenant') {
    return (
      <Card>
        <Tag tone="zinc">Key not registered</Tag>
        <h2 className="mt-4 text-[22px] font-medium tracking-[-0.01em] text-zinc-950">This browser holds a key, but it is not tied to an account.</h2>
        <p className="mt-3 max-w-[60ch] text-[15px] text-zinc-600">
          It is probably a leftover from a test or an old session. Clearing it removes it from this browser only; your recovery phrase still works.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <PrimaryButton onClick={() => void handleClearAndContinue()}>Clear it and sign in another way</PrimaryButton>
          <a href={signupHref} className="inline-flex items-center rounded-full border border-zinc-300 px-5 py-2.5 text-[14px] font-medium text-zinc-900 hover:border-zinc-900">Create an account with it</a>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {auto === 'auto-failed' && autoError && <ErrorText>Automatic sign-in did not work ({autoError}). Use one of the options below.</ErrorText>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Email code — any device */}
        <Card glow="cyan">
          <div className="flex items-center justify-between gap-3">
            <Kicker>Email</Kicker>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">Any device</span>
          </div>
          <h2 className="mt-3 text-[20px] font-medium tracking-[-0.01em] text-zinc-950">Email me a code.</h2>
          <p className="mt-2 text-[14px] text-zinc-600">A 6-digit code to the email on your account. Good for a phone or a new computer.</p>
          <div className="mt-5" data-testid="email-code-panel"><EmailCodeSignIn successHref={successHref} /></div>
        </Card>

        {/* Passkey — this device */}
        <Card glow="emerald">
          <div className="flex items-center justify-between gap-3">
            <Kicker>Passkey</Kicker>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">This device</span>
          </div>
          <h2 className="mt-3 text-[20px] font-medium tracking-[-0.01em] text-zinc-950">Use this device.</h2>
          <p className="mt-2 text-[14px] text-zinc-600">Touch ID, Face ID or Windows Hello, if you added a passkey here. It never leaves the device.</p>
          {passkeyError && <ErrorText className="mt-3">{passkeyError}</ErrorText>}
          <div className="mt-5">
            <PrimaryButton onClick={() => void handlePasskey()} disabled={passkeyStage === 'pending' || passkeySupported === false} data-testid="passkey-signin-btn">
              {passkeyStage === 'pending' ? 'Waiting for your device…' : 'Sign in with passkey'}
            </PrimaryButton>
          </div>
          {passkeySupported === false && <p className="mt-3 text-[13px] text-zinc-500">Passkeys are not available in this browser. Use email or your recovery phrase.</p>}
        </Card>

        {/* Recovery phrase — any device, restores the key */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <Kicker>Recovery phrase</Kicker>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">Any device</span>
          </div>
          <h2 className="mt-3 text-[20px] font-medium tracking-[-0.01em] text-zinc-950">Bring your key here.</h2>
          <p className="mt-2 text-[14px] text-zinc-600">The 12 words you saved when you created the account. This puts your key in this browser, so you can also verify names and approve pairings here.</p>
          <div className="mt-5" data-testid="recovery-phrase-panel"><RecoveryPhraseSignIn successHref={successHref} /></div>
        </Card>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <p className="m-0 text-[14px] text-zinc-600">No account yet? <a href={signupHref} className="font-medium text-zinc-900 underline underline-offset-4">Create one</a>.</p>
        <QuietLink onClick={() => setAdvancedOpen((v) => !v)} data-testid="advanced-toggle">{advancedOpen ? 'Hide' : 'Advanced'}: key held outside the browser</QuietLink>
      </div>
      {advancedOpen && (
        <Card>
          <ExternalSignerSignIn successHref={successHref} />
        </Card>
      )}
    </div>
  );
}

/* ---------------- Path 0: silent re-auth from localStorage ---------------- */

async function signInExisting(): Promise<void> {
  const key = await getOrCreatePrincipalKey();
  await runChallengeVerify(key);
}

/* ---------------- Path 1: one-time email code (S6d) ---------------- */

function EmailCodeSignIn({ successHref }: { successHref: string }): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'sending' | 'code' | 'verifying'>('email');
  const [error, setError] = useState<string | null>(null);

  async function send(): Promise<void> {
    setError(null);
    setStage('sending');
    try {
      const res = await fetch('/api/auth/email/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? 'The code could not be sent.');
      setStage('code');
    } catch (err) {
      setError((err as Error).message);
      setStage('email');
    }
  }

  async function verify(): Promise<void> {
    setError(null);
    setStage('verifying');
    try {
      const res = await fetch('/api/auth/email/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, code }) });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? 'That code is not right.');
      window.location.assign(successHref);
    } catch (err) {
      setError((err as Error).message);
      setStage('code');
    }
  }

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  return (
    <div>
      {error && <ErrorText className="mb-3">{error}</ErrorText>}
      {stage === 'email' || stage === 'sending' ? (
        <div className="flex flex-col gap-2">
          <TextInput
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && emailOk) void send(); }}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-label="Email"
            data-testid="email-code-email-input"
          />
          <PrimaryButton onClick={() => void send()} disabled={stage === 'sending' || !emailOk} data-testid="email-code-send-btn">
            {stage === 'sending' ? 'Sending…' : 'Send code'}
          </PrimaryButton>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-[14px] text-zinc-800">
            Code sent to <span className="font-medium">{email.trim().toLowerCase()}</span> if that address has an account. It works for 10 minutes.
          </p>
          <div className="flex flex-col gap-2">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) void verify(); }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              aria-label="Code"
              className="font-mono text-[18px] tracking-[0.3em]"
              data-testid="email-code-code-input"
            />
            <PrimaryButton onClick={() => void verify()} disabled={stage === 'verifying' || code.length !== 6} data-testid="email-code-verify-btn">
              {stage === 'verifying' ? 'Checking…' : 'Sign in'}
            </PrimaryButton>
          </div>
          <QuietLink className="mt-3" onClick={() => { setStage('email'); setCode(''); }}>Use a different email</QuietLink>
        </div>
      )}
    </div>
  );
}

/* ---------------- Path 3a: 12-word recovery phrase, in-browser signing ---------------- */

function RecoveryPhraseSignIn({ successHref }: { successHref: string }): React.JSX.Element {
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = phrase.trim().split(/\s+/).filter(Boolean).length;

  async function handleSubmit(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const trimmed = phrase.trim().replace(/\s+/g, ' ').toLowerCase();
      if (words !== 12) throw new Error(`A recovery phrase has 12 words; this has ${words}.`);
      // Both key versions derive from the same words; the server decides which one it knows.
      const { canonicalPhrase, v1, v2 } = await deriveKeysFromRecoveryPhrase(trimmed);
      try {
        await runChallengeVerify(v2.key);
        persistDerivedKey(v2.stored, canonicalPhrase, 'v2');
        window.location.assign(successHref);
        return;
      } catch (errV2) {
        if (!(errV2 instanceof NoTenantError)) throw errV2;
      }
      try {
        await runChallengeVerify(v1.key);
        persistDerivedKey(v1.stored, canonicalPhrase, 'v1');
        window.location.assign(successHref);
        return;
      } catch (errV1) {
        if (errV1 instanceof NoTenantError) throw new Error('No account matches this phrase. Check the words, or create an account.');
        throw errV1;
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <ErrorText className="mb-3">{error}</ErrorText>}
      <TextArea
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        placeholder="twelve words, separated by spaces"
        rows={3}
        spellCheck={false}
        autoComplete="off"
        aria-label="Recovery phrase"
        data-testid="recovery-phrase-input"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">{words} / 12 words</span>
        <PrimaryButton onClick={() => void handleSubmit()} disabled={busy || words !== 12} data-testid="recovery-phrase-signin-btn">
          {busy ? 'Checking…' : 'Sign in'}
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ---------------- Advanced: a key held outside the browser signs the challenge ---------------- */

function ExternalSignerSignIn({ successHref }: { successHref: string }): React.JSX.Element {
  const [principalDid, setPrincipalDid] = useState('');
  const [nonce, setNonce] = useState<string | null>(null);
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestChallenge(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principalDid }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `challenge_failed_${res.status}`);
      }
      const data = (await res.json()) as { nonce: string };
      setNonce(data.nonce);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitSignature(): Promise<void> {
    if (!nonce) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principalDid, nonce, signature }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `verify_failed_${res.status}`);
      }
      window.location.assign(successHref);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Kicker>Key held elsewhere</Kicker>
      <p className="mt-2 max-w-[60ch] text-[14px] text-zinc-600">
        For a self-hosted runtime or automation whose key is not in this browser: paste the account identifier, sign the challenge with that key, and paste the signature.
      </p>
      {error && <ErrorText className="mt-3">{error}</ErrorText>}
      {!nonce ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <TextInput value={principalDid} onChange={(e) => setPrincipalDid(e.target.value)} placeholder="account identifier" className="font-mono text-[13px]" data-testid="advanced-principal-did-input" />
          <PrimaryButton className="shrink-0" onClick={() => void requestChallenge()} disabled={busy || !principalDid} data-testid="advanced-request-challenge-btn">Get a challenge</PrimaryButton>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-[14px] text-zinc-800">Sign this exactly, then paste the signature:</p>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-zinc-50 p-3 font-mono text-[12px] text-zinc-800" data-testid="advanced-nonce">{nonce}</pre>
          <TextArea className="mt-3 font-mono text-[13px]" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="signature" rows={2} data-testid="advanced-signature-input" />
          <div className="mt-3 flex gap-2">
            <PrimaryButton onClick={() => void submitSignature()} disabled={busy || !signature} data-testid="advanced-verify-btn">Sign in</PrimaryButton>
            <SecondaryButton onClick={() => { setNonce(null); setSignature(''); }}>Start over</SecondaryButton>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Shared ---------------- */

class NoTenantError extends Error {
  readonly principalDid: string;
  constructor(principalDid: string) {
    super(`no tenant registered for ${principalDid}`);
    this.name = 'NoTenantError';
    this.principalDid = principalDid;
  }
}

async function runChallengeVerify(key: PrincipalKey): Promise<void> {
  const cRes = await fetch('/api/auth/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principalDid: key.did }) });
  if (!cRes.ok) {
    const body = (await cRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `challenge_failed_${cRes.status}`);
  }
  const cData = (await cRes.json()) as { nonce: string };
  const sigBytes = await key.sign(new TextEncoder().encode(cData.nonce));
  const signature = base64urlEncode(sigBytes);
  const vRes = await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principalDid: key.did, nonce: cData.nonce, signature }) });
  if (!vRes.ok) {
    const body = (await vRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `verify_failed_${vRes.status}`);
  }
  const vBody = (await vRes.json().catch(() => ({}))) as { ok?: boolean; session?: { tenantId?: string | null } };
  if (!vBody.session?.tenantId) throw new NoTenantError(key.did);
}
