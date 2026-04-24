'use client';

import type * as React from 'react';
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  ButtonLink,
  FieldError,
  FieldHint,
  Input,
  Label,
  Pre,
  Textarea,
} from '@/components/ui';
import {
  isPasskeySupported,
  signInWithPasskey,
} from '@/lib/principal-key-passkey';

/**
 * Phase-9d login form.
 *
 * Two sign-in paths:
 *
 *   - Primary: passkey (WebAuthn). Resident-credential flow — the user
 *     clicks the button, the browser prompts for Touch/Face/Hello, and
 *     the server issues a session cookie.
 *
 *   - Secondary: did:key recovery-phrase. Expands an advanced panel that
 *     drives the Phase-8.5 challenge/verify flow against an existing
 *     browser-held key (or a key re-imported from the recovery phrase).
 *     Users who haven't yet registered a passkey land here until they
 *     migrate.
 */

type PasskeyStage = 'idle' | 'pending' | 'success' | 'error';

export default function LoginForm(): React.JSX.Element {
  const [passkeySupported, setPasskeySupported] = useState<boolean | null>(null);
  const [stage, setStage] = useState<PasskeyStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    void isPasskeySupported().then(setPasskeySupported).catch(() => setPasskeySupported(false));
  }, []);

  async function handlePasskey(): Promise<void> {
    setError(null);
    setStage('pending');
    try {
      await signInWithPasskey();
      setStage('success');
      // Hard navigation so the dashboard picks up the freshly-set cookie.
      window.location.assign('/dashboard');
    } catch (err) {
      setError((err as Error).message);
      setStage('error');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border border-rule bg-paper p-7">
        <Badge tone="blue" className="mb-3">
          SIGN IN · PASSKEY
        </Badge>
        <h2 className="font-display font-medium text-h3 mt-0 mb-3">
          Sign in with your device.
        </h2>
        <p className="text-body text-ink-2 mb-5">
          Touch ID, Face ID, or Windows Hello — whichever your device provides. Your passkey
          stays on this device; we never see it.
        </p>
        {error && <FieldError className="mb-4">Error: {error}</FieldError>}
        <Button
          variant="primary"
          arrow
          onClick={() => void handlePasskey()}
          disabled={stage === 'pending' || passkeySupported === false}
          data-testid="passkey-signin-btn"
        >
          {stage === 'pending' ? 'Waiting for passkey…' : 'Sign in with passkey'}
        </Button>
        {passkeySupported === false && (
          <p className="mt-3 font-mono text-kicker uppercase text-muted">
            PASSKEYS UNAVAILABLE IN THIS BROWSER · USE RECOVERY PHRASE BELOW
          </p>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          data-testid="advanced-login-toggle"
          className="font-mono text-kicker uppercase text-muted hover:text-ink transition-colors border-b border-current pb-0.5"
        >
          {advancedOpen ? '▾' : '▸'} Sign in with recovery phrase (advanced)
        </button>
        {advancedOpen && (
          <div className="border border-rule bg-paper p-7 mt-3">
            <RecoveryPhraseSignIn />
          </div>
        )}
      </div>

      <div className="font-mono text-kicker uppercase text-muted">
        NO ACCOUNT? <span className="not-italic"><a href="/onboarding" className="underline">CREATE ONE</a></span>
      </div>
    </div>
  );
}

/**
 * Sidecar / recovery-phrase sign-in. Drives the Phase-8.5
 * challenge/verify flow against a DID the user provides. Used until
 * a passkey is added to the account.
 */
function RecoveryPhraseSignIn(): React.JSX.Element {
  const [principalDid, setPrincipalDid] = useState('');
  const [nonce, setNonce] = useState<string | null>(null);
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function requestChallenge(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ principalDid }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'challenge_failed');
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
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ principalDid, nonce, signature }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'verify_failed');
      setDone(true);
      window.location.assign('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div>
        <Badge tone="blue" className="mb-3">
          SIGNED IN
        </Badge>
        <p className="text-body">Redirecting to dashboard…</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="font-display font-medium text-h4 mt-0 mb-2">
        Sign in with a recovery phrase
      </h3>
      <p className="text-body-sm text-ink-2 mb-4">
        Paste your principal DID and sign the challenge with your browser-held or sidecar-held
        private key. We recommend adding a passkey once you're in.
      </p>
      {error && <FieldError className="mb-3">Error: {error}</FieldError>}
      {!nonce && (
        <>
          <Label>Principal DID</Label>
          <Input
            value={principalDid}
            onChange={(e) => setPrincipalDid(e.target.value)}
            placeholder="did:key:z6Mk…"
            className="font-mono"
            data-testid="advanced-principal-did-input"
          />
          <FieldHint>YOUR BROWSER-HELD OR SIDECAR-HELD DID</FieldHint>
          <div className="mt-4">
            <Button
              variant="primary"
              arrow
              onClick={() => void requestChallenge()}
              disabled={busy || !principalDid}
            >
              Request challenge
            </Button>
          </div>
        </>
      )}
      {nonce && (
        <>
          <p className="text-body-sm text-ink-2 mb-2">
            Sign this nonce with your principal DID private key, then paste the base64url
            signature.
          </p>
          <Pre>{nonce}</Pre>
          <div className="mt-4">
            <Label>Signature</Label>
            <Textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="base64url signature"
            />
          </div>
          <div className="mt-4">
            <Button
              variant="primary"
              arrow
              onClick={() => void submitSignature()}
              disabled={busy || !signature}
            >
              Verify & sign in
            </Button>
            <ButtonLink
              href="/cloud/login"
              variant="default"
              size="md"
              className="ml-3"
              onClick={() => {
                setNonce(null);
                setSignature('');
              }}
            >
              Restart
            </ButtonLink>
          </div>
        </>
      )}
    </div>
  );
}
