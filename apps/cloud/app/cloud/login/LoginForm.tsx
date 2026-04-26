'use client';

import type * as React from 'react';
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  ButtonLink,
  FieldError,
  FieldHint,
  Label,
  Pre,
  Textarea,
} from '@/components/ui';
import {
  isPasskeySupported,
  signInWithPasskey,
} from '@/lib/principal-key-passkey';
import {
  deriveKeysFromRecoveryPhrase,
  getOrCreatePrincipalKey,
  hasPrincipalKey,
  persistDerivedKey,
  type PrincipalKey,
} from '@/lib/principal-key-browser';
import { base64urlEncode } from '@kybernesis/arp-transport/browser';

/**
 * Login form for cloud.arp.run.
 *
 * Three sign-in paths, in priority order:
 *
 *   1. Auto-detect: if `arp.cloud.principalKey.v2` is in localStorage we
 *      derive the key + sign a server-issued challenge silently. Same-
 *      device users one-click sign in with no UI.
 *
 *   2. Passkey: WebAuthn resident credential. Works for accounts that
 *      registered a passkey post-onboard.
 *
 *   3. Recovery phrase: paste the 12-word phrase, derive the key in-
 *      browser, sign the challenge in-browser. No external signer
 *      required — the previous form took a bare DID + a base64url
 *      signature pasted by the user, which is a CLI flow most users
 *      can't actually execute. The CLI/sidecar variant is preserved
 *      under "Advanced".
 */

type AutoStage = 'checking' | 'auto-signing' | 'auto-failed' | 'no-tenant' | 'no-auto';
type PasskeyStage = 'idle' | 'pending' | 'success' | 'error';

