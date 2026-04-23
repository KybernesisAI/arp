'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

export function RevokeForm({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('owner_revoked');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revoke = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/connections/${encodeURIComponent(connectionId)}/revoke`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      );
      if (!res.ok) {
        throw new Error(`revoke failed: ${res.status} ${await res.text()}`);
      }
      router.push('/');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [connectionId, reason, router]);

  return (
    <div className="mt-4 space-y-3">
      <label className="block">
        <span className="label">Reason</span>
        <input
          type="text"
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn btn-danger"
        onClick={revoke}
        disabled={busy}
        data-testid="revoke-btn"
      >
        {busy ? 'Revoking…' : 'Revoke now'}
      </button>
      {error && <div className="text-sm text-arp-danger">{error}</div>}
    </div>
  );
}
