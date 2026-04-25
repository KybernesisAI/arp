'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { base64urlEncode } from '@kybernesis/arp-transport/browser';
import {
  clearPrincipalKey,
  exportRecoveryPhrase,
  getOrCreatePrincipalKey,
  hasPrincipalKey,
  type PrincipalKey,
} from '@/lib/principal-key-browser';
import {
  isPasskeySupported,
  signInWithPasskey,
} from '@/lib/principal-key-passkey';

interface Challenge {
  nonce: string;
  principalDid: string;
  expiresAt: number;
}

type Phase = 'loading' | 'onboard' | 'ready';

/**
 * Owner-app sign-in. Phase 10/10d adds passkey as the primary path; the
 * existing browser-held did:key flow remains available behind an
 * "Advanced" disclosure so anyone with a recovery phrase can still sign
 * in (e.g. fresh device with no registered passkey yet).
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('loading');
  const [principalKey, setPrincipalKey] = useState<PrincipalKey | null>(null);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
  const [phraseRevealed, setPhraseRevealed] = useState(false);
  const [phraseAck, setPhraseAck] = useState(false);
  const [phraseCopied, setPhraseCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [exists, supported] = await Promise.all([
          hasPrincipalKey(),
          isPasskeySupported(),
        ]);
        if (cancelled) return;
        setPasskeyAvailable(supported);
        if (exists) {
          const key = await getOrCreatePrincipalKey();
          if (cancelled) return;
          setPrincipalKey(key);
          setPhase('ready');
        } else {
          setPhase('onboard');
        }
      } catch (err) {
        if (!cancelled) setError(friendlyError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const key = await getOrCreatePrincipalKey();
      const phrase = await exportRecoveryPhrase();
      setPrincipalKey(key);
      setRecoveryPhrase(phrase);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const revealPhrase = useCallback(async () => {
    setError(null);
    try {
      if (!recoveryPhrase) {
        const phrase = await exportRecoveryPhrase();
        setRecoveryPhrase(phrase);
      }
      setPhraseRevealed(true);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, [recoveryPhrase]);

  const copyPhrase = useCallback(async () => {
    if (!recoveryPhrase) return;
    try {
      await navigator.clipboard.writeText(recoveryPhrase);
      setPhraseCopied(true);
      setTimeout(() => setPhraseCopied(false), 2_000);
    } catch {
      // Clipboard write can fail (permissions, insecure context). User can
      // still manually select the visible text.
    }
  }, [recoveryPhrase]);

  const signInDidKey = useCallback(async () => {
    if (!principalKey) return;
    setBusy(true);
    setError(null);
    try {
      const challengeRes = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ principalDid: principalKey.did }),
      });
      if (!challengeRes.ok) {
        throw new Error('Could not start sign-in. Please try again.');
      }
      const challenge = (await challengeRes.json()) as Challenge;

      const nonceBytes = new TextEncoder().encode(challenge.nonce);
      const sigBytes = await principalKey.sign(nonceBytes);

      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          principalDid: principalKey.did,
          nonce: challenge.nonce,
          signature: base64urlEncode(sigBytes),
        }),
      });
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => null);
        const code = (body as { error?: string } | null)?.error;
        throw new Error(verifyErrorMessage(code, verifyRes.status));
      }

      router.push(next);
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }, [principalKey, next, router]);

  const signInPasskey = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithPasskey();
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }, [next, router]);

  const resetIdentity = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await clearPrincipalKey();
      setPrincipalKey(null);
      setRecoveryPhrase(null);
      setPhraseRevealed(false);
      setPhraseAck(false);
      setPhase('onboard');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  if (phase === 'loading') {
    return (
      <div className="card max-w-xl space-y-2 text-sm" data-testid="login-loading">
        <p className="text-arp-muted">Loading…</p>
      </div>
    );
  }

  if (phase === 'onboard') {
    return (
      <div className="space-y-4">
        {passkeyAvailable && (
          <div className="card max-w-xl space-y-3 text-sm">
            <h2 className="font-display text-h5 font-medium text-ink">
              Sign in with passkey
            </h2>
            <p className="text-arp-muted">
              If you&apos;ve registered a passkey on this device with the
              owner-app before, sign in with Touch ID / Face ID / Windows
              Hello — no recovery phrase needed.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={signInPasskey}
              disabled={busy}
              data-testid="passkey-sign-in-btn"
            >
              {busy ? 'Verifying…' : 'Sign in with passkey'}
            </button>
          </div>
        )}

        <details
          className="card max-w-xl space-y-3 text-sm"
          open={!passkeyAvailable || advancedOpen}
          onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer font-display text-h5 font-medium text-ink">
            Advanced — recovery phrase / did:key
          </summary>
          {!principalKey ? (
            <div className="space-y-3 pt-3">
              <p className="text-arp-muted">
                Your identity is generated in this browser and never leaves it.
                Click below to create it.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={generate}
                disabled={busy}
                data-testid="get-started-btn"
              >
                {busy ? 'Generating…' : 'Get started'}
              </button>
            </div>
          ) : (
            <div className="space-y-3 pt-3">
              <div>
                <div className="label">Your agent-owner identity</div>
                <code
                  className="block break-all rounded bg-arp-bg px-2 py-1 text-xs"
                  data-testid="principal-did"
                >
                  {principalKey.did}
                </code>
              </div>
              <div className="space-y-2">
                <div className="label">Recovery phrase</div>
                <p className="text-arp-muted">
                  Save these 12 words somewhere safe. They are the only way to
                  restore your identity if this browser is cleared. We
                  don&apos;t keep a copy.
                </p>
                {!phraseRevealed && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={revealPhrase}
                    data-testid="reveal-phrase-btn"
                  >
                    Reveal recovery phrase
                  </button>
                )}
                {phraseRevealed && recoveryPhrase && (
                  <div className="space-y-2">
                    <div
                      className="select-all break-words rounded bg-arp-bg px-3 py-2 font-mono text-xs leading-relaxed"
                      data-testid="recovery-phrase"
                    >
                      {recoveryPhrase}
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={copyPhrase}
                      data-testid="copy-phrase-btn"
                    >
                      {phraseCopied ? 'Copied' : 'Copy'}
                    </button>
                    <label className="flex items-center gap-2 text-xs text-arp-muted">
                      <input
                        type="checkbox"
                        checked={phraseAck}
                        onChange={(e) => setPhraseAck(e.target.checked)}
                        data-testid="phrase-ack"
                      />
                      I&apos;ve saved my recovery phrase.
                    </label>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={signInDidKey}
                disabled={!phraseAck || busy}
                data-testid="sign-in-btn"
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          )}
        </details>

        {error && (
          <div className="text-sm text-arp-danger" data-testid="login-error">
            {error}
          </div>
        )}
      </div>
    );
  }

  // phase === 'ready' — user has a stored did:key.
  return (
    <div className="space-y-4">
      {passkeyAvailable && (
        <div className="card max-w-xl space-y-3 text-sm">
          <h2 className="font-display text-h5 font-medium text-ink">
            Sign in with passkey
          </h2>
          <p className="text-arp-muted">
            Use Touch ID / Face ID / Windows Hello to sign in. No recovery
            phrase needed.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={signInPasskey}
            disabled={busy}
            data-testid="passkey-sign-in-btn"
          >
            {busy ? 'Verifying…' : 'Sign in with passkey'}
          </button>
        </div>
      )}

      <details
        className="card max-w-xl space-y-3 text-sm"
        open={!passkeyAvailable || advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer font-display text-h5 font-medium text-ink">
          Advanced — sign in with recovery phrase / did:key
        </summary>
        <div className="space-y-3 pt-3">
          {principalKey && (
            <div>
              <div className="label">Signed in as</div>
              <code
                className="block break-all rounded bg-arp-bg px-2 py-1 text-xs"
                data-testid="principal-did"
              >
                {principalKey.did}
              </code>
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={signInDidKey}
            disabled={busy}
            data-testid="sign-in-btn"
          >
            {busy ? 'Signing in…' : 'Sign in with did:key'}
          </button>
          <div className="flex items-center gap-4 text-xs text-arp-muted">
            {!phraseRevealed && (
              <button
                type="button"
                className="underline"
                onClick={revealPhrase}
                data-testid="reveal-phrase-btn"
              >
                View recovery phrase
              </button>
            )}
            <button
              type="button"
              className="underline"
              onClick={resetIdentity}
              data-testid="reset-identity-btn"
            >
              Start over with a new identity
            </button>
          </div>
          {phraseRevealed && recoveryPhrase && (
            <div className="space-y-2">
              <div
                className="select-all break-words rounded bg-arp-bg px-3 py-2 font-mono text-xs leading-relaxed"
                data-testid="recovery-phrase"
              >
                {recoveryPhrase}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={copyPhrase}
                data-testid="copy-phrase-btn"
              >
                {phraseCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      </details>

      {error && (
        <div className="text-sm text-arp-danger" data-testid="login-error">
          {error}
        </div>
      )}
    </div>
  );
}

function friendlyError(err: unknown): string {
  if (err instanceof Error && err.message) {
    if (err.message === 'invalid_recovery_phrase') {
      return 'That recovery phrase isn’t valid. Check spelling and word order.';
    }
    return err.message;
  }
  return 'Something went wrong.';
}

function verifyErrorMessage(code: string | undefined, status: number): string {
  switch (code) {
    case 'unknown_or_expired_nonce':
      return 'Your sign-in challenge expired. Try again.';
    case 'signature_verify_failed':
      return 'Signature didn’t match. Please try again.';
    case 'principal_not_registered':
      return 'This identity isn’t recognised by the server.';
    case 'invalid_signature':
      return 'The signature was malformed.';
    case 'bad_request':
      return 'Sign-in request was malformed.';
    default:
      return `Sign-in failed (status ${status}).`;
  }
}
