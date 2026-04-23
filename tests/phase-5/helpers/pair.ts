/**
 * Pairing helper for Phase-5 tests — creates a signed ConnectionToken and
 * posts it into both runtimes' admin APIs so a subsequent DIDComm request
 * is recognised and policy-evaluated.
 */

import type { ConnectionToken, ScopeTemplate } from '@kybernesis/arp-spec';
import {
  countersignProposal,
  createPairingProposal,
  verifyConnectionToken,
  type DidResolver,
} from '@kybernesis/arp-pairing';
import type { AgentIdentity } from './dual-runtime.js';
import { postConnection } from './dual-runtime.js';

export interface PairOptions {
  catalog: readonly ScopeTemplate[];
  issuerPrincipal: AgentIdentity;
  issuerAgentDid: string;
  counterpartyPrincipal: AgentIdentity;
  counterpartyAgentDid: string;
  purpose: string;
  scopeSelections: Array<{ id: string; params?: Record<string, unknown> }>;
  /** Admin token (shared across both ports in dual-runtime harness). */
  adminToken: string;
  /** Port of the issuer-side runtime. */
  issuerPort: number;
  /** Port of the counterparty-side runtime. */
  counterpartyPort: number;
  /** Resolver for verifying dual sigs. */
  resolver: DidResolver;
  /** Overrides `expires` (default: +30d). */
  expiresAt?: string;
  /** Optional purpose-uniqueness salt to avoid connection-ID collisions. */
  saltPurpose?: boolean;
}

export async function pair(opts: PairOptions): Promise<{
  connectionId: string;
  issuerSideToken: ConnectionToken;
  counterpartySideToken: ConnectionToken;
}> {
  const expiresAt = opts.expiresAt ?? new Date(Date.now() + 30 * 86_400_000).toISOString();
  const proposal = await createPairingProposal({
    issuer: opts.issuerPrincipal.principalDid,
    subject: opts.issuerAgentDid,
    audience: opts.counterpartyAgentDid,
    purpose: opts.purpose,
    scopeSelections: opts.scopeSelections,
    expiresAt,
    scopeCatalogVersion: 'v1',
    catalog: opts.catalog,
    issuerKey: {
      privateKey: opts.issuerPrincipal.principalPrivateKey,
      kid: `${opts.issuerPrincipal.principalDid}#key-1`,
    },
  });

  const { token } = await countersignProposal({
    proposal,
    counterpartyKey: {
      privateKey: opts.counterpartyPrincipal.principalPrivateKey,
      kid: `${opts.counterpartyPrincipal.principalDid}#key-1`,
    },
    counterpartyDid: opts.counterpartyPrincipal.principalDid,
    catalog: opts.catalog,
  });

  const verdict = await verifyConnectionToken(token, { resolver: opts.resolver });
  if (!verdict.ok) {
    throw new Error(`ConnectionToken verify failed: ${verdict.reason}`);
  }

  const issuerSideToken = token;
  // Counterparty registers with swapped subject/audience (their perspective).
  const counterpartySideToken: ConnectionToken = {
    ...token,
    subject: opts.counterpartyAgentDid,
    audience: opts.issuerAgentDid,
  };

  await postConnection(opts.issuerPort, opts.adminToken, issuerSideToken);
  await postConnection(opts.counterpartyPort, opts.adminToken, counterpartySideToken);

  return {
    connectionId: token.connection_id,
    issuerSideToken,
    counterpartySideToken,
  };
}
