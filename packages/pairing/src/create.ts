import type { ScopeTemplate } from '@kybernesis/arp-spec';
import { compileBundle } from '@kybernesis/arp-scope-catalog';
import { canonicalBytes, payloadFromProposal } from './canonical.js';
import { newConnectionId, newProposalId } from './id.js';
import { signBytes, type KeyPair } from './signing.js';
import {
  PairingProposalSchema,
  type PairingProposal,
  type ScopeSelection,
} from './types.js';

export interface CreatePairingProposalInput {
  /** Principal DID authoring the invitation (goes into `issuer`). */
  issuer: string;
  /** Issuer's agent DID (the agent the peer will connect to). */
  subject: string;
  /** Counterparty agent DID. */
  audience: string;
  /** Free-text connection label. */
  purpose: string;
  /** Scope selections; compiled with the provided catalog at create time. */
  scopeSelections: ScopeSelection[];
  /** VC types the audience will be asked to present. */
  requiredVcs?: string[];
  /** ISO 8601 expiry for the eventual connection. */
  expiresAt: string;
  /** Scope catalog version label (e.g. `"v1"`). */
  scopeCatalogVersion: string;
  /** Loaded scope catalog, source of truth for compilation. */
  catalog: readonly ScopeTemplate[];
  /** Issuer principal key — signs the invitation. */
  issuerKey: KeyPair;
  /** Clock override (for deterministic tests). */
  now?: () => Date;
  /** Optional pre-generated ids (tests). */
  ids?: { proposalId?: string; connectionId?: string };
}

/**
 * Build and sign an invitation from the issuer side. Compiles the user's
 * scope selections into Cedar policies + aggregated obligations, packages
 * them into a `PairingProposal`, and signs the canonical bytes with the
 * issuer's principal key.
 */
export async function createPairingProposal(
  input: CreatePairingProposalInput,
): Promise<PairingProposal> {
  const now = input.now ?? (() => new Date());
  const proposalId = input.ids?.proposalId ?? newProposalId();
  const connectionId = input.ids?.connectionId ?? newConnectionId();

  const compiled = compileBundle({
    scopeIds: input.scopeSelections.map((s) => s.id),
    paramsMap: Object.fromEntries(
      input.scopeSelections
        .filter((s) => s.params !== undefined)
        .map((s) => [s.id, s.params ?? {}]),
    ),
    audienceDid: input.audience,
    catalog: input.catalog,
  });

  const unsigned: Omit<PairingProposal, 'sigs'> = {
    proposal_id: proposalId,
    connection_id: connectionId,
    issuer: input.issuer,
    subject: input.subject,
    audience: input.audience,
    purpose: input.purpose,
    scope_selections: input.scopeSelections.map((s) => ({
      id: s.id,
      params: s.params ?? {},
    })),
    cedar_policies: compiled.policies,
    obligations: compiled.obligations,
    scope_catalog_version: input.scopeCatalogVersion,
    required_vcs: input.requiredVcs ?? [],
    expires_at: input.expiresAt,
    created_at: now().toISOString(),
  };

  const bytes = canonicalBytes(
    payloadFromProposal(unsigned as PairingProposal),
  );
  const issuerSig = await signBytes(bytes, input.issuerKey);

  const proposal: PairingProposal = {
    ...unsigned,
    sigs: { [input.issuer]: issuerSig },
  };

  return PairingProposalSchema.parse(proposal);
}
