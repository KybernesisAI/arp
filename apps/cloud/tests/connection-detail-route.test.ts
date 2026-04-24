/**
 * GET /api/connections/:id — slice 10b.
 *
 * Scenarios:
 *   1. 401 without a session
 *   2. 404 for a non-existent id
 *   3. 404 for another tenant's id (privacy: same 404 as missing)
 *   4. Happy path returns full detail
 *   5. Revoked connection returns with status=revoked + revokeReason
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPgliteDb,
  tenants,
  toTenantId,
  withTenant,
  type CloudDbClient,
} from '@kybernesis/arp-cloud-db';

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

const { GET } = await import('../app/api/connections/[id]/route');

interface DetailResponse {
  connection?: {
    connectionId: string;
    agentDid: string;
    peerDid: string;
    status: string;
    cedarPolicies: string[];
    obligations: unknown[];
    revokeReason: string | null;
    token: {
      issuer: string | null;
      subject: string | null;
      audience: string | null;
      expires: string | null;
    };
  };
  error?: string;
}

async function makeRequest(id: string): Promise<Response> {
  return GET(
    new Request(`https://cloud.arp.run/api/connections/${encodeURIComponent(id)}`, {
      method: 'GET',
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function seedTenant(principalDid: string): Promise<string> {
  if (!currentDb) throw new Error('db gone');
  const rows = await currentDb.db
    .insert(tenants)
    .values({ principalDid, plan: 'free', status: 'active' })
    .returning({ id: tenants.id });
  const id = rows[0]?.id;
  if (!id) throw new Error('no tenant');
  return id;
}

async function seedAgent(
  tenantId: string,
  agentDid: string,
  principalDid: string,
): Promise<void> {
  if (!currentDb) throw new Error('db gone');
  const tenantDb = withTenant(currentDb.db, toTenantId(tenantId));
  await tenantDb.createAgent({
    did: agentDid,
    principalDid,
    agentName: agentDid.replace('did:web:', ''),
    agentDescription: '',
    publicKeyMultibase: 'z6Mk-dummy',
    handoffJson: {},
    wellKnownDid: {},
    wellKnownAgentCard: {},
    wellKnownArp: {},
    scopeCatalogVersion: 'v1',
    tlsFingerprint: 'cloud-hosted',
  });
}

async function seedConnection(
  tenantId: string,
  params: {
    connectionId: string;
    agentDid: string;
    peerDid: string;
    status?: 'active' | 'revoked' | 'suspended';
    revokeReason?: string;
    tokenJson?: Record<string, unknown>;
    cedarPolicies?: unknown[];
    obligations?: unknown[];
  },
): Promise<void> {
  if (!currentDb) throw new Error('db gone');
  const tenantDb = withTenant(currentDb.db, toTenantId(tenantId));
  await tenantDb.createConnection({
    connectionId: params.connectionId,
    agentDid: params.agentDid,
    peerDid: params.peerDid,
    label: 'test-label',
    purpose: 'Test connection',
    tokenJws: '',
    tokenJson: (params.tokenJson ?? {}) as Record<string, unknown>,
    cedarPolicies: (params.cedarPolicies ?? []) as unknown as Record<string, unknown>,
    obligations: (params.obligations ?? []) as unknown as Record<string, unknown>,
    scopeCatalogVersion: 'v1',
    status: params.status ?? 'active',
    metadata: null,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  if (params.revokeReason) {
    await tenantDb.updateConnectionStatus(
      params.connectionId,
      'revoked',
      params.revokeReason,
    );
  }
}

describe('GET /api/connections/:id', () => {
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
    const res = await makeRequest('any-id');
    expect(res.status).toBe(401);
  });

  it('404 for a non-existent id', async () => {
    const principal = 'did:key:z6MkTenantAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const tenantId = await seedTenant(principal);
    sessionOverride = { principalDid: principal, tenantId };
    const res = await makeRequest('ghost-connection');
    expect(res.status).toBe(404);
  });

  it('404 for another tenant connection (privacy: no tenant-detection leak)', async () => {
    const principalA = 'did:key:z6MkTenantAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const principalB = 'did:key:z6MkTenantBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const tenantA = await seedTenant(principalA);
    const tenantB = await seedTenant(principalB);
    await seedAgent(tenantB, 'did:web:bravo.agent', principalB);
    await seedConnection(tenantB, {
      connectionId: 'conn-of-tenant-b',
      agentDid: 'did:web:bravo.agent',
      peerDid: 'did:web:peer.agent',
    });

    sessionOverride = { principalDid: principalA, tenantId: tenantA };
    const res = await makeRequest('conn-of-tenant-b');
    expect(res.status).toBe(404);
    const body = (await res.json()) as DetailResponse;
    // Same shape as the missing-id case — no "belongs to another tenant" leak.
    expect(body.error).toBe('not_found');
  });

  it('happy path returns full detail', async () => {
    const principal = 'did:key:z6MkTenantHaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const tenantId = await seedTenant(principal);
    await seedAgent(tenantId, 'did:web:alpha.agent', principal);
    const token = {
      issuer: principal,
      subject: 'did:web:alpha.agent',
      audience: 'did:web:peer.agent',
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    };
    await seedConnection(tenantId, {
      connectionId: 'conn-ok',
      agentDid: 'did:web:alpha.agent',
      peerDid: 'did:web:peer.agent',
      tokenJson: token,
      cedarPolicies: ['permit(principal == A, action, resource);'],
      obligations: [{ type: 'max_rate_per_min', params: { n: 5 } }],
    });

    sessionOverride = { principalDid: principal, tenantId };
    const res = await makeRequest('conn-ok');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DetailResponse;
    expect(body.connection?.connectionId).toBe('conn-ok');
    expect(body.connection?.agentDid).toBe('did:web:alpha.agent');
    expect(body.connection?.peerDid).toBe('did:web:peer.agent');
    expect(body.connection?.status).toBe('active');
    expect(body.connection?.cedarPolicies).toHaveLength(1);
    expect(body.connection?.obligations).toHaveLength(1);
    expect(body.connection?.token.audience).toBe('did:web:peer.agent');
    expect(body.connection?.token.issuer).toBe(principal);
  });

  it('revoked connection returns with status=revoked + revokeReason', async () => {
    const principal = 'did:key:z6MkTenantRevokeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const tenantId = await seedTenant(principal);
    await seedAgent(tenantId, 'did:web:alpha.agent', principal);
    await seedConnection(tenantId, {
      connectionId: 'conn-revoked',
      agentDid: 'did:web:alpha.agent',
      peerDid: 'did:web:peer.agent',
      revokeReason: 'user_cancelled_subscription',
    });

    sessionOverride = { principalDid: principal, tenantId };
    const res = await makeRequest('conn-revoked');
    const body = (await res.json()) as DetailResponse;
    expect(body.connection?.status).toBe('revoked');
    expect(body.connection?.revokeReason).toBe('user_cancelled_subscription');
  });
});
