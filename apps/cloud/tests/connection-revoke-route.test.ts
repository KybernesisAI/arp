/**
 * POST /api/connections/:id/revoke — slice 10b.
 *
 * Scenarios:
 *   1. 401 without a session
 *   2. 404 for another tenant's connection (privacy: same 404 as missing)
 *   3. Happy path: status flips, revocations row inserted, audit entry appended
 *   4. Idempotent: second revoke returns already_revoked=true, no duplicate audit
 *   5. Rate-limit trips on 11th hit inside a minute for the same tenant
 *   6. Reason text persists to revocations.reason
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  auditEntries,
  connections,
  createPgliteDb,
  revocations,
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

const { POST } = await import('../app/api/connections/[id]/revoke/route');

interface RevokeResponse {
  ok: boolean;
  alreadyRevoked?: boolean;
  revokedAt?: string;
  connectionId?: string;
  peerDid?: string;
  reason?: string;
  error?: string;
}

async function makeRequest(id: string, body: unknown = {}): Promise<Response> {
  return POST(
    new Request(`https://cloud.arp.run/api/connections/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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
  connectionId: string,
  agentDid: string,
  peerDid: string,
): Promise<void> {
  if (!currentDb) throw new Error('db gone');
  const tenantDb = withTenant(currentDb.db, toTenantId(tenantId));
  await tenantDb.createConnection({
    connectionId,
    agentDid,
    peerDid,
    label: null,
    purpose: 'test',
    tokenJws: '',
    tokenJson: {} as Record<string, unknown>,
    cedarPolicies: [] as unknown as Record<string, unknown>,
    obligations: [] as unknown as Record<string, unknown>,
    scopeCatalogVersion: 'v1',
    metadata: null,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
}

describe('POST /api/connections/:id/revoke', () => {
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

  it('404 for another tenant connection (privacy: same 404 as missing)', async () => {
    const pA = 'did:key:z6MkTAAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const pB = 'did:key:z6MkTBBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const tenantA = await seedTenant(pA);
    const tenantB = await seedTenant(pB);
    await seedAgent(tenantB, 'did:web:bravo.agent', pB);
    await seedConnection(tenantB, 'shared-id', 'did:web:bravo.agent', 'did:web:peer.agent');

    sessionOverride = { principalDid: pA, tenantId: tenantA };
    const res = await makeRequest('shared-id');
    expect(res.status).toBe(404);
    const body = (await res.json()) as RevokeResponse;
    expect(body.error).toBe('not_found');

    // Tenant B's row remains 'active'.
    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db
      .select()
      .from(connections)
      .where(
        and(eq(connections.tenantId, tenantB), eq(connections.connectionId, 'shared-id')),
      );
    expect(rows[0]?.status).toBe('active');
  });

  it('happy path: flips status, inserts revocations row, appends audit entry', async () => {
    const p = 'did:key:z6MkTHaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const tenantId = await seedTenant(p);
    await seedAgent(tenantId, 'did:web:alpha.agent', p);
    await seedConnection(tenantId, 'conn-1', 'did:web:alpha.agent', 'did:web:peer.agent');

    sessionOverride = { principalDid: p, tenantId };
    const res = await makeRequest('conn-1', { reason: 'no_longer_needed' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RevokeResponse;
    expect(body.ok).toBe(true);
    expect(body.alreadyRevoked).toBe(false);
    expect(body.connectionId).toBe('conn-1');
    expect(body.peerDid).toBe('did:web:peer.agent');

    if (!currentDb) throw new Error('db gone');
    // Connection status flipped.
    const connRows = await currentDb.db
      .select()
      .from(connections)
      .where(
        and(eq(connections.tenantId, tenantId), eq(connections.connectionId, 'conn-1')),
      );
    expect(connRows[0]?.status).toBe('revoked');
    expect(connRows[0]?.revokeReason).toBe('no_longer_needed');
    // Revocations row inserted.
    const revRows = await currentDb.db
      .select()
      .from(revocations)
      .where(
        and(
          eq(revocations.tenantId, tenantId),
          eq(revocations.subjectId, 'conn-1'),
          eq(revocations.kind, 'connection'),
        ),
      );
    expect(revRows).toHaveLength(1);
    expect(revRows[0]?.reason).toBe('no_longer_needed');
    // Audit entry appended with decision='revoke'.
    const auditRows = await currentDb.db
      .select()
      .from(auditEntries)
      .where(
        and(
          eq(auditEntries.tenantId, tenantId),
          eq(auditEntries.connectionId, 'conn-1'),
        ),
      );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.decision).toBe('revoke');
    expect(auditRows[0]?.reason).toBe('no_longer_needed');
    // Chain links to genesis (seq 0 → prev_hash = genesis).
    expect(auditRows[0]?.seq).toBe(0);
  });

  it('idempotent: second revoke returns alreadyRevoked=true, no duplicate audit', async () => {
    const p = 'did:key:z6MkIDEaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const tenantId = await seedTenant(p);
    await seedAgent(tenantId, 'did:web:alpha.agent', p);
    await seedConnection(tenantId, 'conn-idem', 'did:web:alpha.agent', 'did:web:peer.agent');

    sessionOverride = { principalDid: p, tenantId };
    const first = await makeRequest('conn-idem');
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as RevokeResponse;
    expect(firstBody.alreadyRevoked).toBe(false);

    const second = await makeRequest('conn-idem');
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as RevokeResponse;
    expect(secondBody.alreadyRevoked).toBe(true);

    if (!currentDb) throw new Error('db gone');
    const auditRows = await currentDb.db
      .select()
      .from(auditEntries)
      .where(
        and(
          eq(auditEntries.tenantId, tenantId),
          eq(auditEntries.connectionId, 'conn-idem'),
        ),
      );
    expect(auditRows).toHaveLength(1);
  });

  it('429 on the 11th hit inside a minute for the same tenant', async () => {
    const frozen = Date.UTC(2026, 5, 1, 14, 0, 0);
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(frozen);
    try {
      const p = 'did:key:z6MkRATeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      const tenantId = await seedTenant(p);
      await seedAgent(tenantId, 'did:web:alpha.agent', p);
      // Pre-seed 11 connections so each revoke hits a fresh non-revoked row.
      for (let i = 0; i < 11; i++) {
        await seedConnection(
          tenantId,
          `conn-rl-${i}`,
          'did:web:alpha.agent',
          `did:web:peer-${i}.agent`,
        );
      }
      sessionOverride = { principalDid: p, tenantId };
      for (let i = 0; i < 10; i++) {
        const res = await makeRequest(`conn-rl-${i}`);
        expect(res.status).toBe(200);
      }
      const tripped = await makeRequest('conn-rl-10');
      expect(tripped.status).toBe(429);
      expect(tripped.headers.get('retry-after')).toBeTruthy();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('reason text persists to revocations.reason', async () => {
    const p = 'did:key:z6MkRESaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const tenantId = await seedTenant(p);
    await seedAgent(tenantId, 'did:web:alpha.agent', p);
    await seedConnection(tenantId, 'conn-reason', 'did:web:alpha.agent', 'did:web:peer.agent');

    sessionOverride = { principalDid: p, tenantId };
    const res = await makeRequest('conn-reason', { reason: 'suspicious activity' });
    expect(res.status).toBe(200);

    if (!currentDb) throw new Error('db gone');
    const revRows = await currentDb.db
      .select()
      .from(revocations)
      .where(
        and(eq(revocations.tenantId, tenantId), eq(revocations.subjectId, 'conn-reason')),
      );
    expect(revRows[0]?.reason).toBe('suspicious activity');
  });
});
