'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FieldHint, Input, Label } from '@/components/ui';

export function RevokeConfirmForm({
  connectionId,
  peerDid,
}: {
  connectionId: string;
  peerDid: string;
}): React.JSX.Element {
  const router = useRouter();
  const [reason, setReason] = useState('owner_revoked');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
      if (res.status === 429) {
        throw new Error('Rate limited — try again in a minute.');
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `status ${res.status}`);
      }
      const body = (await res.json()) as { ok: boolean; alreadyRevoked?: boolean };
      if (body.alreadyRevoked) {
        setToast('Connection was already revoked.');
      }
      router.push(`/connections/${encodeURIComponent(connectionId)}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [connectionId, reason, router]);

  return (
    <div className="border border-rule bg-paper p-6 space-y-4">
      <div>
        <Label htmlFor="revoke-reason">Revocation reason (optional)</Label>
        <Input
          id="revoke-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="owner_revoked"
          data-testid="revoke-reason-input"
        />
        <FieldHint>
          PERSISTED ON THE REVOCATIONS ROW + EMITTED IN THE AUDIT ENTRY SO {peerDid.slice(0, 20)}… KNOWS WHY.
        </FieldHint>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button
          variant="solid"
          className="bg-signal-red border-signal-red hover:bg-ink hover:border-ink"
          onClick={() => void revoke()}
          disabled={busy}
          data-testid="revoke-confirm-btn"
        >
          {busy ? 'Revoking…' : 'Revoke connection'}
        </Button>
      </div>

      {error && (
        <div className="border border-signal-red bg-paper p-3 text-body-sm text-signal-red">
          {error}
        </div>
      )}
      {toast && (
        <div className="border border-rule bg-paper-2 p-3 text-body-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
