'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Challenge {
  nonce: string;
  principalDid: string;
  expiresAt: number;
}

export function LoginForm({
  principalDid,
  next,
}: {
  principalDid: string;
  next: string;
}) {
  const router = useRouter();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [signature, setSignature] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestChallenge = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ principalDid }),
      });
      if (!res.ok) {
        throw new Error(`challenge failed: ${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as Challenge;
      setChallenge(body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [principalDid]);

  const verify = useCallback(async () => {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nonce: challenge.nonce,
          signature: signature.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `verify failed: ${res.status}`);
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [challenge, signature, next, router]);

  return (
    <div className="card max-w-xl space-y-4 text-sm">
      {!challenge && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={requestChallenge}
          disabled={busy}
          data-testid="challenge-btn"
        >
          {busy ? 'Requesting…' : 'Request challenge'}
        </button>
      )}
      {challenge && (
        <>
          <div>
            <div className="label">Challenge nonce</div>
            <code
              className="block break-all rounded bg-arp-bg px-2 py-1 text-xs"
              data-testid="challenge-nonce"
            >
              {challenge.nonce}
            </code>
          </div>
          <div>
            <label className="label" htmlFor="signature">
              Signature (base64url)
            </label>
            <textarea
              id="signature"
              className="input h-28 resize-y"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Paste the base64url signature over the nonce"
              data-testid="signature-input"
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={verify}
            disabled={busy || signature.trim().length === 0}
            data-testid="verify-btn"
          >
            {busy ? 'Verifying…' : 'Verify + sign in'}
          </button>
        </>
      )}
      {error && (
        <div className="text-sm text-arp-danger" data-testid="login-error">
          {error}
        </div>
      )}
    </div>
  );
}
