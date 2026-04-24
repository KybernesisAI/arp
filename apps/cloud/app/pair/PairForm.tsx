'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Code,
  FieldError,
  FieldHint,
  Input,
  Label,
  Pre,
} from '@/components/ui';
import { getOrCreatePrincipalKey } from '@/lib/principal-key-browser';
import {
  createSignedProposalClient,
  type CompiledBundle,
} from '@/lib/pairing-client';
import type { PairingProposal, ScopeSelection } from '@kybernesis/arp-pairing';

export interface AgentOption {
  did: string;
  name: string;
}

export interface BundleOption {
  id: string;
  label: string;
  description: string;
  scopes: Array<{ id: string }>;
}

export interface ScopeOption {
  id: string;
  label: string;
  risk: string;
}

interface GeneratedState {
  invitationId: string;
  invitationUrl: string;
  expiresAt: string;
  proposalId: string;
  connectionId: string;
}

/**
 * Client-side pairing form.
 *
 * The signing step happens locally — the principal's private did:key lives
 * in this browser (Phase 8.5 invariant) so every proposal is signed before
 * we hit the server. The server's only job is to persist the signed
 * proposal + return the shareable URL.
 *
 * Scope-catalog flow: pick a bundle id → the server compiles the cedar
 * policies + obligations via /api/pairing/scope-catalog (the catalog
 * loader is fs-backed and can't run in the browser bundle) → the client
 * signs + posts. Server re-compiles on accept to catch any forgery.
 */
