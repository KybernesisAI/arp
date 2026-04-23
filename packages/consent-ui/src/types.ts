import type { Obligation, ScopeTemplate } from '@kybernesis/arp-spec';
import type { ScopeSelection } from '@kybernesis/arp-pairing';

export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

/**
 * Structured English view of a Connection — the owner-facing consent screen
 * renders this tree. Deterministic: identical inputs always produce
 * identical output, which is the invariant we enforce via snapshot tests.
 */
export interface ConsentView {
  /** e.g. "Ghost wants to connect with Samantha for Project Alpha." */
  headline: string;
  /** Positive bullets — what the peer will be able to do. */
  willBeAbleTo: string[];
  /** Negative bullets — obligations, explicit forbids, implicit absences. */
  willNotBeAbleTo: string[];
  /** Time, VC, rate, and spend conditions. */
  conditions: string[];
  /** VCs the counterparty must present. */
  willProve: string[];
  /** ISO 8601 expiry. */
  expiresAt: string;
  /** Max risk tier across selected scopes. */
  risk: RiskTier;
}

/**
 * Input to `renderConsentView`. Carries everything the deterministic renderer
 * needs without having to re-invent scope → English via Cedar parsing.
 */
export interface RenderConsentInput {
  /** Principal DID that authored the policy. */
  issuer: string;
  /** Agent DID the token will run under (issuer-side). */
  subject: string;
  /** Counterparty agent DID. */
  audience: string;
  /** Free-text purpose label (shown in the headline). */
  purpose: string;
  /** Scope selections (id + params). Drives willBeAbleTo bullets. */
  scopeSelections: ScopeSelection[];
  /** Compiled Cedar policies — currently used only for policy count. */
  cedarPolicies: string[];
  /** Obligations from `obligations_forced` or the proposal. */
  obligations: Obligation[];
  /** ISO 8601 expiry. */
  expires: string;
  /** VC requirements the audience must present. */
  requiredVcs?: string[];
  /** Loaded scope catalog (source of consent_text_template + risk tier). */
  catalog: readonly ScopeTemplate[];
  /** did → display name map for the headline. Optional. */
  agentDisplayNames?: Record<string, string>;
}
