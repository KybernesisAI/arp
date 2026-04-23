import type { ScopeTemplate } from '@kybernesis/arp-spec';
import type { PairingProposal } from '@kybernesis/arp-pairing';
import {
  renderScopeConsentText,
  materializeObligation,
  indexCatalog,
} from './scope-render.js';
import { renderObligations } from './obligations.js';
import { labelForVc } from './vcs.js';
import type { ConsentView, RenderConsentInput, RiskTier } from './types.js';

const RISK_ORDER: RiskTier[] = ['low', 'medium', 'high', 'critical'];

/**
 * Deterministic projection of a pairing proposal (or its derived Connection
 * Token) into the structured consent view owners see before approving.
 *
 * Pipeline:
 *   1. Resolve every scope id in `scopeSelections` to its `ScopeTemplate`.
 *   2. Render each template's `consent_text_template` with the caller's
 *      params to produce one positive bullet per scope.
 *   3. Aggregate obligations (redact_fields, rate_limit, …) into negative
 *      bullets + conditions via `renderObligations`.
 *   4. Max the per-scope risk tiers.
 *   5. Sort each bullet list lexicographically so copy order is stable
 *      across runs (snapshot-friendly).
 */
export function renderConsentView(input: RenderConsentInput): ConsentView {
  const index = indexCatalog(input.catalog, input.scopeSelections);

  const subjectName = displayName(input.subject, input.agentDisplayNames);
  const audienceName = displayName(input.audience, input.agentDisplayNames);
  const headline = `${audienceName} wants to connect with ${subjectName} for ${input.purpose.trim()}.`;

  const willBeAbleTo: string[] = [];
  const willNotBeAbleToAcc: string[] = [];
  const conditionsAcc: string[] = [];
  const willProveAcc: string[] = [];
  let maxRisk = RISK_ORDER.indexOf('low');

  for (const sel of input.scopeSelections) {
    const scope = index.get(sel.id);
    if (!scope) continue;
    willBeAbleTo.push(renderScopeConsentText(scope, sel.params ?? {}));

    const materialized = scope.obligations_forced.map((ob) =>
      materializeObligation(scope, sel.params ?? {}, ob),
    );
    const forced = renderObligations(materialized);
    willNotBeAbleToAcc.push(...forced.willNotBeAbleTo);
    conditionsAcc.push(...forced.conditions);
    willProveAcc.push(...forced.willProve);

    const r = RISK_ORDER.indexOf(scope.risk);
    if (r > maxRisk) maxRisk = r;
  }

  const tokenObligations = renderObligations(input.obligations);
  willNotBeAbleToAcc.push(...tokenObligations.willNotBeAbleTo);
  conditionsAcc.push(...tokenObligations.conditions);
  willProveAcc.push(...tokenObligations.willProve);

  const willProveLabels = [
    ...willProveAcc.map(labelForVc),
    ...(input.requiredVcs ?? []).map(labelForVc),
  ];

  return {
    headline,
    willBeAbleTo: [...willBeAbleTo].sort(),
    willNotBeAbleTo: dedupedSorted(willNotBeAbleToAcc),
    conditions: dedupedSorted(conditionsAcc),
    willProve: dedupedSorted(willProveLabels),
    expiresAt: input.expires,
    risk: RISK_ORDER[maxRisk] ?? 'low',
  };
}

/**
 * Convenience wrapper: renders straight from a `PairingProposal`. The token
 * projected out of a proposal carries the same fields, so owner-app pages
 * showing either can rely on one API surface.
 */
export function renderProposalConsent(
  proposal: PairingProposal,
  catalog: readonly ScopeTemplate[],
  agentDisplayNames?: Record<string, string>,
): ConsentView {
  const input: RenderConsentInput = {
    issuer: proposal.issuer,
    subject: proposal.subject,
    audience: proposal.audience,
    purpose: proposal.purpose,
    scopeSelections: proposal.scope_selections,
    cedarPolicies: proposal.cedar_policies,
    obligations: proposal.obligations,
    expires: proposal.expires_at,
    requiredVcs: proposal.required_vcs,
    catalog,
  };
  if (agentDisplayNames !== undefined) {
    input.agentDisplayNames = agentDisplayNames;
  }
  return renderConsentView(input);
}

function dedupedSorted(items: string[]): string[] {
  return [...new Set(items)].sort();
}

function displayName(did: string, map?: Record<string, string>): string {
  if (map && map[did]) return map[did];
  const m = /^did:web:(.+)$/.exec(did);
  if (m) return humanizeAgent(m[1] ?? did);
  return did;
}

function humanizeAgent(host: string): string {
  const label = host.split('.')[0] ?? host;
  return label.charAt(0).toUpperCase() + label.slice(1);
}
