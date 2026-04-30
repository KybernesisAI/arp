'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Code,
  FieldError,
  FieldHint,
  Pre,
} from '@/components/ui';
import { getOrCreatePrincipalKey } from '@/lib/principal-key-browser';
import {
  countersignProposalClient,
  createSignedAmendmentClient,
  type CompiledBundle,
} from '@/lib/pairing-client';
import type { PairingProposal, ScopeSelection } from '@kybernesis/arp-pairing';
import type { ConsentView } from '@kybernesis/arp-consent-ui';
import type { ScopeTemplate } from '@kybernesis/arp-spec';
import type { BundlePreset, ScopePickerState } from '@/app/pair/ScopePicker';
import { ScopePickerModal } from '@/app/pair/ScopePickerModal';

interface AgentChoice {
  did: string;
  name: string;
}

interface AcceptState {
  stage: 'loading' | 'awaiting_consent' | 'submitting' | 'done' | 'error';
  error?: string;
  proposal?: PairingProposal;
  view?: ConsentView;
  agents?: AgentChoice[];
  acceptingAgentDid?: string;
  connectionId?: string;
  catalog?: ScopeTemplate[];
  bundles?: BundlePreset[];
  audiencePicker?: ScopePickerState;
}

/**
 * Decodes the URL-fragment invitation and walks the user through consent.
 * The payload never hits the server except in the POST body we send after
 * countersigning — which the cloud access logs do capture, but that's by
 * design (we already hold the signed payload server-side as the authoritative
 * audit trail).
 *
 * See `@/lib/pairing-client` for why countersigning lives in this file's
 * adjacent helper module rather than calling `@kybernesis/arp-pairing`
 * directly (root transport entry pulls in sqlite).
 */