export default function LoginForm(): React.JSX.Element {
  const [auto, setAuto] = useState<AutoStage>('checking');
  const [autoError, setAutoError] = useState<string | null>(null);
  const [autoDid, setAutoDid] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState<boolean | null>(null);
  const [passkeyStage, setPasskeyStage] = useState<PasskeyStage>('idle');
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const has = await hasPrincipalKey();
        if (has) {
          setAuto('auto-signing');
          await signInExisting();
          return;
        }
      } catch (err) {
        if (err instanceof NoTenantError) {
          setAutoDid(err.principalDid);
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
    setAutoDid(null);
  }

  async function handlePasskey(): Promise<void> {
    setPasskeyError(null);
    setPasskeyStage('pending');
    try {
      await signInWithPasskey();
      setPasskeyStage('success');
      window.location.assign('/dashboard');
    } catch (err) {
      setPasskeyError((err as Error).message);
      setPasskeyStage('error');
    }
  }

  if (auto === 'checking' || auto === 'auto-signing') {
    return (
      <div className="border border-rule bg-paper p-7">
        <p className="font-mono text-kicker uppercase text-muted">
          {auto === 'checking' ? 'CHECKING THIS DEVICE…' : 'SIGNING IN…'}
        </p>
      </div>
    );
  }

  if (auto === 'no-tenant' && autoDid) {
    return (
      <div className="flex flex-col gap-6">
        <div className="border border-rule bg-paper p-7">
          <Badge tone="yellow" className="mb-3">
            KEY NOT REGISTERED ON THIS DEVICE
          </Badge>
          <h2 className="font-display font-medium text-h3 mt-0 mb-3">
            This browser has a principal key, but it&apos;s not yours.
          </h2>
          <p className="text-body text-ink-2 mb-3">
            We found a principal key in this browser&apos;s storage and verified
            it cryptographically, but no ARP Cloud tenant is registered to it.
            That key isn&apos;t your account — it&apos;s a leftover (stale localStorage,
            test session, etc.). Sign in with your recovery phrase to reach
            your real account.
          </p>
          <Pre className="mb-5">{autoDid}</Pre>
          <Button
            variant="primary"
            arrow
            onClick={() => void handleClearAndContinue()}
          >
            Sign in with my recovery phrase
          </Button>
          <p className="mt-4 font-mono text-kicker uppercase text-muted">
            CLEARING THE LOCAL KEY DELETES IT FROM THIS BROWSER ONLY · YOUR PHRASE STILL WORKS
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {auto === 'auto-failed' && autoError && (
        <FieldError>Auto sign-in failed: {autoError}. Use a path below.</FieldError>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-rule border border-rule">
        {/* Passkey path */}
        <div className="bg-paper p-7">
          <Badge tone="blue" className="mb-3">
            PASSKEY · THIS DEVICE
          </Badge>
          <h2 className="font-display font-medium text-h3 mt-0 mb-3">
            Sign in with your device.
          </h2>
          <p className="text-body text-ink-2 mb-5">
            Touch ID, Face ID, or Windows Hello — whichever your device provides. Your passkey
            stays on this device; we never see it.
          </p>
          {passkeyError && <FieldError className="mb-4">Error: {passkeyError}</FieldError>}
          <Button
            variant="primary"
            arrow
            onClick={() => void handlePasskey()}
            disabled={passkeyStage === 'pending' || passkeySupported === false}
            data-testid="passkey-signin-btn"
          >
            {passkeyStage === 'pending' ? 'Waiting for passkey…' : 'Sign in with passkey'}
          </Button>
          {passkeySupported === false && (
            <p className="mt-3 font-mono text-kicker uppercase text-muted">
              PASSKEYS UNAVAILABLE IN THIS BROWSER · USE RECOVERY PHRASE →
            </p>
          )}
        </div>

        {/* Recovery phrase path — peer of passkey, no longer hidden */}
        <div className="bg-paper-2 p-7" data-testid="recovery-phrase-panel">
          <Badge tone="yellow" className="mb-3">
            RECOVERY PHRASE · ANY DEVICE
          </Badge>
          <h2 className="font-display font-medium text-h3 mt-0 mb-3">
            Sign in from a new browser.
          </h2>
          <p className="text-body text-ink-2 mb-5">
            Paste the 12-word phrase you saved when you created the account.
            Use this when your passkey isn&apos;t on this device — for example,
            you&apos;re signing in to localhost or a fresh install.
          </p>
          <RecoveryPhraseSignIn />
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          data-testid="advanced-toggle"
          className="font-mono text-kicker uppercase text-muted hover:text-ink transition-colors border-b border-current pb-0.5"
        >
          {advancedOpen ? '▾' : '▸'} Advanced: external signer (DID + base64url signature)
        </button>
        {advancedOpen && (
          <div className="border border-rule bg-paper p-7 mt-3">
            <ExternalSignerSignIn />
          </div>
        )}
      </div>

      <div className="font-mono text-kicker uppercase text-muted">
        NO ACCOUNT? <span className="not-italic"><a href="/onboarding" className="underline">CREATE ONE</a></span>
      </div>
    </div>
  );
}

/* ---------------- Path 1: silent re-auth from localStorage ---------------- */

async function signInExisting(): Promise<void> {
  const key = await getOrCreatePrincipalKey();
  await runChallengeVerify(key);
}

/* ---------------- Path 3a: 12-word recovery phrase, in-browser signing ---------------- */

function RecoveryPhraseSignIn(): React.JSX.Element {
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const trimmed = phrase.trim().replace(/\s+/g, ' ').toLowerCase();
      const wordCount = trimmed.split(' ').filter(Boolean).length;
      if (wordCount !== 12) {
        throw new Error(`expected 12 words, got ${wordCount}`);
      }
      // Derive BOTH v1 and v2 keys from the phrase WITHOUT persisting.
      // v1 (entropy-padded seed, Phase 8.5) and v2 (HKDF-SHA256, Phase 9d)
      // produce different DIDs from the same entropy. We don't know which
      // version the user's tenant was registered under, so try v2 first,
      // fall back to v1, and persist whichever the server recognises.
      const { canonicalPhrase, v1, v2 } = await deriveKeysFromRecoveryPhrase(
        trimmed,
      );

      // Attempt v2 first — that's the post-9d default.
      try {
        await runChallengeVerify(v2.key);
        // Success: persist v2 to localStorage and let runChallengeVerify
        // do the redirect.
        persistDerivedKey(v2.stored, canonicalPhrase, 'v2');
        return;
      } catch (errV2) {
        if (!(errV2 instanceof NoTenantError)) {
          throw errV2; // network or signature error — surface as-is
        }
        // v2 derivation has no tenant; try v1.
      }

      try {
        await runChallengeVerify(v1.key);
        persistDerivedKey(v1.stored, canonicalPhrase, 'v1');
        return;
      } catch (errV1) {
        if (errV1 instanceof NoTenantError) {
          throw new Error(
            `This recovery phrase derives ${v2.key.did} (v2 HKDF) and ${v1.key.did} (v1 entropy-padded), but neither has a registered ARP Cloud tenant. Either visit /onboarding to create an account with this key, or paste a different recovery phrase.`,
          );
        }
        throw errV1;
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <FieldError className="mb-3">Error: {error}</FieldError>}
      <Label>Recovery phrase</Label>
      <Textarea
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        placeholder="forest table tomato breath cluster pine cobalt amber violet inside breeze ocean"
        rows={3}
        spellCheck={false}
        autoComplete="off"
        data-testid="recovery-phrase-input"
      />
      <FieldHint>12 SPACE-SEPARATED BIP-39 WORDS</FieldHint>
      <div className="mt-4">
        <Button
          variant="primary"
          arrow
          onClick={() => void handleSubmit()}
          disabled={busy || phrase.trim().split(/\s+/).filter(Boolean).length !== 12}
          data-testid="recovery-phrase-signin-btn"
        >
          {busy ? 'Verifying…' : 'Re-import & sign in'}
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Path 3b: bare DID + externally-signed nonce (CLI users) ---------------- */

function ExternalSignerSignIn(): React.JSX.Element {
  const [principalDid, setPrincipalDid] = useState('');
  const [nonce, setNonce] = useState<string | null>(null);
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestChallenge(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ principalDid }),
      });
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
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ principalDid, nonce, signature }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `verify_failed_${res.status}`);
      }
      window.location.assign('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-body-sm text-ink-2 mb-4">
        For sidecar users, automation, or anyone whose private key lives outside the browser.
        Paste your DID, request a challenge, sign the nonce externally, and submit the
        base64url Ed25519 signature.
      </p>
      {error && <FieldError className="mb-3">Error: {error}</FieldError>}
      {!nonce && (
        <>
          <Label>Principal DID</Label>
          <input
            value={principalDid}
            onChange={(e) => setPrincipalDid(e.target.value)}
            placeholder="did:key:z6Mk… or did:web:…"
            className="font-mono w-full border border-rule bg-paper px-3 py-2 text-sm"
            data-testid="advanced-principal-did-input"
          />
          <FieldHint>YOUR PRINCIPAL DID</FieldHint>
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
            Sign this nonce with your principal DID&apos;s private key, then paste the
            base64url Ed25519 signature.
          </p>
          <Pre>{nonce}</Pre>
          <div className="mt-4">
            <Label>Signature</Label>
            <Textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="base64url signature"
              rows={3}
            />
          </div>
          <div className="mt-4">
            <Button
              variant="primary"
              arrow
              onClick={() => void submitSignature()}
              disabled={busy || !signature}
            >
              Verify &amp; sign in
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

/* ---------------- shared challenge → sign → verify → redirect ---------------- */

/**
 * Runs the full Phase-8.5 challenge/verify dance and redirects to
 * /dashboard on success. Throws on:
 *   - challenge or verify HTTP failure
 *   - verify success but server returned `tenantId: null` (key is
 *     cryptographically valid but isn't registered to any tenant)
 *
 * The "no tenant" case is what surfaces when a user has a principal
 * key in localStorage from earlier testing but the corresponding
 * tenant row got cleaned up. Returning a typed error so the caller
 * can surface a "this key isn't registered — create an account or
 * use a different key" UI instead of silently redirecting away.
 */
class NoTenantError extends Error {
  readonly principalDid: string;
  constructor(principalDid: string) {
    super(`no tenant registered for ${principalDid}`);
    this.name = 'NoTenantError';
    this.principalDid = principalDid;
  }
}

async function runChallengeVerify(key: PrincipalKey): Promise<void> {
  const cRes = await fetch('/api/auth/challenge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ principalDid: key.did }),
  });
  if (!cRes.ok) {
    const body = (await cRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `challenge_failed_${cRes.status}`);
  }
  const cData = (await cRes.json()) as { nonce: string };
  const sigBytes = await key.sign(new TextEncoder().encode(cData.nonce));
  const signature = base64urlEncode(sigBytes);
  const vRes = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ principalDid: key.did, nonce: cData.nonce, signature }),
  });
  if (!vRes.ok) {
    const body = (await vRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `verify_failed_${vRes.status}`);
  }
  const vBody = (await vRes.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: { tenantId?: string | null };
  };
  if (!vBody.session?.tenantId) {
    throw new NoTenantError(key.did);
  }
  window.location.assign('/dashboard');
}

export { NoTenantError };
