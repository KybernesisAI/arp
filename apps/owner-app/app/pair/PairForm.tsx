'use client';

import { useCallback, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface BundleSummary {
  id: string;
  label: string;
  description: string;
  scopes: ReadonlyArray<{ id: string; params?: Record<string, unknown> }>;
}

interface ScopeSummary {
  id: string;
  label: string;
  risk: string;
}

interface Generated {
  invitationUrl: string;
  proposal: unknown;
  connectionId: string;
  proposalId: string;
}

export function PairForm({
  subjectDid,
  principalDid,
  scopeCatalogVersion,
  ownerAppBaseUrl,
  scopes,
  bundles,
}: {
  subjectDid: string;
  principalDid: string;
  scopeCatalogVersion: string;
  ownerAppBaseUrl: string;
  scopes: ScopeSummary[];
  bundles: BundleSummary[];
}) {
  const [audience, setAudience] = useState('did:web:ghost.agent');
  const [purpose, setPurpose] = useState('Project Alpha');
  const [bundleId, setBundleId] = useState(bundles[0]?.id ?? '');
  const [privateKeyHex, setPrivateKeyHex] = useState('');
  const [expiresDays, setExpiresDays] = useState(30);
  const [requiredVcs, setRequiredVcs] = useState('self_xyz.verified_human');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Generated | null>(null);

  const selectedBundle = useMemo(
    () => bundles.find((b) => b.id === bundleId) ?? null,
    [bundles, bundleId],
  );
  void scopes;

  const generate = useCallback(async () => {
    if (!selectedBundle) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pairing/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          issuer: principalDid,
          subject: subjectDid,
          audience,
          purpose,
          bundleId: selectedBundle.id,
          expiresDays,
          requiredVcs: requiredVcs
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
          scopeCatalogVersion,
          ownerAppBaseUrl,
          issuerPrivateKeyHex: privateKeyHex.trim(),
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text().catch(() => `status ${res.status}`));
      }
      setGenerated((await res.json()) as Generated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [
    audience,
    purpose,
    selectedBundle,
    principalDid,
    subjectDid,
    scopeCatalogVersion,
    ownerAppBaseUrl,
    expiresDays,
    requiredVcs,
    privateKeyHex,
  ]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card space-y-3 text-sm">
        <label className="block">
          <span className="label">Peer agent DID</span>
          <input
            className="input"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            data-testid="audience-input"
          />
        </label>
        <label className="block">
          <span className="label">Purpose label</span>
          <input
            className="input"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Scope bundle</span>
          <select
            className="input"
            value={bundleId}
            onChange={(e) => setBundleId(e.target.value)}
            data-testid="bundle-select"
          >
            {bundles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          {selectedBundle && (
            <p className="mt-1 text-xs text-arp-muted">
              {selectedBundle.description}
            </p>
          )}
        </label>
        <label className="block">
          <span className="label">Required VCs (comma-separated)</span>
          <input
            className="input"
            value={requiredVcs}
            onChange={(e) => setRequiredVcs(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Expires (days)</span>
          <input
            type="number"
            min={1}
            max={365}
            className="input"
            value={expiresDays}
            onChange={(e) => setExpiresDays(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="label">Issuer private key (hex, 32 bytes)</span>
          <input
            className="input font-mono"
            value={privateKeyHex}
            onChange={(e) => setPrivateKeyHex(e.target.value)}
            placeholder="paste 64-char hex from the ARP CLI"
            data-testid="private-key-input"
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          onClick={generate}
          disabled={busy || !selectedBundle}
          data-testid="generate-btn"
        >
          {busy ? 'Generating…' : 'Generate invitation'}
        </button>
        {error && <div className="text-sm text-arp-danger">{error}</div>}
      </div>

      <div className="card space-y-3 text-sm">
        <h3 className="font-semibold">Invitation</h3>
        {!generated && (
          <p className="text-arp-muted">
            Fill in the form to generate a QR code + signed invitation URL.
          </p>
        )}
        {generated && (
          <>
            <div className="rounded bg-white p-3">
              <QRCodeSVG
                value={generated.invitationUrl}
                size={200}
                level="M"
              />
            </div>
            <div>
              <div className="label">Invitation URL</div>
              <code
                className="block break-all rounded bg-arp-bg p-2 text-xs"
                data-testid="invitation-url"
              >
                {generated.invitationUrl}
              </code>
            </div>
            <div className="text-xs text-arp-muted">
              connection_id: {generated.connectionId}
              <br />
              proposal_id: {generated.proposalId}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
