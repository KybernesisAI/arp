/**
 * POST /api/pairing/accept — slice 10a.
 *
 * The accepting browser countersigns the proposal locally; we just receive
 * the dual-signed proposal + the acceptor's chosen agent DID. This spec
 * exercises the end-to-end server path:
 *
 *   1. 401 without a session.
 *   2. 403 when the accepting agent does not belong to the caller's tenant.
 *   3. 400 when the accepting agent DID doesn't match proposal.audience.
 *   4. 400 when the proposal signature is invalid.
 *   5. 400 when the proposal has expired.
 *   6. 409 when the same connection has already been consumed.
 *   7. 200 happy path: inserts rows for BOTH tenants when the issuer is
 *      also a cloud tenant, flips invitation.consumed_at, returns the
 *      connection id + peer agent + obligations.
 *
 * Dual-tenant insert is the main integration surface in 10a — it's what
 * lets both sides see the connection in the subsequent audit viewer (10b)
 * without any DIDComm roundtrip.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import {
  createPgliteDb,
  tenants,
  connections,
  pairingInvitations,
  toTenantId,
  withTenant,
  type CloudDbClient,
} from '@kybernesis/arp-cloud-db';
import {
  createPairingProposal,
  countersignProposal,
  type PairingProposal,
} from '@kybernesis/arp-pairing';
import { eq } from 'drizzle-orm';
import { ed25519PublicKeyToDidKey, loadScopesFromDirectory } from './helpers/pairing-fixtures';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
let sessionOverride: { principalDid: string; tenantId: string | null } | null = null;

vi.mock('@/lib/db', async () => ({
  getDb: async () => {
    if (!currentDb) throw new Error('test db not initialised');
    return currentDb.db;
  },
}));

vi.mock('@/lib/session', async () => ({
  getSession: async () => {
    if (!sessionOverride) return null;
    return {
      ...sessionOverride,
      nonce: 'test-nonce',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
    };
  },
}));

const { POST } = await import('../app/api/pairing/accept/route');

const catalog = loadScopesFromDirectory();

async function makeRequest(body: unknown): Promise<Response> {
  return POST(
    new Request('https://cloud.arp.run/api/pairing/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function resolvePrincipal(seedByte: number): Promise<{
  did: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> {
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) seed[i] = (seedByte * (i + 1)) & 0xff;
  const publicKey = await ed25519.getPublicKeyAsync(seed);
  return { did: ed25519PublicKeyToDidKey(publicKey), publicKey, privateKey: seed };
}

async function seedTenant(
  db: CloudDbClient,
  principalDid: string,
): Promise<string> {
  const inserted = await db
    .insert(tenants)
    .values({ principalDid, plan: 'free', status: 'active' })
    .returning({ id: tenants.id });
  const id = inserted[0]?.id;
  if (!id) throw new Error('no tenant');
  return id;
}

async function seedCloudAgent(
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
    agentName: 'test',
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

/**
 * Build a fully dual-signed proposal. `issuer` + `acceptor` are both cloud
 * tenants' principals; the proposal is countersigned by the acceptor so the
 * server's verify pass treats it as ready-to-consume.
 */
async function mintDualSignedProposal(
  issuer: { did: string; privateKey: Uint8Array },
  acceptor: { did: string; privateKey: Uint8Array },
  issuerAgentDid: string,
  acceptorAgentDid: string,
  opts?: { expiresAtMs?: number },
): Promise<PairingProposal> {
  const expiresAt = new Date(opts?.expiresAtMs ?? Date.now() + 86_400_000);
  const proposal = await createPairingProposal({
    issuer: issuer.did,
    subject: issuerAgentDid,
    audience: acceptorAgentDid,
    purpose: 'Test connection',
    scopeSelections: [{ id: 'calendar.availability.read', params: { days_ahead: 14 } }],
    expiresAt: expiresAt.toISOString(),
    scopeCatalogVersion: 'v1',
    catalog,
    issuerKey: { privateKey: issuer.privateKey, kid: `${issuer.did}#key-1` },
  });
  const signed = await countersignProposal({
    proposal,
    counterpartyKey: { privateKey: acceptor.privateKey, kid: `${acceptor.did}#key-1` },
    counterpartyDid: acceptor.did,
  });
  return signed.proposal;
}