export function AcceptClient({
  principalDid,
  hasTenant,
}: {
  principalDid: string | null;
  hasTenant: boolean;
}): React.JSX.Element {
  const [state, setState] = useState<AcceptState>({ stage: 'loading' });

  useEffect(() => {
    void init();
    async function init(): Promise<void> {
      try {
        const hash =
          typeof window !== 'undefined'
            ? window.location.hash.replace(/^#/, '')
            : '';
        if (!hash) {
          setState({
            stage: 'error',
            error:
              'No invitation payload in URL. Open this page with the full #-suffixed URL you received.',
          });
          return;
        }

        // Auth gate runs HERE on the client (not the server) so the URL
        // fragment survives — server-side redirect() strips hashes.
        // Build a `?next=` containing the full /pair/accept#<payload>
        // URL so login/onboarding lands the user back here with the
        // payload intact.
        if (!principalDid || !hasTenant) {
          const nextUrl = `/pair/accept#${hash}`;
          const target = !principalDid ? '/cloud/login' : '/onboarding';
          window.location.assign(`${target}?next=${encodeURIComponent(nextUrl)}`);
          return;
        }
        const json = atobUrl(hash);
        let proposal: PairingProposal;
        try {
          proposal = JSON.parse(json) as PairingProposal;
        } catch (err) {
          setState({
            stage: 'error',
            error: `invitation not valid JSON: ${(err as Error).message}`,
          });
          return;
        }

        // Fetch the tenant's agents + a consent view + the scope
        // catalog. The consent-UI renderer + the bidirectional scope
        // picker both need the catalog (fs-backed) so we do all the
        // server-side calls together.
        const [viewRes, agentsRes, catalogRes] = await Promise.all([
          fetch('/api/pairing/consent', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ proposal }),
          }),
          fetch('/api/agents', { method: 'GET' }),
          fetch('/api/pairing/scope-catalog-list', { method: 'GET' }),
        ]);
        if (!viewRes.ok) {
          throw new Error(
            `consent render failed: ${(await viewRes.text().catch(() => ''))}`,
          );
        }
        if (!agentsRes.ok) {
          throw new Error('failed to load agents');
        }
        if (!catalogRes.ok) {
          throw new Error('failed to load scope catalog');
        }
        const viewBody = (await viewRes.json()) as { view: ConsentView };
        const agentsBody = (await agentsRes.json()) as {
          agents: AgentChoice[];
        };
        const catalogBody = (await catalogRes.json()) as {
          catalog: ScopeTemplate[];
          bundles: BundlePreset[];
        };
        setState({
          stage: 'awaiting_consent',
          proposal,
          view: viewBody.view,
          agents: agentsBody.agents,
          acceptingAgentDid:
            proposal.audience ??
            agentsBody.agents[0]?.did ??
            '',
          catalog: catalogBody.catalog,
          bundles: catalogBody.bundles,
          audiencePicker: {
            selectedIds: [],
            paramsMap: {},
            valid: false,
            errors: {},
          },
        });
      } catch (err) {
        setState({ stage: 'error', error: (err as Error).message });
      }
    }
  }, []);

  const accept = useCallback(async () => {
    if (!state.proposal || !state.acceptingAgentDid) return;
    setState({ ...state, stage: 'submitting' });
    try {
      const principal = await getOrCreatePrincipalKey();
      if (principal.did !== principalDid) {
        throw new Error(
          `browser principal did (${principal.did}) does not match the session's (${principalDid}). Log out and recover from your phrase, or generate a fresh identity.`,
        );
      }

      const rawPrivateKey = await extractPrivateKey();

      // Bidirectional consent — if the audience selected scopes for the
      // reverse direction, compile + sign an amendment. The amendment's
      // cedar policies grant proposal.subject (the issuer's agent), so
      // we ask the scope-catalog API to compile with that as the
      // audienceDid argument. Block submit if the picker has errors.
      let amendment: Awaited<ReturnType<typeof createSignedAmendmentClient>> | null = null;
      if (state.audiencePicker && state.audiencePicker.selectedIds.length > 0) {
        if (!state.audiencePicker.valid) {
          throw new Error('fix the highlighted parameter errors in your grants first');
        }
        const audienceCompiled = await compileScopesRemotely(
          state.audiencePicker.selectedIds.map((id) => ({
            id,
            params: state.audiencePicker?.paramsMap[id] ?? {},
          })),
          state.proposal.subject,
        );
        amendment = await createSignedAmendmentClient({
          connectionId: state.proposal.connection_id,
          scopeSelections: state.audiencePicker.selectedIds.map((id) => ({
            id,
            params: state.audiencePicker?.paramsMap[id] ?? {},
          })),
          compiled: audienceCompiled,
          audienceKey: {
            privateKey: rawPrivateKey,
            kid: `${principalDid}#key-1`,
          },
        });
      }

      // Attach the amendment BEFORE countersigning so the audience's
      // proposal-level signature (the existing flow's countersignature)
      // is over the same canonical bytes the issuer signed — the
      // amendment lives outside payloadFromProposal so canonical bytes
      // are unchanged whether or not it's present.
      const proposalWithAmendment: PairingProposal = amendment
        ? { ...state.proposal, audience_amendment: amendment }
        : state.proposal;
      const dual = await countersignProposalClient({
        proposal: proposalWithAmendment,
        counterpartyKey: {
          privateKey: rawPrivateKey,
          kid: `${principalDid}#key-1`,
        },
        counterpartyDid: principalDid,
      });

      const res = await fetch('/api/pairing/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proposal: dual,
          acceptingAgentDid: state.acceptingAgentDid,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          reason?: string;
        };
        throw new Error(body.reason ?? body.error ?? `status ${res.status}`);
      }
      const body = (await res.json()) as { connectionId: string };
      setState({
        ...state,
        stage: 'done',
        connectionId: body.connectionId,
      });
    } catch (err) {
      setState({ ...state, stage: 'error', error: (err as Error).message });
    }
  }, [state, principalDid]);

  if (state.stage === 'loading') {
    return (
      <div className="border border-rule bg-paper p-7 max-w-2xl text-body text-ink-2">
        Decoding invitation…
      </div>
    );
  }

  if (state.stage === 'error') {
    return (
      <div className="border border-rule bg-paper p-7 max-w-2xl">
        <Badge tone="red" className="mb-3">
          INVALID INVITATION
        </Badge>
        <FieldError>{state.error}</FieldError>
      </div>
    );
  }

  if (state.stage === 'done') {
    return (
      <div className="border border-rule bg-paper p-7 max-w-2xl">
        <Badge tone="blue" className="mb-3">CONNECTION · ACTIVE</Badge>
        <h3 className="font-display font-medium text-h4 mt-0 mb-2">
          Pairing complete
        </h3>
        <p className="text-body text-ink-2 mb-4">
          Your agent now speaks to{' '}
          <Code>{state.proposal?.subject}</Code>. Visit the dashboard to see
          activity once messages start flowing.
        </p>
        <div className="flex gap-2">
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 border border-ink bg-ink text-paper font-mono text-[11.5px] uppercase tracking-[0.1em] hover:bg-signal-blue hover:border-signal-blue"
          >
            Dashboard →
          </a>
        </div>
        <div className="mt-4 font-mono text-kicker uppercase text-muted">
          CONNECTION · <Code>{state.connectionId}</Code>
        </div>
      </div>
    );
  }

  // awaiting_consent | submitting
  const view = state.view!;
  const onAudiencePickerChange = (s: ScopePickerState) =>
    setState({ ...state, audiencePicker: s });
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <div>
          <span className="font-mono text-kicker uppercase text-muted block mb-2">
            // 1 · WHAT THEY ASK FROM YOU
          </span>
          <ConsentPanel view={view} />
        </div>
        <div>
          <span className="font-mono text-kicker uppercase text-muted block mb-2">
            // 2 · WHAT YOU GRANT THEM IN RETURN
          </span>
          <div className="border border-rule bg-paper p-5 space-y-3 text-body-sm">
            <p className="text-ink-2 m-0">
              The connection is mutual. Pick what you allow{' '}
              <Code>{state.proposal?.subject}</Code> to do toward your
              agent. Leave empty if this is a one-way capability grant.
            </p>
            {state.catalog && state.bundles && (
              <ScopePickerModal
                catalog={state.catalog}
                bundles={state.bundles}
                onChange={onAudiencePickerChange}
              />
            )}
          </div>
        </div>
      </div>
      <div className="border border-rule bg-paper p-7 space-y-4">
        <Badge tone={view.risk === 'high' ? 'red' : view.risk === 'medium' ? 'yellow' : 'blue'}>
          RISK · {view.risk.toUpperCase()}
        </Badge>
        <div>
          <label className="block font-mono text-kicker uppercase text-ink-2 mb-1">
            Accept under which agent
          </label>
          <select
            className="w-full border border-rule bg-paper px-3 py-2 font-mono text-sm"
            value={state.acceptingAgentDid ?? ''}
            onChange={(e) =>
              setState({ ...state, acceptingAgentDid: e.target.value })
            }
            data-testid="accept-agent-select"
          >
            {state.agents?.map((a) => (
              <option key={a.did} value={a.did}>
                {a.name} — {a.did}
              </option>
            ))}
          </select>
          <FieldHint>
            THE PROPOSAL TARGETS {state.proposal?.audience} — PICK THE SAME AGENT.
          </FieldHint>
        </div>
        <div className="pt-2 flex gap-2">
          <Button
            variant="primary"
            arrow
            onClick={() => void accept()}
            disabled={
              state.stage === 'submitting' ||
              !state.acceptingAgentDid ||
              !!(
                state.audiencePicker &&
                state.audiencePicker.selectedIds.length > 0 &&
                !state.audiencePicker.valid
              )
            }
            data-testid="accept-approve-btn"
          >
            {state.stage === 'submitting' ? 'Accepting…' : 'Approve + countersign'}
          </Button>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 border border-rule bg-paper text-ink font-mono text-[11.5px] uppercase tracking-[0.1em] hover:bg-ink hover:text-paper"
            data-testid="accept-cancel-link"
          >
            Cancel
          </a>
        </div>
      </div>
    </div>
  );
}

