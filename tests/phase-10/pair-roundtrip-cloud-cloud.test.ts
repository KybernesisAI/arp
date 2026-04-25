/**
 * Phase 10 slice 10e — A1: cloud↔cloud pairing round-trip.
 *
 * Two cloud tenants, both hosted on the same `arp.cloud` instance, walk
 * the full Phase-10a flow:
 *
 *   1. Tenant A's owner posts a signed PairingProposal to
 *      `POST /api/pairing/invitations`. A row lands in
 *      `pairing_invitations` for tenant A.
 *   2. The browser carries the signed payload in a URL fragment to tenant
 *      B's session.
 *   3. Tenant B's owner countersigns and posts to
 *      `POST /api/pairing/accept`.
 *   4. The accept route inserts a `connections` row for BOTH tenants
 *      (composite PK `(tenant_id, connection_id)`), flips the
 *      invitation's `consumed_at`, and returns the connection id.
 *
 * We assert each post-condition explicitly so future regressions in the
 * dual-tenant insert + composite-PK behaviour fail loudly. No live
 * network: PGlite for the cloud db, in-process route handlers, no
 * outbound fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createPgliteDb,
  connections,
  pairingInvitations,
  type CloudDbClient,
} from '@kybernesis/arp-cloud-db';
import { countersignProposal } from '@kybernesis/arp-pairing';
import {
  loadScopesFromDirectory,
  resolvePrincipal,
  seedTenant,
  seedCloudAgent,
  syntheticAgentMultibase,
  mintIssuerProposal,
  mintDualSignedProposal,
} from './helpers/cloud-fixtures';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'phase-10-session-secret-aaaaaaaa';

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
      nonce: 'phase10-nonce',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3_600_000,
    };
  },
}));

const { POST: PostInvitation } = await import(
  '@/app/api/pairing/invitations/route'
);
const { POST: PostAccept } = await import('@/app/api/pairing/accept/route');

const catalog = loadScopesFromDirectory();

describe('Phase 10/10e — cloud↔cloud pairing round-trip', () => {
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

  it('creates a row on both tenants + flips consumed_at + returns the right connection id', async () => {
    if (!currentDb) throw new Error('db gone');

    // Set up two fully-independent cloud tenants. Each owns one agent.
    const tenantAOwner = await resolvePrincipal(31);
    const tenantBOwner = await resolvePrincipal(37);
    const tenantAAgentDid = 'did:web:agent-alpha.agent';
    const tenantBAgentDid = 'did:web:agent-beta.agent';
    const tenantAAgentMb = await syntheticAgentMultibase(101);
    const tenantBAgentMb = await syntheticAgentMultibase(103);
    const tenantAId = await seedTenant(currentDb.db, tenantAOwner.did);
    const tenantBId = await seedTenant(currentDb.db, tenantBOwner.did);
    await seedCloudAgent(
      currentDb.db,
      tenantAId,
      tenantAOwner.did,
      tenantAAgentDid,
      tenantAAgentMb,
    );
    await seedCloudAgent(
      currentDb.db,
      tenantBId,
      tenantBOwner.did,
      tenantBAgentDid,
      tenantBAgentMb,
    );

    // STEP 1: tenant A posts a signed-by-A proposal to /api/pairing/invitations.
    sessionOverride = { principalDid: tenantAOwner.did, tenantId: tenantAId };
    const issuerOnlyProposal = await mintIssuerProposal(
      catalog,
      tenantAOwner,
      tenantAAgentDid,
      tenantBAgentDid,
    );
    const inviteRes = await PostInvitation(
      new Request('https://cloud.arp.run/api/pairing/invitations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-host': 'cloud.arp.run',
          'x-forwarded-proto': 'https',
        },
        body: JSON.stringify({ proposal: issuerOnlyProposal }),
      }),
    );
    expect(inviteRes.status).toBe(200);
    const inviteBody = (await inviteRes.json()) as {
      invitationUrl: string;
      connectionId: string;
    };
    expect(inviteBody.invitationUrl).toMatch(
      /^https:\/\/cloud\.arp\.run\/pair\/accept#[A-Za-z0-9_-]+$/,
    );
    expect(inviteBody.connectionId).toBe(issuerOnlyProposal.connection_id);
    const invitationRows = await currentDb.db.select().from(pairingInvitations);
    expect(invitationRows).toHaveLength(1);
    expect(invitationRows[0]?.tenantId).toBe(tenantAId);
    expect(invitationRows[0]?.challenge).toBe(issuerOnlyProposal.proposal_id);
    expect(invitationRows[0]?.consumedAt).toBeNull();

    // STEP 2: tenant B's browser receives the invitation payload via the
    // URL fragment, countersigns the SAME proposal (preserving its
    // proposal_id / connection_id so the issuer's invitation row matches),
    // and posts to /accept.
    sessionOverride = { principalDid: tenantBOwner.did, tenantId: tenantBId };
    const dualSigned = (
      await countersignProposal({
        proposal: issuerOnlyProposal,
        counterpartyKey: {
          privateKey: tenantBOwner.privateKey,
          kid: `${tenantBOwner.did}#key-1`,
        },
        counterpartyDid: tenantBOwner.did,
      })
    ).proposal;

    const acceptRes = await PostAccept(
      new Request('https://cloud.arp.run/api/pairing/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proposal: dualSigned,
          acceptingAgentDid: tenantBAgentDid,
        }),
      }),
    );
    expect(acceptRes.status).toBe(200);
    const acceptBody = (await acceptRes.json()) as {
      ok: boolean;
      connectionId: string;
      peerAgentDid: string;
      scopes: string[];
    };
    expect(acceptBody.ok).toBe(true);
    expect(acceptBody.connectionId).toBe(dualSigned.connection_id);
    expect(acceptBody.peerAgentDid).toBe(tenantAAgentDid);
    expect(acceptBody.scopes).toContain('calendar.availability.read');

    // STEP 3a: connection rows exist on BOTH tenants.
    const connRows = await currentDb.db
      .select()
      .from(connections)
      .where(eq(connections.connectionId, dualSigned.connection_id));
    expect(connRows).toHaveLength(2);
    const byTenant = new Map(connRows.map((r) => [r.tenantId, r]));
    expect(byTenant.get(tenantAId)?.agentDid).toBe(tenantAAgentDid);
    expect(byTenant.get(tenantAId)?.peerDid).toBe(tenantBAgentDid);
    expect(byTenant.get(tenantBId)?.agentDid).toBe(tenantBAgentDid);
    expect(byTenant.get(tenantBId)?.peerDid).toBe(tenantAAgentDid);

    // STEP 3b: composite PK respected — both rows share the SAME
    // connection_id but differ on tenant_id.
    const allConnIds = connRows.map((r) => r.connectionId);
    expect(new Set(allConnIds).size).toBe(1);
    const allTenantIds = connRows.map((r) => r.tenantId);
    expect(new Set(allTenantIds).size).toBe(2);

    // STEP 3c: the issuer's invitation row flipped to consumed.
    const finalInvitations = await currentDb.db.select().from(pairingInvitations);
    expect(finalInvitations).toHaveLength(1);
    expect(finalInvitations[0]?.consumedAt).not.toBeNull();
  });

  it('issuing tenant cannot also accept (subject_not_tenant_agent guard)', async () => {
    // Negative path: the issuing tenant's principal posts /accept with
    // someone else's audience agent. The route refuses because the
    // accepting agent isn't owned by the caller's tenant.
    if (!currentDb) throw new Error('db gone');
    const tenantAOwner = await resolvePrincipal(41);
    const tenantBOwner = await resolvePrincipal(43);
    const tenantAAgentDid = 'did:web:agent-charlie.agent';
    const tenantBAgentDid = 'did:web:agent-delta.agent';
    const tenantAAgentMb = await syntheticAgentMultibase(105);
    const tenantBAgentMb = await syntheticAgentMultibase(107);
    const tenantAId = await seedTenant(currentDb.db, tenantAOwner.did);
    const tenantBId = await seedTenant(currentDb.db, tenantBOwner.did);
    await seedCloudAgent(
      currentDb.db,
      tenantAId,
      tenantAOwner.did,
      tenantAAgentDid,
      tenantAAgentMb,
    );
    await seedCloudAgent(
      currentDb.db,
      tenantBId,
      tenantBOwner.did,
      tenantBAgentDid,
      tenantBAgentMb,
    );

    const proposal = await mintDualSignedProposal(
      catalog,
      tenantAOwner,
      tenantBOwner,
      tenantAAgentDid,
      tenantBAgentDid,
    );

    sessionOverride = { principalDid: tenantAOwner.did, tenantId: tenantAId };
    const res = await PostAccept(
      new Request('https://cloud.arp.run/api/pairing/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proposal,
          acceptingAgentDid: tenantBAgentDid,
        }),
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('accepting_agent_not_tenant');
  });
});
