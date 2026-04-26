import canonicalizeFn from 'canonicalize';
import type { ConnectionToken } from '@kybernesis/arp-spec';
import type { Obligation } from './obligation-schema.js';
import type { AudienceAmendment, PairingProposal, ScopeSelection } from './types.js';

const canonicalize = canonicalizeFn as (value: unknown) => string;

/**
 * Canonical payload that both sides sign. It's exactly the set of fields that
 * survive from a proposal into its resulting ConnectionToken — nothing
 * proposal-only (proposal_id, scope_selections, created_at, required_vcs).
 * Pairing-only metadata is transparent / re-derivable and does not need to
 * be covered by the signatures.
 */
export interface CanonicalConnectionPayload {
  connection_id: string;
  issuer: string;
  subject: string;
  audience: string;
  purpose: string;
  cedar_policies: string[];
  obligations: Obligation[];
  scope_catalog_version: string;
  expires: string;
  /**
   * When set, the signature commits the proposal as a replacement of
   * an existing connection. Omitted from the signed bytes when unset so
   * that pre-Phase-12 proposals (which never had this field) hash to
   * identical bytes — backward-compatible. Including a JSON key with
   * value `undefined` would change the canonical output on new flows
   * only, so existing token signatures stay verifiable.
   */
  replaces?: string;
}

export function payloadFromProposal(
  proposal: PairingProposal,
): CanonicalConnectionPayload {
  const out: CanonicalConnectionPayload = {
    connection_id: proposal.connection_id,
    issuer: proposal.issuer,
    subject: proposal.subject,
    audience: proposal.audience,
    purpose: proposal.purpose,
    cedar_policies: proposal.cedar_policies,
    obligations: proposal.obligations,
    scope_catalog_version: proposal.scope_catalog_version,
    expires: proposal.expires_at,
  };
  if (proposal.replaces) out.replaces = proposal.replaces;
  return out;
}

export function payloadFromToken(token: ConnectionToken): CanonicalConnectionPayload {
  const out: CanonicalConnectionPayload = {
    connection_id: token.connection_id,
    issuer: token.issuer,
    subject: token.subject,
    audience: token.audience,
    purpose: token.purpose,
    cedar_policies: token.cedar_policies,
    obligations: token.obligations,
    scope_catalog_version: token.scope_catalog_version,
    expires: token.expires,
  };
  // Forward `replaces` if the token shape grows it (cloud-db tokenJson is
  // free-form jsonb; downstream verifiers can attach it without breaking
  // older readers).
  const maybeReplaces = (token as unknown as { replaces?: string }).replaces;
  if (typeof maybeReplaces === 'string' && maybeReplaces) {
    out.replaces = maybeReplaces;
  }
  return out;
}

export function canonicalBytes(payload: CanonicalConnectionPayload): Uint8Array {
  const json = canonicalize(payload);
  return new TextEncoder().encode(json);
}

/**
 * Canonical bytes for an audience amendment — what the audience's
 * principal signs to commit their own grants. Independent from the
 * proposal canonical so the issuer's signature stays valid.
 */
export interface CanonicalAudienceAmendmentPayload {
  connection_id: string;
  scope_selections: ScopeSelection[];
  cedar_policies: string[];
  obligations: Obligation[];
}

export function payloadFromAmendment(
  amendment: AudienceAmendment,
): CanonicalAudienceAmendmentPayload {
  return {
    connection_id: amendment.connection_id,
    scope_selections: amendment.scope_selections,
    cedar_policies: amendment.cedar_policies,
    obligations: amendment.obligations,
  };
}

export function canonicalAmendmentBytes(
  payload: CanonicalAudienceAmendmentPayload,
): Uint8Array {
  return new TextEncoder().encode(canonicalize(payload));
}
