'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
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
import type { ScopeTemplate } from '@kybernesis/arp-spec';
import type { BundlePreset, ScopePickerState } from './ScopePicker';
import { ScopePickerModal } from './ScopePickerModal';

export interface AgentOption {
  did: string;
  name: string;
}

function suggestContactName(did: string): string {
  const m = did.match(/^did:web:([^:]+)/);
  if (!m) return 'peer';
  const host = m[1] ?? 'peer';
  const labels = host.split('.');
  if (labels.length >= 2 && labels[labels.length - 1] === 'agent') {
    return labels[labels.length - 2] ?? 'peer';
  }
  return labels[0] ?? 'peer';
}

interface GeneratedState {
  invitationId: string;
  invitationUrl: string;
  /** Short link (token in the fragment); the long one still works. */
  shortUrl?: string;
  expiresAt: string;
  proposalId: string;
  connectionId: string;
}

/**
 * Client-side pairing form.
 *
 * Per-scope picker drives the proposal: the issuer toggles individual
 * scopes on the catalog and fills in their parameters
 * (`project_id="alpha"`, `attribute_allowlist=['name','email']`, …).
 * Bundle presets are still offered as one-click loaders that pre-fill
 * the scope set + non-`<user-picks>` defaults; the user can then add /
 * remove / re-parameterise anything before signing. The /api/pairing
 * /scope-catalog route compiles the cedar policies + obligations
 * server-side because the catalog loader is fs-backed.
 */