function ConsentPanel({ view }: { view: ConsentView }): React.JSX.Element {
  return (
    <div className="border border-rule bg-paper p-7 space-y-3 text-body-sm">
      <h3 className="font-display font-medium text-h4 mt-0">{view.headline}</h3>
      <ConsentSection label="Will be able to" items={view.willBeAbleTo} />
      {view.willNotBeAbleTo.length > 0 && (
        <ConsentSection
          label="Will not be able to"
          items={view.willNotBeAbleTo}
        />
      )}
      {view.conditions.length > 0 && (
        <ConsentSection label="Conditions" items={view.conditions} />
      )}
      {view.willProve.length > 0 && (
        <ConsentSection label="Must prove" items={view.willProve} />
      )}
      <div className="pt-2 font-mono text-kicker uppercase text-muted">
        EXPIRES · {new Date(view.expiresAt).toLocaleString()}
      </div>
    </div>
  );
}

function ConsentSection({
  label,
  items,
}: {
  label: string;
  items: string[];
}): React.JSX.Element {
  return (
    <div>
      <div className="font-mono text-kicker uppercase text-muted">{label}</div>
      <ul className="list-disc pl-5 mt-1">
        {items.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
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
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
    };
    const detail = body.detail ?? body.error ?? `status ${res.status}`;
    throw new Error(`scope-catalog compile failed: ${detail}`);
  }
  const body = (await res.json()) as { compiled: CompiledBundle };
  return body.compiled;
}

/** base64url → utf8 string (browser-safe). */
function atobUrl(encoded: string): string {
  const padded = encoded
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), '=');
  return decodeURIComponent(
    [...atob(padded)]
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(''),
  );
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

// Silence unused-import warning from the helper `Pre` — retained for parity
// with other pages that inline proposal JSON for debugging.
void Pre;
