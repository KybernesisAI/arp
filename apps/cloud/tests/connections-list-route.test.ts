/**
 * GET /api/connections — slice 10b.
 *
 * Drives the route handler directly against a fresh PGlite instance and
 * seeds two tenants with overlapping agents so the cross-tenant isolation +
 * filter + pagination assertions are both credible.
 *
 * Scenarios:
 *   1. 401 without a session
 *   2. Returns only the caller tenant's connections
 *   3. status=active filters out revoked
 *   4. agentDid filter scopes to one agent
 *   5. Cursor pagination round-trip (page 1 → nextCursor → page 2 disjoint)
 *   6. limit clamp (request 200 → server returns ≤ 100)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPgliteDb,
  tenants,
  toTenantId,
  withTenant,
  type CloudDbClient,
  type ConnectionRow,
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

const { GET } = await import('../app/api/connections/route');

interface ListResponse {
  connections: Array<{
    connectionId: string;
    agentDid: string;
    peerDid: string;
    status: string;
    scopesCount: number;
    obligationsCount: number;
    createdAt: string;
  }>;
  nextCursor: string | null;
}

async function makeRequest(search: Record<string, string> = {}): Promise<Response> {
  const url = new URL('https://cloud.arp.run/api/connections');
  for (const [k, v] of Object.entries(search)) url.searchParams.set(k, v);
  return GET(new Request(url, { method: 'GET' }));
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
    status?: ConnectionRow['status'];
    createdAtMs?: number;
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
    label: null,
    purpose: 'test',
    tokenJws: '',
    tokenJson: {} as Record<string, unknown>,
    cedarPolicies: (params.cedarPolicies ?? []) as unknown as Record<string, unknown>,
    obligations: (params.obligations ?? []) as unknown as Record<string, unknown>,
    scopeCatalogVersion: 'v1',
    status: params.status ?? 'active',
    metadata: null,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  // Backdate / forward-date createdAt for ordering tests.
  if (params.createdAtMs !== undefined) {
    const { connections } = await import('@kybernesis/arp-cloud-db');
    const { and, eq } = await import('drizzle-orm');
    await currentDb.db
      .update(connections)
      .set({ createdAt: new Date(params.createdAtMs) })
      .where(
        and(
          eq(connections.tenantId, tenantId),
          eq(connections.connectionId, params.connectionId),
        ),
      );
  }
}

describe('GET /api/connections', () => {
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
    const res = await makeRequest();
    expect(res.status).toBe(401);
  });

  it('returns only the caller tenants connections', async () => {
    const tenantA = await seedTenant('did:key:z6MkTenantA-aaaaaaaaaaaaaaaaaaaaaaaaaa');
    const tenantB = await seedTenant('did:key:z6MkTenantB-bbbbbbbbbbbbbbbbbbbbbbbbbb');
    await seedAgent(tenantA, 'did:web:alpha.agent', 'did:key:z6MkTenantA-aaaaaaaaaaaaaaaaaaaaaaaaaa');
    await seedAgent(tenantB, 'did:web:bravo.agent', 'did:key:z6MkTenantB-bbbbbbbbbbbbbbbbbbbbbbbbbb');
    await seedConnection(tenantA, {
      connectionId: 'conn-a-1',
      agentDid: 'did:web:alpha.agent',
      peerDid: 'did:web:peer-a.agent',
    });
    await seedConnection(tenantB, {
      connectionId: 'conn-b-1',
      agentDid: 'did:web:bravo.agent',
      peerDid: 'did:web:peer-b.agent',
    });

    sessionOverride = {
      principalDid: 'did:key:z6MkTenantA-aaaaaaaaaaaaaaaaaaaaaaaaaa',
      tenantId: tenantA,
    };
    const res = await makeRequest();
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListResponse;
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0]?.connectionId).toBe('conn-a-1');
  });

  it('status=active excludes revoked rows', async () => {
    const tenantId = await seedTenant('did:key:z6MkAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await seedAgent(tenantId, 'did:web:alpha.agent', 'did:key:z6MkAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await seedConnection(tenantId, {
      connectionId: 'conn-active',
      agentDid: 'did:web:alpha.agent',
      peerDid: 'did:web:peer-a.agent',
      status: 'active',
    });
    await seedConnection(tenantId, {
      connectionId: 'conn-revoked',
      agentDid: 'did:web:alpha.agent',
      peerDid: 'did:web:peer-b.agent',
      status: 'revoked',
    });

    sessionOverride = {
      principalDid: 'did:key:z6MkAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      tenantId,
    };
    const res = await makeRequest();
    const body = (await res.json()) as ListResponse;
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0]?.connectionId).toBe('conn-active');

    const allRes = await makeRequest({ status: 'all' });
    const allBody = (await allRes.json()) as ListResponse;
    expect(allBody.connections).toHaveLength(2);
  });

  it('agentDid filter scopes to a single agent', async () => {
    const tenantId = await seedTenant('did:key:z6MkBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    await seedAgent(tenantId, 'did:web:alpha.agent', 'did:key:z6MkBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    await seedAgent(tenantId, 'did:web:bravo.agent', 'did:key:z6MkBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    await seedConnection(tenantId, {
      connectionId: 'conn-alpha-1',
      agentDid: 'did:web:alpha.agent',
      peerDid: 'did:web:peer-a.agent',
    });
    await seedConnection(tenantId, {
      connectionId: 'conn-bravo-1',
      agentDid: 'did:web:bravo.agent',
      peerDid: 'did:web:peer-b.agent',
    });

    sessionOverride = {
      principalDid: 'did:key:z6MkBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      tenantId,
    };
    const res = await makeRequest({ agentDid: 'did:web:alpha.agent' });
    const body = (await res.json()) as ListResponse;
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0]?.agentDid).toBe('did:web:alpha.agent');
  });

  it('cursor pagination returns a second, disjoint page', async () => {
    const tenantId = await seedTenant('did:key:z6MkCcccccccccccccccccccccccccccccccccccccc');
    await seedAgent(tenantId, 'did:web:alpha.agent', 'did:key:z6MkCcccccccccccccccccccccccccccccccccccccc');
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await seedConnection(tenantId, {
        connectionId: `conn-${i}`,
        agentDid: 'did:web:alpha.agent',
        peerDid: `did:web:peer-${i}.agent`,
        // Strictly increasing timestamps → deterministic DESC ordering.
        createdAtMs: now + i * 1000,
      });
    }
    sessionOverride = {
      principalDid: 'did:key:z6MkCcccccccccccccccccccccccccccccccccccccc',
      tenantId,
    };

    const page1 = (await (await makeRequest({ limit: '2' })).json()) as ListResponse;
    expect(page1.connections).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = (await (
      await makeRequest({ limit: '2', cursor: page1.nextCursor! })
    ).json()) as ListResponse;
    expect(page2.connections).toHaveLength(2);
    expect(page2.nextCursor).toBeTruthy();

    const page3 = (await (
      await makeRequest({ limit: '2', cursor: page2.nextCursor! })
    ).json()) as ListResponse;
    expect(page3.connections).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();

    const p1Ids = page1.connections.map((c) => c.connectionId);
    const p2Ids = page2.connections.map((c) => c.connectionId);
    const p3Ids = page3.connections.map((c) => c.connectionId);
    // Fully disjoint.
    expect(new Set([...p1Ids, ...p2Ids, ...p3Ids]).size).toBe(5);
  });

  it('clamps a requested limit above MAX to 100', async () => {
    const tenantId = await seedTenant('did:key:z6MkDddddddddddddddddddddddddddddddddddddddd');
    await seedAgent(tenantId, 'did:web:alpha.agent', 'did:key:z6MkDddddddddddddddddddddddddddddddddddddddd');
    for (let i = 0; i < 120; i++) {
      await seedConnection(tenantId, {
        connectionId: `c-${i.toString().padStart(3, '0')}`,
        agentDid: 'did:web:alpha.agent',
        peerDid: `did:web:peer-${i}.agent`,
        createdAtMs: Date.now() + i * 10,
      });
    }
    sessionOverride = {
      principalDid: 'did:key:z6MkDddddddddddddddddddddddddddddddddddddddd',
      tenantId,
    };
    const res = await makeRequest({ limit: '200' });
    const body = (await res.json()) as ListResponse;
    expect(body.connections.length).toBeLessThanOrEqual(100);
    expect(body.connections).toHaveLength(100);
    expect(body.nextCursor).toBeTruthy();
  });
});
