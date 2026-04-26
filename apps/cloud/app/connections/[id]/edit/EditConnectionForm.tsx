'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
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

interface BundleOption {
  id: string;
  label: string;
  description: string;
  scopes: Array<{ id: string }>;
  needsParams?: boolean;
}

interface ScopeOption {
  id: string;
  label: string;
  risk: string;
}

interface AgentOption {
  did: string;
  name: string;
}

interface GeneratedState {
  invitationId: string;
  proposalId: string;
  connectionId: string;
  expiresAt: string;
  invitationUrl: string;
}

/**
 * EditConnectionForm — re-countersign UI for a single existing
 * connection. Same client-side signing path PairForm uses, but with:
 *   - sender + peer DIDs locked to the existing pair
 *   - `replaces=<old_connection_id>` carried into the new proposal so
 *     /api/pairing/accept atomically supersedes the old row when the
 *     peer countersigns
 *   - the resulting share URL clearly labels the action as a rescope
 *
 * The user picks a NEW bundle (or re-confirms the current one). We
 * don't do a granular "toggle individual scopes" surface in this first
 * cut — that's a follow-up. Bundle re-pick already covers ~80% of the
 * "I want to tighten or broaden" use cases.
 */
export function EditConnectionForm({
  connectionId,
  principalDid,
  currentAgentDid,
  currentPeerDid,
  currentPurpose,
  currentBundleId,
  agents,
  scopes,
  bundles,
}: {
  connectionId: string;
  principalDid: string;
  currentAgentDid: string;
  currentPeerDid: string;
  currentPurpose: string;
  currentBundleId: string | null;
  agents: AgentOption[];
  scopes: ScopeOption[];
  bundles: BundleOption[];
}): React.JSX.Element {
  void scopes;
  void agents;

  const [purpose, setPurpose] = useState(currentPurpose);
  // Default to a bundle that compiles without user-supplied params; if
  // the connection's previous bundle is one of those, prefer it.
  const initialBundleId =
    currentBundleId && bundles.find((b) => b.id === currentBundleId && !b.needsParams)
      ? currentBundleId
      : bundles.find((b) => !b.needsParams)?.id ?? bundles[0]?.id ?? '';
  const [bundleId, setBundleId] = useState(initialBundleId);
  const [expiresDays, setExpiresDays] = useState(30);
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
        currentPeerDid,
      );

      const rawPrivateKey = await extractPrivateKey();
      const proposal = await createSignedProposalClient({
        issuer: principalDid,
        subject: currentAgentDid,
        audience: currentPeerDid,
        purpose,
        scopeSelections,
        compiled,
        expiresAt,
        scopeCatalogVersion: 'v1',
        replaces: connectionId,
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
    purpose,
    selectedBundle,
    principalDid,
    currentAgentDid,
    currentPeerDid,
    expiresDays,
    connectionId,
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
      /* ignore */
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card tone="paper" padded className="border border-rule space-y-4">
        <div>
          <Label htmlFor="edit-pair">Existing pair</Label>
          <div className="mt-1 text-body-sm break-all">
            <Code>{currentAgentDid}</Code>
            <br />
            <span className="font-mono text-kicker uppercase text-muted">→ </span>
            <Code>{currentPeerDid}</Code>
          </div>
          <FieldHint>SENDER + RECIPIENT ARE LOCKED FOR EDITS</FieldHint>
        </div>

        <div>
          <Label htmlFor="edit-purpose">Purpose label</Label>
          <Input
            id="edit-purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="edit-bundle">New scope bundle</Label>
          <select
            id="edit-bundle"
            className="mt-1 w-full border border-rule bg-paper px-3 py-2 font-mono text-sm"
            value={bundleId}
            onChange={(e) => setBundleId(e.target.value)}
          >
            {bundles.map((b) => (
              <option key={b.id} value={b.id} disabled={b.needsParams ?? false}>
                {b.label}
                {b.needsParams ? ' (needs project_id — UI coming soon)' : ''}
              </option>
            ))}
          </select>
          {selectedBundle && (
            <FieldHint>{selectedBundle.description.toUpperCase()}</FieldHint>
          )}
          {selectedBundle?.needsParams && (
            <p className="mt-2 font-mono text-kicker uppercase text-signal-red">
              THIS BUNDLE NEEDS PER-SCOPE INPUTS WE DON&apos;T COLLECT YET
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="edit-expires">Invitation expires in (days)</Label>
          <Input
            id="edit-expires"
            type="number"
            min={1}
            max={30}
            value={expiresDays}
            onChange={(e) => setExpiresDays(Number(e.target.value))}
          />
          <FieldHint>HOW LONG THE PEER HAS TO COUNTERSIGN</FieldHint>
        </div>

        <div className="pt-2">
          <Button
            variant="primary"
            arrow
            onClick={() => void generate()}
            disabled={busy || !selectedBundle}
          >
            {busy ? 'Generating…' : 'Generate updated invitation'}
          </Button>
        </div>

        {error && <FieldError>Error: {error}</FieldError>}
      </Card>

      <Card
        tone={generated ? 'blue' : 'paper-2'}
        padded
        className="border border-rule space-y-3"
      >
        <Badge
          tone={generated ? 'paper' : 'yellow'}
          className="text-[9px] px-2 py-0.5"
        >
          {generated ? 'INVITATION READY' : 'AWAITING GENERATION'}
        </Badge>
        {!generated && (
          <p className="text-body">
            Pick the new bundle and hit <strong>Generate</strong>. We'll
            sign a fresh proposal in your browser carrying{' '}
            <Code>replaces={connectionId.slice(0, 18)}…</Code>.
          </p>
        )}
        {generated && (
          <>
            <Pre data-testid="edit-invitation-url">
              {generated.invitationUrl}
            </Pre>
            <div className="mt-3 flex gap-2 flex-wrap">
              <Button
                variant="default"
                size="sm"
                onClick={() => void copyUrl()}
              >
                {copyState === 'copied' ? 'Copied' : 'Copy URL'}
              </Button>
              <ButtonLink
                href={`/connections/${encodeURIComponent(connectionId)}`}
                variant="default"
                size="sm"
                arrow
              >
                Back to connection
              </ButtonLink>
            </div>
            <div className="mt-3 font-mono text-kicker uppercase">
              NEW CONNECTION · <Code>{generated.connectionId}</Code>
              <br />
              REPLACES · <Code>{connectionId}</Code>
              <br />
              EXPIRES · {new Date(generated.expiresAt).toLocaleString()}
            </div>
            <div className="mt-4 border-t border-white/30 pt-3 text-body-sm">
              <strong>What happens next.</strong> Send the URL above to
              the peer. When they accept, the supervisor on both sides
              swaps to the new policies and the old connection enters
              the <Code>revoked</Code> status with{' '}
              <Code>replacedBy</Code> pointing at the new id. Until they
              accept, the old policies stay in effect — there's no
              permission gap.
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// --- helpers (mirrored from PairForm) ----------------------------------

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
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    const detail = body.detail ?? body.error ?? `status ${res.status}`;
    throw new Error(`scope-catalog compile failed: ${detail}`);
  }
  const body = (await res.json()) as { compiled: CompiledBundle };
  return body.compiled;
}

async function extractPrivateKey(): Promise<Uint8Array> {
  const v2 = localStorage.getItem('arp.cloud.principalKey.v2');
  const v1 = localStorage.getItem('arp.cloud.principalKey.v1');
  const raw = v2 ?? v1;
  if (!raw) {
    throw new Error(
      'no principal key in this browser — sign in with your 12-word phrase',
    );
  }
  const parsed = JSON.parse(raw) as { privateKeyHex: string };
  const hex = parsed.privateKeyHex;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