export function PairForm({
  principalDid,
  agents,
  catalog,
  bundles,
}: {
  principalDid: string;
  agents: AgentOption[];
  catalog: ScopeTemplate[];
  bundles: BundlePreset[];
}): React.JSX.Element {
  const params = useSearchParams();
  const fromQuery = params?.get('from') ?? null;
  const peerQuery = params?.get('peer') ?? null;
  const normalisedPeerQuery = peerQuery ? normaliseDidInput(peerQuery) : null;
  const initialIssuer =
    fromQuery && agents.some((a) => a.did === fromQuery)
      ? fromQuery
      : agents[0]?.did ?? '';
  const [issuerAgent, setIssuerAgent] = useState(initialIssuer);
  useEffect(() => {
    if (fromQuery && agents.some((a) => a.did === fromQuery) && fromQuery !== issuerAgent) {
      setIssuerAgent(fromQuery);
    }
    // intentionally only run when fromQuery changes
  }, [fromQuery]);
  // The owner types a name (`samantha` or `samantha.agent`); the identifier is derived and never shown.
  const [audienceName, setAudienceName] = useState(
    normalisedPeerQuery && isValidDidUri(normalisedPeerQuery) ? plainName(normalisedPeerQuery) : '',
  );
  const audienceDid = normaliseDidInput(audienceName);
  useEffect(() => {
    if (
      normalisedPeerQuery &&
      isValidDidUri(normalisedPeerQuery) &&
      normalisedPeerQuery !== audienceDid
    ) {
      setAudienceName(plainName(normalisedPeerQuery));
    }
    // intentionally only run when peer query changes
  }, [normalisedPeerQuery]);
  const [purpose, setPurpose] = useState('Test connection');
  const [expiresDays, setExpiresDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedState | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [picker, setPicker] = useState<ScopePickerState>({
    selectedIds: [],
    paramsMap: {},
    valid: false,
    errors: {},
  });

  const onPickerChange = useCallback((s: ScopePickerState) => setPicker(s), []);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    setGenerated(null);
    try {
      if (picker.selectedIds.length === 0) {
        throw new Error('pick at least one scope');
      }
      if (!picker.valid) {
        throw new Error('fix the highlighted parameter errors first');
      }
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
      const scopeSelections: ScopeSelection[] = picker.selectedIds.map((id) => ({
        id,
        params: picker.paramsMap[id] ?? {},
      }));
      const compiled = await compileScopesRemotely(
        scopeSelections,
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
    picker,
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
      await navigator.clipboard.writeText(generated.shortUrl ?? generated.invitationUrl);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
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
                {plainName(a.did)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="pair-audience">The other agent’s name</Label>
          <Input
            id="pair-audience"
            value={audienceName}
            onChange={(e) => setAudienceName(e.target.value)}
            onBlur={(e) => setAudienceName(plainName(normaliseDidInput(e.target.value)))}
            placeholder="samantha.agent"
            data-testid="pair-audience-input"
            className="font-mono"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <FieldHint>Their .agent name, like samantha.agent. Just the name is fine.</FieldHint>
          {audienceName.trim() !== '' && !isValidDidUri(audienceDid) && (
            <p className="mt-2 text-[13px] text-amber-800">That does not look like an agent name. Letters, numbers and hyphens only.</p>
          )}
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

        <ScopePickerModal
          catalog={catalog}
          bundles={bundles}
          onChange={onPickerChange}
        />

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
            disabled={
              busy ||
              !issuerAgent ||
              !picker.valid ||
              !isValidDidUri(audienceDid)
            }
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
              Pick the scopes you want to share, fill in any required
              params (project_id, attribute_allowlist, …), and click
              &ldquo;Generate invitation&rdquo;. We&rsquo;ll produce a
              signed URL you can share over Signal, email, or any
              channel you trust.
            </p>
          )}
          {generated && (
            <>
              <Pre data-testid="pair-invitation-url">
                {generated.shortUrl ?? generated.invitationUrl}
              </Pre>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void copyUrl()}
                  data-testid="pair-copy-btn"
                >
                  {copyState === 'copied' ? 'Copied' : 'Copy link'}
                </Button>
              </div>
              <InvitationQr url={generated.shortUrl ?? generated.invitationUrl} name={suggestContactName(audienceDid)} />
              <div className="mt-4 font-mono text-kicker uppercase text-muted">
                EXPIRES · {mdy(generated.expiresAt)}
              </div>
              <div className="mt-6 border-t border-rule pt-4 text-body-sm text-ink-2">
                <span className="font-mono text-kicker uppercase text-signal-red">
                  // CAUTION
                </span>
                <br />
                Anyone who opens this URL and signs in to ARP Cloud can accept
                the invitation. Share over a channel you trust.
              </div>
              <details className="mt-6 border-t border-rule pt-4 text-body-sm">
                <summary className="cursor-pointer font-mono text-kicker uppercase text-muted">
                  ▸ AFTER ACCEPT — ADD THE PEER TO YOUR LOCAL CONTACTS
                </summary>
                <p className="mt-3 text-ink-2">
                  Once the peer accepts, both sides have an active connection
                  in the cloud. To address the peer by name from your local
                  agent (so the LLM&apos;s contact skill can resolve it), drop
                  this into your terminal in the agent&apos;s folder:
                </p>
                <Pre className="mt-3 text-xs leading-snug">
{`cd ~/your-agent-folder
arpc contacts add ${suggestContactName(audienceDid)} ${audienceDid}`}
                </Pre>
                <p className="mt-3 text-ink-2">
                  Then your agent will be able to message them by name —
                  e.g. <Code>arpc send {suggestContactName(audienceDid)} &quot;hi&quot;</Code>{' '}
                  — and the contact skill (<Code>arpc skill install contact</Code>)
                  will pick it up when the user asks.
                </p>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

async function compileScopesRemotely(
  scopeSelections: ScopeSelection[],
  audienceDid: string,
): Promise<CompiledBundle> {
  const paramsMap: Record<string, Record<string, unknown>> = {};
  for (const s of scopeSelections) {
    if (s.params && Object.keys(s.params).length > 0) {
      paramsMap[s.id] = s.params;
    }
  }
  const res = await fetch('/api/pairing/scope-catalog', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ids: scopeSelections.map((s) => s.id),
      paramsMap,
      audienceDid,
    }),
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
  if (!raw) throw new Error('no principal key in browser');
  const parsed = JSON.parse(raw) as { privateKeyHex: string };
  const hex = parsed.privateKeyHex;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Lenient input normaliser for the peer-DID field. Catches the common
 * autocorrect-on-mobile-keyboard mistake of `did.web.foo.agent` →
 * `did:web:foo.agent`, and accepts bare `.agent` names from Headless
 * Domains deep links (e.g. `janice.agent` → `did:web:janice.agent`).
 * Anything else round-trips unchanged so the user can see what they
 * typed (with an inline "not valid" warning).
 */
function normaliseDidInput(raw: string): string {
  const v = raw.trim();
  const m = v.match(/^did\.web\.(.+)$/);
  if (m && m[1]) return `did:web:${m[1]}`;
  if (/^web:.+/.test(v)) return `did:${v}`;
  if (/^[A-Za-z0-9._-]+\.agent$/.test(v)) return `did:web:${v}`;
  // A bare name (`sid`) is what an owner types; it can only mean `sid.agent`.
  if (/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(v)) return `did:web:${v.toLowerCase()}.agent`;
  return v;
}

/** `did:web:samantha.agent` → `samantha.agent`; anything else untouched. */
function plainName(did: string): string {
  return did.replace(/^did:web:/, '');
}

function mdy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}-${d}-${y}`;
}

/** The invitation link as a QR. Click to enlarge; download as PNG. */
function InvitationQr({ url, name }: { url: string; name: string }): React.JSX.Element | null {
  const [src, setSrc] = useState<string | null>(null);
  const [big, setBig] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    const opts = { margin: 1, errorCorrectionLevel: 'M' as const, color: { dark: '#09090b', light: '#ffffff' } };
    void Promise.all([QRCode.toDataURL(url, { ...opts, width: 384 }), QRCode.toDataURL(url, { ...opts, width: 1024 })])
      .then(([s, b]) => { if (alive) { setSrc(s); setBig(b); } })
      .catch(() => { if (alive) { setSrc(null); setBig(null); } });
    return () => { alive = false; };
  }, [url]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!src) return null;
  const file = `pair-${name || 'agent'}.png`;
  return (
    <>
      <div className="mt-4 flex items-start gap-4">
        <button type="button" onClick={() => setOpen(true)} className="rounded-2xl border border-zinc-200 bg-white p-2 transition-shadow hover:shadow-[0_16px_40px_-24px_rgba(0,0,0,0.4)]" aria-label="Show the QR code larger">
          <img src={src} alt="QR code for the invitation link" width={176} height={176} className="h-44 w-44" />
        </button>
        <div className="max-w-[26ch] text-[13px] text-zinc-600">
          <p className="m-0">Or let the other owner scan this with their phone. It opens the same link.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-zinc-300 px-3 py-1.5 text-[12px] font-medium text-zinc-900 hover:border-zinc-900">Enlarge</button>
            {big && <a href={big} download={file} className="rounded-full border border-zinc-300 px-3 py-1.5 text-[12px] font-medium text-zinc-900 hover:border-zinc-900">Download PNG</a>}
          </div>
        </div>
      </div>
      {open && big && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }} role="dialog" aria-modal="true" aria-label="Invitation QR code">
          <div className="w-full max-w-[560px] rounded-3xl bg-white p-6 text-center">
            <img src={big} alt="QR code for the invitation link" className="mx-auto aspect-square w-full max-w-[480px] rounded-2xl" />
            <p className="mt-4 break-all font-mono text-[12px] text-zinc-500">{url}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <a href={big} download={file} className="rounded-full bg-black px-5 py-2.5 text-[14px] font-medium text-white hover:bg-zinc-800">Download PNG</a>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-zinc-300 px-5 py-2.5 text-[14px] font-medium text-zinc-900 hover:border-zinc-900">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function isValidDidUri(v: string): boolean {
  return /^did:[a-z0-9]+:[A-Za-z0-9._%-]+(?::[A-Za-z0-9._%-]+)*$/.test(v.trim());
}
