/**
 * Shared cloud-app fixtures for the Phase-10 acceptance tests. Mirrors the
 * `apps/cloud/tests/helpers/pairing-fixtures.ts` shape but scoped to the
 * out-of-tree acceptance suite — cleanest place to keep the slow scope-
 * catalog YAML read amortised across spec files.
 *
 * Test files compose:
 *   - `installCloudMocks(state)` — sets up `vi.mock('@/lib/db', …)` +
 *     `vi.mock('@/lib/session', …)` so each spec can drive the real route
 *     handlers against a hermetic PGlite instance.
 *   - `seedTenantAndAgent(...)` — inserts a tenants row + a cloud-hosted
 *     agent (the `getAgent(...)` lookup the route uses lives on TenantDb).
 *   - `mintDualSignedProposal(...)` — issuer + acceptor co-sign a proposal
 *     so the accept route's verifier passes without a separate countersign
 *     hop.
 *
 * No live network: PGlite for the cloud DB, in-process route handlers, no
 * `fetch` calls leaving the process.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ed25519 from '@noble/ed25519';
import {
  tenants,
  toTenantId,
  withTenant,
  type CloudDbClient,
} from '@kybernesis/arp-cloud-db';
import {
  createPairingProposal,
  countersignProposal,
  type PairingProposal,
} from '@kybernesis/arp-pairing';
import { loadScopesFromDirectory as loadFromDir } from '@kybernesis/arp-scope-catalog';
import { ed25519PublicKeyToDidKey as didKeyEncode } from '@kybernesis/arp-resolver';
import type { ScopeTemplate } from '@kybernesis/arp-spec';

const HERE = dirname(fileURLToPath(import.meta.url));

export function ed25519PublicKeyToDidKey(raw: Uint8Array): string {
  return didKeyEncode(raw);
}

export function loadScopesFromDirectory(): readonly ScopeTemplate[] {
  return loadFromDir(
    resolve(HERE, '..', '..', '..', 'packages', 'scope-catalog', 'scopes'),
  );
}

export interface Principal {
  did: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/**
 * Deterministic principal identity from a single seed byte. Avoids the
 * test relying on randomness for replay diagnostics.
 */
export async function resolvePrincipal(seedByte: number): Promise<Principal> {
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) seed[i] = (seedByte * (i + 1)) & 0xff;
  const publicKey = await ed25519.getPublicKeyAsync(seed);
  return { did: ed25519PublicKeyToDidKey(publicKey), publicKey, privateKey: seed };
}

export async function seedTenant(
  db: CloudDbClient,
  principalDid: string,
): Promise<string> {
  const inserted = await db
    .insert(tenants)
    .values({ principalDid, plan: 'free', status: 'active' })
    .returning({ id: tenants.id });
  const id = inserted[0]?.id;
  if (!id) throw new Error('seedTenant: no id returned');
  return id;
}

/**
 * Seed an agents row for a cloud tenant. Mirrors the cloud-app pattern:
 * persists a synthesized `wellKnownDid` payload so the cross-tenant
 * pairing resolver finds the audience agent's verification method during
 * proposal verify.
 */
