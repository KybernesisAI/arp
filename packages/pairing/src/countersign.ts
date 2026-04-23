import type { ConnectionToken, ScopeTemplate } from '@kybernesis/arp-spec';
import { ConnectionTokenSchema } from '@kybernesis/arp-spec';
import { compileBundle } from '@kybernesis/arp-scope-catalog';
import { canonicalBytes, payloadFromProposal } from './canonical.js';
import { signBytes, type KeyPair } from './signing.js';
import type { PairingProposal, SignatureEntry } from './types.js';

export interface CountersignInput {
  proposal: PairingProposal;
  /** Counterparty principal key (the audience agent's owner). */
  counterpartyKey: KeyPair;
  /** DID of the counterparty principal (used as the sigs-map key). */
  counterpartyDid: string;
  /**
   * If provided, the audience recompiles `proposal.scope_selections` against
   * this catalog and verifies the compiled Cedar policies match the issuer's
   * before countersigning. Strongly recommended.
   */
  catalog?: readonly ScopeTemplate[];
}

export interface ConnectionTokenWithProposal {
  token: ConnectionToken;
  /** The now dual-signed proposal. Preserved verbatim for audit / re-verify. */
  proposal: PairingProposal;
}

/**
 * Countersign a pairing proposal. On success:
 * - both sigs (issuer + counterparty) live on the returned proposal,
 * - a `ConnectionToken` is projected out of it for runtime consumption and
 *   is self-verifying via `verifyConnectionToken`.
 *
 * Does NOT verify the issuer's signature — callers that don't trust the
 * invitation source should run `verifyPairingProposal` first, then pass the
 * proposal in here.
 */
export async function countersignProposal(
  input: CountersignInput,
): Promise<ConnectionTokenWithProposal> {
  if (input.catalog) {
    assertCompilationMatches(input.proposal, input.catalog);
  }

  const bytes = canonicalBytes(payloadFromProposal(input.proposal));
  const audienceSig = await signBytes(bytes, input.counterpartyKey);

  const sigs: Record<string, SignatureEntry> = {
    ...input.proposal.sigs,
    [input.counterpartyDid]: audienceSig,
  };

  const signedProposal: PairingProposal = { ...input.proposal, sigs };

  const token: ConnectionToken = {
    connection_id: input.proposal.connection_id,
    issuer: input.proposal.issuer,
    subject: input.proposal.subject,
    audience: input.proposal.audience,
    purpose: input.proposal.purpose,
    cedar_policies: [...input.proposal.cedar_policies],
    obligations: input.proposal.obligations.map((o) => ({
      type: o.type,
      params: { ...o.params },
    })),
    scope_catalog_version: input.proposal.scope_catalog_version,
    expires: input.proposal.expires_at,
    sigs: Object.fromEntries(
      Object.entries(sigs).map(([k, v]) => [k, v.value]),
    ),
  };

  return {
    token: ConnectionTokenSchema.parse(token),
    proposal: signedProposal,
  };
}

function assertCompilationMatches(
  proposal: PairingProposal,
  catalog: readonly ScopeTemplate[],
): void {
  const compiled = compileBundle({
    scopeIds: proposal.scope_selections.map((s) => s.id),
    paramsMap: Object.fromEntries(
      proposal.scope_selections.map((s) => [s.id, s.params ?? {}]),
    ),
    audienceDid: proposal.audience,
    catalog,
  });
  if (compiled.policies.length !== proposal.cedar_policies.length) {
    throw new Error(
      `countersign rejected: policy count mismatch ` +
        `(proposal=${proposal.cedar_policies.length}, recompiled=${compiled.policies.length})`,
    );
  }
  for (let i = 0; i < compiled.policies.length; i++) {
    if (compiled.policies[i] !== proposal.cedar_policies[i]) {
      throw new Error(
        `countersign rejected: cedar policy #${i} does not match local recompilation`,
      );
    }
  }
}
