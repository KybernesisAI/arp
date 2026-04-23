'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PairingProposal } from '@kybernesis/arp-pairing';

export function AcceptForm({
  proposal,
  audiencePrincipalDid,
}: {
  proposal: PairingProposal;
  audiencePrincipalDid: string;
}) {
  const router = useRouter();
  const [privateKeyHex, setPrivateKeyHex] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pairing/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proposal,
          counterpartyDid: audiencePrincipalDid,
          counterpartyPrivateKeyHex: privateKeyHex.trim(),
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text().catch(() => `status ${res.status}`));
      }
      const body = (await res.json()) as { connectionId: string };
      router.push(`/connections/${encodeURIComponent(body.connectionId)}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [proposal, audiencePrincipalDid, privateKeyHex, router]);

  return (
    <div className="card max-w-xl space-y-3 text-sm">
      <p className="text-arp-muted">
        Countersigning will finalise the connection. Sign the invitation
        canonical bytes with your principal key — for v0 paste the 32-byte hex
        from the ARP CLI.
      </p>
      <label className="block">
        <span className="label">Counterparty principal private key (hex)</span>
        <input
          className="input font-mono"
          value={privateKeyHex}
          onChange={(e) => setPrivateKeyHex(e.target.value)}
          placeholder="64-char hex"
          data-testid="accept-key-input"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={accept}
          disabled={busy || privateKeyHex.trim().length === 0}
          data-testid="accept-btn"
        >
          {busy ? 'Accepting…' : 'Countersign + finalise'}
        </button>
      </div>
      {error && <div className="text-sm text-arp-danger">{error}</div>}
    </div>
  );
}
