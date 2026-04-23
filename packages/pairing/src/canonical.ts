import canonicalizeFn from 'canonicalize';
import type { ConnectionToken } from '@kybernesis/arp-spec';
import type { Obligation } from './obligation-schema.js';
import type { PairingProposal } from './types.js';

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
}

export function payloadFromProposal(
  proposal: PairingProposal,
): CanonicalConnectionPayload {
  return {
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
}

export function payloadFromToken(token: ConnectionToken): CanonicalConnectionPayload {
  return {
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
}

export function canonicalBytes(payload: CanonicalConnectionPayload): Uint8Array {
  const json = canonicalize(payload);
  return new TextEncoder().encode(json);
}