export async function seedCloudAgent(
  db: CloudDbClient,
  tenantId: string,
  principalDid: string,
  agentDid: string,
  agentPublicKeyMultibase: string,
): Promise<void> {
  const tenantDb = withTenant(db, toTenantId(tenantId));
  const principalBlock = { did: principalDid, representationVC: 'https://example/vc' };
  const wellKnownDid = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: agentDid,
    controller: principalDid,
    verificationMethod: [
      {
        id: `${agentDid}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: agentDid,
        publicKeyMultibase: agentPublicKeyMultibase,
      },
    ],
    authentication: [`${agentDid}#key-1`],
    assertionMethod: [`${agentDid}#key-1`],
    keyAgreement: [`${agentDid}#key-1`],
    service: [
      {
        id: `${agentDid}#didcomm`,
        type: 'DIDCommMessaging',
        serviceEndpoint: `https://${agentDid.replace('did:web:', '')}/didcomm`,
        accept: ['didcomm/v2'],
      },
    ],
    principal: principalBlock,
  };
  await tenantDb.createAgent({
    did: agentDid,
    principalDid,
    agentName: agentDid.split(':').slice(-1)[0] ?? 'agent',
    agentDescription: '',
    publicKeyMultibase: agentPublicKeyMultibase,
    handoffJson: {},
    wellKnownDid: wellKnownDid as unknown as Record<string, unknown>,
    wellKnownAgentCard: {},
    wellKnownArp: {},
    scopeCatalogVersion: 'v1',
    tlsFingerprint: 'cloud-hosted',
  });
}

export interface ProposalOptions {
  /** Override expiry. Default: now + 24h. */
  expiresAtMs?: number;
  /** Scope selections; default is a single low-risk read scope. */
  scopeSelections?: Array<{ id: string; params?: Record<string, unknown> }>;
  /** Purpose label. Default: 'Test connection'. */
  purpose?: string;
}

/**
 * Issuer creates a proposal (single signature, audience-side empty).
 * Use this when driving `POST /api/pairing/invitations`, which only needs
 * the issuer's signature.
 */
export async function mintIssuerProposal(
  catalog: readonly ScopeTemplate[],
  issuer: Principal,
  issuerAgentDid: string,
  acceptorAgentDid: string,
  opts: ProposalOptions = {},
): Promise<PairingProposal> {
  const expiresAt = new Date(opts.expiresAtMs ?? Date.now() + 86_400_000);
  return createPairingProposal({
    issuer: issuer.did,
    subject: issuerAgentDid,
    audience: acceptorAgentDid,
    purpose: opts.purpose ?? 'Test connection',
    scopeSelections: opts.scopeSelections ?? [
      { id: 'calendar.availability.read', params: { days_ahead: 14 } },
    ],
    expiresAt: expiresAt.toISOString(),
    scopeCatalogVersion: 'v1',
    catalog,
    issuerKey: { privateKey: issuer.privateKey, kid: `${issuer.did}#key-1` },
  });
}

/**
 * Issuer creates a proposal, acceptor countersigns. Returns the dual-signed
 * proposal ready to drive `POST /api/pairing/accept`. Issuer + acceptor
 * MUST be distinct principals (the `sigs` map keys on principal DID, and a
 * collision would leave only one entry).
 */
export async function mintDualSignedProposal(
  catalog: readonly ScopeTemplate[],
  issuer: Principal,
  acceptor: Principal,
  issuerAgentDid: string,
  acceptorAgentDid: string,
  opts: ProposalOptions = {},
): Promise<PairingProposal> {
  if (issuer.did === acceptor.did) {
    throw new Error(
      'mintDualSignedProposal: issuer and acceptor must be distinct principals',
    );
  }
  const proposal = await mintIssuerProposal(
    catalog,
    issuer,
    issuerAgentDid,
    acceptorAgentDid,
    opts,
  );
  const signed = await countersignProposal({
    proposal,
    counterpartyKey: { privateKey: acceptor.privateKey, kid: `${acceptor.did}#key-1` },
    counterpartyDid: acceptor.did,
  });
  return signed.proposal;
}

/**
 * Synthetic public-key-multibase for an agent that doesn't actually run a
 * sidecar. The pair routes only consult the multibase when verifying
 * audience signatures; for cloud-cloud pairing the audience is a
 * principal did:key (verifiable inline), so an opaque agent-key value is
 * acceptable. Mirrors the existing `apps/cloud/tests/pairing-*.test.ts`
 * fixtures.
 */
export async function syntheticAgentMultibase(seedByte: number): Promise<string> {
  const principal = await resolvePrincipal(seedByte);
  return principal.did.replace('did:key:', '');
}