export function PairForm({
  principalDid,
  agents,
  scopes,
  bundles,
}: {
  principalDid: string;
  agents: AgentOption[];
  scopes: ScopeOption[];
  bundles: BundleOption[];
}): React.JSX.Element {
  void scopes;
  const [issuerAgent, setIssuerAgent] = useState(agents[0]?.did ?? '');
  const [audienceDid, setAudienceDid] = useState('did:web:peer.agent');
  const [purpose, setPurpose] = useState('Test connection');
  const [bundleId, setBundleId] = useState(bundles[0]?.id ?? '');
  const [expiresDays, setExpiresDays] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedState | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const selectedBundle = useMemo(
    () => bundles.find((b) => b.id === bundleId) ?? null,
    [bundles, bundleId],
  );

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    setGenerated(null);
    try {
      if (!selectedBundle) throw new Error('select a bundle first');
      if (!issuerAgent) throw new Error('no agent selected');

      const principal = await getOrCreatePrincipalKey();
      if (principal.did !== principalDid) {
        throw new Error(
          `browser principal did (${principal.did}) does not match the session's (${principalDid}). Recover from your phrase or log out.`,
        );
      }

      const expiresAt = new Date(
        Date.now() + expiresDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      const scopeSelections: ScopeSelection[] = selectedBundle.scopes.map((s) => ({
        id: s.id,
        params: {},
      }));
      const compiled = await compileBundleRemotely(
        scopeSelections.map((s) => s.id),
        audienceDid,
      );

      const rawPrivateKey = await extractPrivateKey();
      const proposal = await createSignedProposalClient({
        issuer: principalDid,
        subject: issuerAgent,
        audience: audienceDid,
        purpose,
        scopeSelections,
        compiled,
        expiresAt,
        scopeCatalogVersion: 'v1',
        issuerKey: {
          privateKey: rawPrivateKey,
          kid: `${principalDid}#key-1`,
        },
      });

      await persistAndRender(proposal);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [
    audienceDid,
    purpose,
    selectedBundle,
    principalDid,
    issuerAgent,
    expiresDays,
  ]);

  async function persistAndRender(proposal: PairingProposal): Promise<void> {
    const res = await fetch('/api/pairing/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proposal }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `status ${res.status}`);
    }
    const body = (await res.json()) as GeneratedState;
    setGenerated(body);
  }

  async function copyUrl(): Promise<void> {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.invitationUrl);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      // clipboard API may be blocked in some iframe contexts; leave the
      // state idle so the user can copy manually from the Pre block.
      setCopyState('idle');
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="border border-rule bg-paper p-7 space-y-4">
        <div>
          <Label htmlFor="pair-agent">Your agent</Label>
          <select
            id="pair-agent"
            className="mt-1 w-full border border-rule bg-paper px-3 py-2 font-mono text-sm"
            value={issuerAgent}
            onChange={(e) => setIssuerAgent(e.target.value)}
            data-testid="pair-agent-select"
          >
            {agents.map((a) => (
              <option key={a.did} value={a.did}>
                {a.name} — {a.did}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="pair-audience">Peer agent DID</Label>
          <Input
            id="pair-audience"
            value={audienceDid}
            onChange={(e) => setAudienceDid(e.target.value)}
            placeholder="did:web:peer.agent"
            data-testid="pair-audience-input"
            className="font-mono"
          />
          <FieldHint>WHAT AGENT ARE YOU PAIRING WITH?</FieldHint>
        </div>

        <div>
          <Label htmlFor="pair-purpose">Purpose label</Label>
          <Input
            id="pair-purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            data-testid="pair-purpose-input"
          />
        </div>

        <div>
          <Label htmlFor="pair-bundle">Scope bundle</Label>
          <select
            id="pair-bundle"
            className="mt-1 w-full border border-rule bg-paper px-3 py-2 font-mono text-sm"
            value={bundleId}
            onChange={(e) => setBundleId(e.target.value)}
            data-testid="pair-bundle-select"
          >
            {bundles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          {selectedBundle && (
            <FieldHint>{selectedBundle.description.toUpperCase()}</FieldHint>
          )}
        </div>

        <div>
          <Label htmlFor="pair-expires">Invitation expires in (days)</Label>
          <Input
            id="pair-expires"
            type="number"
            min={1}
            max={30}
            value={expiresDays}
            onChange={(e) => setExpiresDays(Number(e.target.value))}
            data-testid="pair-expires-input"
          />
        </div>

        <div className="pt-2">
          <Button
            variant="primary"
            arrow
            onClick={() => void generate()}
            disabled={busy || !issuerAgent || !selectedBundle}
            data-testid="pair-generate-btn"
          >
            {busy ? 'Generating…' : 'Generate invitation'}
          </Button>
        </div>

        {error && <FieldError data-testid="pair-error">Error: {error}</FieldError>}
      </div>

      <div className="border border-rule bg-paper p-7 space-y-4">
        <div>
          <Badge tone={generated ? 'blue' : 'yellow'} className="mb-3">
            {generated ? 'INVITATION READY' : 'AWAITING GENERATION'}
          </Badge>
          <h3 className="font-display font-medium text-h4 mt-0 mb-2">
            Share this link
          </h3>
          {!generated && (
            <p className="text-body-sm text-ink-2">
              Fill in the form and click &ldquo;Generate invitation&rdquo; —
              we&rsquo;ll produce a signed URL you can share via Signal,
              email, or any private channel you trust.
            </p>
          )}
          {generated && (
            <>
              <Pre data-testid="pair-invitation-url">
                {generated.invitationUrl}
              </Pre>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void copyUrl()}
                  data-testid="pair-copy-btn"
                >
                  {copyState === 'copied' ? 'Copied' : 'Copy URL'}
                </Button>
              </div>
              <div className="mt-4 font-mono text-kicker uppercase text-muted">
                CONNECTION · <Code>{generated.connectionId}</Code>
                <br />
                PROPOSAL · <Code>{generated.proposalId}</Code>
                <br />
                EXPIRES · {new Date(generated.expiresAt).toLocaleString()}
              </div>
              <div className="mt-6 border-t border-rule pt-4 text-body-sm text-ink-2">
                <span className="font-mono text-kicker uppercase text-signal-red">
                  // CAUTION
                </span>
                <br />
                Anyone who opens this URL and signs in to ARP Cloud can accept
                the invitation. Share over a channel you trust.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

async function compileBundleRemotely(
  ids: string[],
  audienceDid: string,
): Promise<CompiledBundle> {
  const res = await fetch('/api/pairing/scope-catalog', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids, audienceDid }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `scope-catalog compile failed: ${res.status}`);
  }
  const body = (await res.json()) as { compiled: CompiledBundle };
  return body.compiled;
}

async function extractPrivateKey(): Promise<Uint8Array> {
  const v2 = localStorage.getItem('arp.cloud.principalKey.v2');
  const v1 = localStorage.getItem('arp.cloud.principalKey.v1');
  const raw = v2 ?? v1;
  if (!raw) throw new Error('no principal key in browser');
  const parsed = JSON.parse(raw) as { privateKeyHex: string };
  const hex = parsed.privateKeyHex;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
