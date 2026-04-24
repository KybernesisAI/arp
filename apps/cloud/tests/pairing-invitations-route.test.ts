/**
 * POST / GET /api/pairing/invitations — slice 10a.
 *
 * Drives the route handler directly against a fresh PGlite instance so the
 * test is hermetic. The route expects a client-signed `PairingProposal`; we
 * build one with the real `createPairingProposal` helper from
 * `@kybernesis/arp-pairing` using a deterministic seed, then post it up.
 *
 * Scenarios covered:
 *   1. Happy path: create + row persists + URL carries payload in fragment
 *   2. 401 unauth
 *   3. 403 when proposal.issuer mismatches session principal
 *   4. 403 when proposal.subject is not a tenant agent
 *   5. 400 when proposal has expired already
 *   6. GET lists only pending invitations for this tenant
 *   7. DELETE cancels and the listing no longer returns the row
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import {
  createPgliteDb,
  tenants,
  pairingInvitations,
  toTenantId,
  withTenant,
  type CloudDbClient,
} from '@kybernesis/arp-cloud-db';
import {
  createPairingProposal,
  type PairingProposal,
} from '@kybernesis/arp-pairing';
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

// Import after mocks.
const { POST, GET } = await import('../app/api/pairing/invitations/route');
const { DELETE } = await import('../app/api/pairing/invitations/[id]/route');

const catalog = loadScopesFromDirectory();

async function makePostRequest(body: unknown, host = 'cloud.arp.run'): Promise<Response> {
  return POST(
    new Request(`https://${host}/api/pairing/invitations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-host': host,
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify(body),
    }),
  );
}

async function makeGetRequest(): Promise<Response> {
  return GET();
}

async function makeDeleteRequest(id: string): Promise<Response> {
  return DELETE(
    new Request(`https://cloud.arp.run/api/pairing/invitations/${id}`, {
      method: 'DELETE',
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function resolvePrincipal(seedByte: number): Promise<{
  did: string;
  privateKey: Uint8Array;
}> {
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) seed[i] = (seedByte * (i + 1)) & 0xff;
  const publicKey = await ed25519.getPublicKeyAsync(seed);
  return { did: ed25519PublicKeyToDidKey(publicKey), privateKey: seed };
}

async function seedTenantAndAgent(
  db: CloudDbClient,
  principalDid: string,
  agentDid: string,
  agentPublicKeyMultibase = 'z6Mk-dummy-agent-key',
): Promise<string> {
  const inserted = await db
    .insert(tenants)
    .values({ principalDid, plan: 'free', status: 'active' })
    .returning({ id: tenants.id });
  const tenantId = inserted[0]?.id;
  if (!tenantId) throw new Error('no tenant');

  const tenantDb = withTenant(db, toTenantId(tenantId));
  await tenantDb.createAgent({
    did: agentDid,
    principalDid,
    agentName: 'test',
    agentDescription: '',
    publicKeyMultibase: agentPublicKeyMultibase,
    handoffJson: {},
    wellKnownDid: {},
    wellKnownAgentCard: {},
    wellKnownArp: {},
    scopeCatalogVersion: 'v1',
    tlsFingerprint: 'cloud-hosted',
  });
  return tenantId;
}

async function makeSignedProposal(
  issuer: { did: string; privateKey: Uint8Array },
  subject: string,
  audience: string,
  opts?: { expiresAtMs?: number },
): Promise<PairingProposal> {
  const expiresAt = new Date(opts?.expiresAtMs ?? Date.now() + 86_400_000);
  return createPairingProposal({
    issuer: issuer.did,
    subject,
    audience,
    purpose: 'Test connection',
    scopeSelections: [{ id: 'calendar.availability.read', params: { days_ahead: 14 } }],
    expiresAt: expiresAt.toISOString(),
    scopeCatalogVersion: 'v1',
    catalog,
    issuerKey: { privateKey: issuer.privateKey, kid: `${issuer.did}#key-1` },
  });
}

describe('POST /api/pairing/invitations', () => {
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
    const res = await makePostRequest({ proposal: {} });
    expect(res.status).toBe(401);
  });

  it('persists the invitation and returns a fragment-bearing URL', async () => {
    const principal = await resolvePrincipal(3);
    const agentDid = 'did:web:agent-alpha.agent';
    const tenantId = await seedTenantAndAgent(currentDb!.db, principal.did, agentDid);
    sessionOverride = { principalDid: principal.did, tenantId };

    const proposal = await makeSignedProposal(principal, agentDid, 'did:web:peer.agent');
    const res = await makePostRequest({ proposal });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      invitationId: string;
      invitationUrl: string;
      expiresAt: string;
      proposalId: string;
      connectionId: string;
    };
    expect(body.invitationId).toBeTruthy();
    expect(body.invitationUrl).toMatch(
      /^https:\/\/cloud\.arp\.run\/pair\/accept#[A-Za-z0-9_-]+$/,
    );
    // The URL must carry the payload in a fragment, not a query parameter —
    // fragments are stripped by the browser before the HTTP request fires.
    expect(body.invitationUrl).not.toContain('?');
    expect(body.proposalId).toBe(proposal.proposal_id);

    const rows = await currentDb!.db.select().from(pairingInvitations);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(tenantId);
    expect(rows[0]?.issuerAgentDid).toBe(agentDid);
  });

  it('403 when proposal.issuer is not the session principal', async () => {
    const principal = await resolvePrincipal(3);
    const otherPrincipal = await resolvePrincipal(5);
    const agentDid = 'did:web:agent-alpha.agent';
    const tenantId = await seedTenantAndAgent(currentDb!.db, principal.did, agentDid);
    sessionOverride = { principalDid: principal.did, tenantId };

    const proposal = await makeSignedProposal(
      otherPrincipal,
      agentDid,
      'did:web:peer.agent',
    );
    const res = await makePostRequest({ proposal });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('issuer_mismatch');
  });

  it('403 when proposal.subject is not a tenant agent', async () => {
    const principal = await resolvePrincipal(3);
    const agentDid = 'did:web:agent-alpha.agent';
    const otherAgentDid = 'did:web:not-mine.agent';
    const tenantId = await seedTenantAndAgent(currentDb!.db, principal.did, agentDid);
    sessionOverride = { principalDid: principal.did, tenantId };

    const proposal = await makeSignedProposal(
      principal,
      otherAgentDid,
      'did:web:peer.agent',
    );
    const res = await makePostRequest({ proposal });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('subject_not_tenant_agent');
  });

  it('400 when the proposal is already expired', async () => {
    const principal = await resolvePrincipal(3);
    const agentDid = 'did:web:agent-alpha.agent';
    const tenantId = await seedTenantAndAgent(currentDb!.db, principal.did, agentDid);
    sessionOverride = { principalDid: principal.did, tenantId };

    const proposal = await makeSignedProposal(
      principal,
      agentDid,
      'did:web:peer.agent',
      { expiresAtMs: Date.now() - 60_000 },
    );
    const res = await makePostRequest({ proposal });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('already_expired');
  });

  it('GET returns only this tenant\'s pending invitations', async () => {
    const principal = await resolvePrincipal(3);
    const agentDid = 'did:web:agent-alpha.agent';
    const tenantId = await seedTenantAndAgent(currentDb!.db, principal.did, agentDid);
    sessionOverride = { principalDid: principal.did, tenantId };

    // Seed a second tenant with its own invitation.
    const otherPrincipal = await resolvePrincipal(5);
    const otherAgentDid = 'did:web:agent-beta.agent';
    await seedTenantAndAgent(currentDb!.db, otherPrincipal.did, otherAgentDid);

    await makePostRequest({
      proposal: await makeSignedProposal(
        principal,
        agentDid,
        'did:web:peer.agent',
      ),
    });

    const res = await makeGetRequest();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      invitations: Array<{ id: string; issuerAgentDid: string }>;
    };
    expect(body.invitations).toHaveLength(1);
    expect(body.invitations[0]?.issuerAgentDid).toBe(agentDid);
  });

  it('DELETE cancels a pending invitation and GET excludes it afterwards', async () => {
    const principal = await resolvePrincipal(3);
    const agentDid = 'did:web:agent-alpha.agent';
    const tenantId = await seedTenantAndAgent(currentDb!.db, principal.did, agentDid);
    sessionOverride = { principalDid: principal.did, tenantId };

    const createRes = await makePostRequest({
      proposal: await makeSignedProposal(
        principal,
        agentDid,
        'did:web:peer.agent',
      ),
    });
    const { invitationId } = (await createRes.json()) as { invitationId: string };

    const delRes = await makeDeleteRequest(invitationId);
    expect(delRes.status).toBe(200);
    const delBody = (await delRes.json()) as { ok: boolean; cancelled: boolean };
    expect(delBody.cancelled).toBe(true);

    const listRes = await makeGetRequest();
    const listBody = (await listRes.json()) as { invitations: unknown[] };
    expect(listBody.invitations).toHaveLength(0);

    // Second cancel is idempotent (cancelled=false, but still 200).
    const delRes2 = await makeDeleteRequest(invitationId);
    expect(delRes2.status).toBe(200);
    const delBody2 = (await delRes2.json()) as { cancelled: boolean };
    expect(delBody2.cancelled).toBe(false);
  });
});