describe('POST /api/pairing/accept', () => {
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    sessionOverride = null;
  });
  afterEach(async () => {
    if (currentDb) {
      await currentDb.close();
      currentDb = null;
    }
    sessionOverride = null;
  });

  it('401 without a session', async () => {
    const res = await makeRequest({ proposal: {}, acceptingAgentDid: 'did:web:x.agent' });
    expect(res.status).toBe(401);
  });

  it('400 when the accepting agent DID does not match proposal.audience', async () => {
    const issuer = await resolvePrincipal(3);
    const acceptor = await resolvePrincipal(5);
    const issuerAgent = 'did:web:alpha.agent';
    const acceptorAgent = 'did:web:beta.agent';
    const issuerAgentPub = ed25519PublicKeyToDidKey(
      (await resolvePrincipal(11)).publicKey,
    ).replace('did:key:', '');
    const acceptorAgentPub = ed25519PublicKeyToDidKey(
      (await resolvePrincipal(13)).publicKey,
    ).replace('did:key:', '');
    const issuerTenantId = await seedTenant(currentDb!.db, issuer.did);
    const acceptorTenantId = await seedTenant(currentDb!.db, acceptor.did);
    await seedCloudAgent(currentDb!.db, issuerTenantId, issuer.did, issuerAgent, issuerAgentPub);
    await seedCloudAgent(
      currentDb!.db,
      acceptorTenantId,
      acceptor.did,
      acceptorAgent,
      acceptorAgentPub,
    );
    sessionOverride = { principalDid: acceptor.did, tenantId: acceptorTenantId };

    const proposal = await mintDualSignedProposal(
      issuer,
      acceptor,
      issuerAgent,
      acceptorAgent,
    );
    const res = await makeRequest({ proposal, acceptingAgentDid: 'did:web:someone-else.agent' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('accepting_agent_not_audience');
  });

  it('403 when the accepting agent is not owned by the caller tenant', async () => {
    const issuer = await resolvePrincipal(3);
    const acceptor = await resolvePrincipal(5);
    const stranger = await resolvePrincipal(17);
    const issuerAgent = 'did:web:alpha.agent';
    const acceptorAgent = 'did:web:beta.agent';
    const issuerAgentPub = ed25519PublicKeyToDidKey(
      (await resolvePrincipal(11)).publicKey,
    ).replace('did:key:', '');
    const acceptorAgentPub = ed25519PublicKeyToDidKey(
      (await resolvePrincipal(13)).publicKey,
    ).replace('did:key:', '');
    const issuerTenantId = await seedTenant(currentDb!.db, issuer.did);
    const acceptorTenantId = await seedTenant(currentDb!.db, acceptor.did);
    const strangerTenantId = await seedTenant(currentDb!.db, stranger.did);
    await seedCloudAgent(currentDb!.db, issuerTenantId, issuer.did, issuerAgent, issuerAgentPub);
    await seedCloudAgent(
      currentDb!.db,
      acceptorTenantId,
      acceptor.did,
      acceptorAgent,
      acceptorAgentPub,
    );
    // The stranger tenant has NO agent — simulates a caller trying to accept
    // on behalf of someone else's agent.
    sessionOverride = { principalDid: stranger.did, tenantId: strangerTenantId };

    const proposal = await mintDualSignedProposal(
      issuer,
      acceptor,
      issuerAgent,
      acceptorAgent,
    );
    const res = await makeRequest({ proposal, acceptingAgentDid: acceptorAgent });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('accepting_agent_not_tenant');
  });

  it('400 when the proposal signature is invalid (tampered scope)', async () => {
    const issuer = await resolvePrincipal(3);
    const acceptor = await resolvePrincipal(5);
    const issuerAgent = 'did:web:alpha.agent';
    const acceptorAgent = 'did:web:beta.agent';
    const issuerAgentPub = ed25519PublicKeyToDidKey(
      (await resolvePrincipal(11)).publicKey,
    ).replace('did:key:', '');
    const acceptorAgentPub = ed25519PublicKeyToDidKey(
      (await resolvePrincipal(13)).publicKey,
    ).replace('did:key:', '');
    const issuerTenantId = await seedTenant(currentDb!.db, issuer.did);
    const acceptorTenantId = await seedTenant(currentDb!.db, acceptor.did);
    await seedCloudAgent(currentDb!.db, issuerTenantId, issuer.did, issuerAgent, issuerAgentPub);
    await seedCloudAgent(
      currentDb!.db,
      acceptorTenantId,
      acceptor.did,
      acceptorAgent,
      acceptorAgentPub,
    );
    sessionOverride = { principalDid: acceptor.did, tenantId: acceptorTenantId };

    const proposal = await mintDualSignedProposal(
      issuer,
      acceptor,
      issuerAgent,
      acceptorAgent,
    );
    // Tamper: swap purpose after signing. The canonical bytes will differ
    // from what either principal signed.
    const tampered: PairingProposal = { ...proposal, purpose: 'Evil purpose' };
    const res = await makeRequest({ proposal: tampered, acceptingAgentDid: acceptorAgent });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('signature_invalid');
  });

  it('happy path: inserts rows for BOTH tenants, flips invitation.consumed_at', async () => {
    const issuer = await resolvePrincipal(3);
    const acceptor = await resolvePrincipal(5);
    const issuerAgent = 'did:web:alpha.agent';
    const acceptorAgent = 'did:web:beta.agent';
    const issuerAgentPub = ed25519PublicKeyToDidKey(
      (await resolvePrincipal(11)).publicKey,
    ).replace('did:key:', '');
    const acceptorAgentPub = ed25519PublicKeyToDidKey(
      (await resolvePrincipal(13)).publicKey,
    ).replace('did:key:', '');
    const issuerTenantId = await seedTenant(currentDb!.db, issuer.did);
    const acceptorTenantId = await seedTenant(currentDb!.db, acceptor.did);
    await seedCloudAgent(currentDb!.db, issuerTenantId, issuer.did, issuerAgent, issuerAgentPub);
    await seedCloudAgent(
      currentDb!.db,
      acceptorTenantId,
      acceptor.did,
      acceptorAgent,
      acceptorAgentPub,
    );

    const proposal = await mintDualSignedProposal(
      issuer,
      acceptor,
      issuerAgent,
      acceptorAgent,
    );

    // Pre-seed the issuer's invitations row so we can prove consumed_at flips.
    const payload = Buffer.from(JSON.stringify(proposal), 'utf8').toString('base64url');
    await currentDb!.db.insert(pairingInvitations).values({
      tenantId: issuerTenantId,
      issuerAgentDid: issuerAgent,
      requestedScopes: proposal.scope_selections as unknown as Record<string, unknown>,
      challenge: proposal.proposal_id,
      payload,
      expiresAt: new Date(proposal.expires_at),
    });

    sessionOverride = { principalDid: acceptor.did, tenantId: acceptorTenantId };
    const res = await makeRequest({ proposal, acceptingAgentDid: acceptorAgent });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      connectionId: string;
      peerAgentDid: string;
      scopes: string[];
    };
    expect(body.ok).toBe(true);
    expect(body.connectionId).toBe(proposal.connection_id);
    expect(body.peerAgentDid).toBe(issuerAgent);
    expect(body.scopes).toContain('calendar.availability.read');

    // Both tenants get a connection row.
    const connRows = await currentDb!.db
      .select()
      .from(connections)
      .where(eq(connections.connectionId, proposal.connection_id));
    expect(connRows).toHaveLength(2);
    const byTenant = new Map(connRows.map((r) => [r.tenantId, r]));
    expect(byTenant.get(acceptorTenantId)?.agentDid).toBe(acceptorAgent);
    expect(byTenant.get(acceptorTenantId)?.peerDid).toBe(issuerAgent);
    expect(byTenant.get(issuerTenantId)?.agentDid).toBe(issuerAgent);
    expect(byTenant.get(issuerTenantId)?.peerDid).toBe(acceptorAgent);

    // Invitation flipped to consumed.
    const invRows = await currentDb!.db.select().from(pairingInvitations);
    expect(invRows).toHaveLength(1);
    expect(invRows[0]?.consumedAt).not.toBeNull();
  });

  it('409 on duplicate accept (same connection_id)', async () => {
    const issuer = await resolvePrincipal(3);
    const acceptor = await resolvePrincipal(5);
    const issuerAgent = 'did:web:alpha.agent';
    const acceptorAgent = 'did:web:beta.agent';
    const issuerAgentPub = ed25519PublicKeyToDidKey(
      (await resolvePrincipal(11)).publicKey,
    ).replace('did:key:', '');
    const acceptorAgentPub = ed25519PublicKeyToDidKey(
      (await resolvePrincipal(13)).publicKey,
    ).replace('did:key:', '');
    const issuerTenantId = await seedTenant(currentDb!.db, issuer.did);
    const acceptorTenantId = await seedTenant(currentDb!.db, acceptor.did);
    await seedCloudAgent(currentDb!.db, issuerTenantId, issuer.did, issuerAgent, issuerAgentPub);
    await seedCloudAgent(
      currentDb!.db,
      acceptorTenantId,
      acceptor.did,
      acceptorAgent,
      acceptorAgentPub,
    );
    sessionOverride = { principalDid: acceptor.did, tenantId: acceptorTenantId };

    const proposal = await mintDualSignedProposal(
      issuer,
      acceptor,
      issuerAgent,
      acceptorAgent,
    );
    const first = await makeRequest({ proposal, acceptingAgentDid: acceptorAgent });
    expect(first.status).toBe(200);

    const second = await makeRequest({ proposal, acceptingAgentDid: acceptorAgent });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string };
    expect(body.error).toBe('already_consumed');
  });

  it('400 when the proposal is already expired', async () => {
    const issuer = await resolvePrincipal(3);
    const acceptor = await resolvePrincipal(5);
    const issuerAgent = 'did:web:alpha.agent';
    const acceptorAgent = 'did:web:beta.agent';
    const issuerAgentPub = ed25519PublicKeyToDidKey(
      (await resolvePrincipal(11)).publicKey,
    ).replace('did:key:', '');
    const acceptorAgentPub = ed25519PublicKeyToDidKey(
      (await resolvePrincipal(13)).publicKey,
    ).replace('did:key:', '');
    const issuerTenantId = await seedTenant(currentDb!.db, issuer.did);
    const acceptorTenantId = await seedTenant(currentDb!.db, acceptor.did);
    await seedCloudAgent(currentDb!.db, issuerTenantId, issuer.did, issuerAgent, issuerAgentPub);
    await seedCloudAgent(
      currentDb!.db,
      acceptorTenantId,
      acceptor.did,
      acceptorAgent,
      acceptorAgentPub,
    );
    sessionOverride = { principalDid: acceptor.did, tenantId: acceptorTenantId };

    const proposal = await mintDualSignedProposal(
      issuer,
      acceptor,
      issuerAgent,
      acceptorAgent,
      { expiresAtMs: Date.now() - 60_000 },
    );
    const res = await makeRequest({ proposal, acceptingAgentDid: acceptorAgent });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    // verifyPairingProposal rejects expired proposals with a verdict-not-ok.
    expect(body.error).toBe('signature_invalid');
  });
});
