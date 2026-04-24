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
import { countersignProposalClient } from '@/lib/pairing-client';
import type { PairingProposal } from '@kybernesis/arp-pairing';
import type { ConsentView } from '@kybernesis/arp-consent-ui';

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
}: {
  principalDid: string;
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

        // Fetch the tenant's agents + a consent view from the server —
        // the consent-UI renderer needs the scope catalog (fs-backed) so
        // we do the projection server-side and ship the view.
        const [viewRes, agentsRes] = await Promise.all([
          fetch('/api/pairing/consent', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ proposal }),
          }),
          fetch('/api/agents', { method: 'GET' }),
        ]);
        if (!viewRes.ok) {
          throw new Error(
            `consent render failed: ${(await viewRes.text().catch(() => ''))}`,
          );
        }
        if (!agentsRes.ok) {
          throw new Error('failed to load agents');
        }
        const viewBody = (await viewRes.json()) as { view: ConsentView };
        const agentsBody = (await agentsRes.json()) as {
          agents: AgentChoice[];
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
      const dual = await countersignProposalClient({
        proposal: state.proposal,
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
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ConsentPanel view={view} />
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
            disabled={state.stage === 'submitting' || !state.acceptingAgentDid}
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
