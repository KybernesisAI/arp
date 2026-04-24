/**
 * GET /api/connections/:id/audit — slice 10b.
 *
 * Scenarios:
 *   1. 401 without a session
 *   2. 404 for another tenant's connection
 *   3. Tenant-scoping: connection A's audit doesn't leak into connection B
 *   4. direction=inbound filter
 *   5. decision=deny filter
 *   6. Cursor pagination round-trip (page 1 + cursor → page 2 disjoint)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import canonicalizeFn from 'canonicalize';
import { createHash } from 'node:crypto';
import {
  auditEntries,
  createPgliteDb,
  messages,
  tenants,
  toTenantId,
  withTenant,
  type CloudDbClient,
} from '@kybernesis/arp-cloud-db';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';

const canonicalize = canonicalizeFn as (value: unknown) => string;
const HASH_PREFIX = 'sha256:';
const GENESIS_PREV_HASH = `${HASH_PREFIX}${'00'.repeat(32)}`;

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

const { GET } = await import('../app/api/connections/[id]/audit/route');

interface AuditResponse {
  entries: Array<{
    id: string;
    seq: number;
    msgId: string;
    direction: string;
    decision: string;
    reason: string | null;
    timestamp: string;
  }>;
  nextCursor: string | null;
}

async function makeRequest(
  id: string,
  search: Record<string, string> = {},
): Promise<Response> {
  const url = new URL(`https://cloud.arp.run/api/connections/${encodeURIComponent(id)}/audit`);
  for (const [k, v] of Object.entries(search)) url.searchParams.set(k, v);
  return GET(new Request(url, { method: 'GET' }), {
    params: Promise.resolve({ id }),
  });
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

/** Append a hash-chained audit entry for the given (tenant, agent, conn). */
async function seedAudit(
  tenantId: string,
  agentDid: string,
  connectionId: string,
  opts: {
    msgId: string;
    decision: 'allow' | 'deny' | 'revoke';
    reason?: string;
    timestampMs?: number;
  },
): Promise<void> {
  if (!currentDb) throw new Error('db gone');
  const tenantDb = withTenant(currentDb.db, toTenantId(tenantId));
  const latest = await tenantDb.latestAudit(agentDid, connectionId);
  const seq = latest ? latest.seq + 1 : 0;
  const prevHash = latest ? latest.selfHash : GENESIS_PREV_HASH;
  const timestamp = new Date(opts.timestampMs ?? Date.now()).toISOString();
  const base = {
    seq,
    timestamp,
    msg_id: opts.msgId,
    decision: opts.decision,
    policies_fired: [] as string[],
    obligations: [] as unknown[],
    spend_delta_cents: 0,
    reason: opts.reason ?? null,
    prev_hash: prevHash,
  };
  const selfHash = `${HASH_PREFIX}${createHash('sha256')
    .update(canonicalize(base))
    .digest('hex')}`;
  await tenantDb.appendAudit(
    agentDid,
    {
      connectionId,
      msgId: opts.msgId,
      decision: opts.decision,
      obligations: [],
      policiesFired: [],
      timestamp,
      ...(opts.reason ? { reason: opts.reason } : {}),
      spendDeltaCents: 0,
    },
    { prevHash, selfHash, seq },
  );
}

/** Seed a message row for direction-filter tests. */
async function seedMessage(
  tenantId: string,
  agentDid: string,
  connectionId: string,
  msgId: string,
  direction: 'in' | 'out',
): Promise<void> {
  if (!currentDb) throw new Error('db gone');
  const tenantDb = withTenant(currentDb.db, toTenantId(tenantId));
  await tenantDb.enqueueMessage({
    agentDid,
    connectionId,
    direction,
    msgId,
    msgType: 'test/v1',
    envelopeJws: '',
    body: null,
    peerDid: null,
    expiresAt: new Date(Date.now() + 3600_000),
  });
}

describe('GET /api/connections/:id/audit', () => {
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

  it('404 for another tenant connection', async () => {
    const pA = 'did:key:z6MkAAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const pB = 'did:key:z6MkBBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const tenantA = await seedTenant(pA);
    const tenantB = await seedTenant(pB);
    await seedAgent(tenantB, 'did:web:bravo.agent', pB);
    await seedConnection(tenantB, 'shared-id', 'did:web:bravo.agent', 'did:web:peer.agent');
    sessionOverride = { principalDid: pA, tenantId: tenantA };
    const res = await makeRequest('shared-id');
    expect(res.status).toBe(404);
  });

  it('tenant-scoping: connection A entries do not leak into connection B query', async () => {
    const p = 'did:key:z6MkSSccccccccccccccccccccccccccccccccccccccc';
    const tenantId = await seedTenant(p);
    await seedAgent(tenantId, 'did:web:alpha.agent', p);
    await seedConnection(tenantId, 'conn-a', 'did:web:alpha.agent', 'did:web:peer-a.agent');
    await seedConnection(tenantId, 'conn-b', 'did:web:alpha.agent', 'did:web:peer-b.agent');
    await seedAudit(tenantId, 'did:web:alpha.agent', 'conn-a', {
      msgId: 'msg-a-1',
      decision: 'allow',
    });
    await seedAudit(tenantId, 'did:web:alpha.agent', 'conn-b', {
      msgId: 'msg-b-1',
      decision: 'deny',
      reason: 'test',
    });

    sessionOverride = { principalDid: p, tenantId };
    const resB = await makeRequest('conn-b');
    const bodyB = (await resB.json()) as AuditResponse;
    expect(bodyB.entries).toHaveLength(1);
    expect(bodyB.entries[0]?.msgId).toBe('msg-b-1');
  });

  it('direction=inbound filter returns only entries whose msg_id is an inbound message', async () => {
    const p = 'did:key:z6MkDIRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR';
    const tenantId = await seedTenant(p);
    await seedAgent(tenantId, 'did:web:alpha.agent', p);
    await seedConnection(tenantId, 'conn-1', 'did:web:alpha.agent', 'did:web:peer.agent');
    // Two messages — one in, one out.
    await seedMessage(tenantId, 'did:web:alpha.agent', 'conn-1', 'msg-in-1', 'in');
    await seedMessage(tenantId, 'did:web:alpha.agent', 'conn-1', 'msg-out-1', 'out');
    // Three audit entries: the two above + one local (revoke).
    await seedAudit(tenantId, 'did:web:alpha.agent', 'conn-1', {
      msgId: 'msg-in-1',
      decision: 'allow',
      timestampMs: Date.now() - 3000,
    });
    await seedAudit(tenantId, 'did:web:alpha.agent', 'conn-1', {
      msgId: 'msg-out-1',
      decision: 'allow',
      timestampMs: Date.now() - 2000,
    });
    await seedAudit(tenantId, 'did:web:alpha.agent', 'conn-1', {
      msgId: 'revoke-local',
      decision: 'revoke',
      reason: 'owner_revoked',
      timestampMs: Date.now() - 1000,
    });

    sessionOverride = { principalDid: p, tenantId };
    const res = await makeRequest('conn-1', { direction: 'inbound' });
    const body = (await res.json()) as AuditResponse;
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]?.msgId).toBe('msg-in-1');
    expect(body.entries[0]?.direction).toBe('inbound');
  });

  it('decision=deny filter returns only deny entries', async () => {
    const p = 'did:key:z6MkDNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN';
    const tenantId = await seedTenant(p);
    await seedAgent(tenantId, 'did:web:alpha.agent', p);
    await seedConnection(tenantId, 'conn-d', 'did:web:alpha.agent', 'did:web:peer.agent');
    await seedAudit(tenantId, 'did:web:alpha.agent', 'conn-d', {
      msgId: 'm1',
      decision: 'allow',
    });
    await seedAudit(tenantId, 'did:web:alpha.agent', 'conn-d', {
      msgId: 'm2',
      decision: 'deny',
      reason: 'policy_blocked',
    });
    await seedAudit(tenantId, 'did:web:alpha.agent', 'conn-d', {
      msgId: 'm3',
      decision: 'allow',
    });

    sessionOverride = { principalDid: p, tenantId };
    const res = await makeRequest('conn-d', { decision: 'deny' });
    const body = (await res.json()) as AuditResponse;
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]?.decision).toBe('deny');
    expect(body.entries[0]?.reason).toBe('policy_blocked');
  });

  it('cursor pagination returns a disjoint second page', async () => {
    const p = 'did:key:z6MkPAGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG';
    const tenantId = await seedTenant(p);
    await seedAgent(tenantId, 'did:web:alpha.agent', p);
    await seedConnection(tenantId, 'conn-p', 'did:web:alpha.agent', 'did:web:peer.agent');
    for (let i = 0; i < 5; i++) {
      await seedAudit(tenantId, 'did:web:alpha.agent', 'conn-p', {
        msgId: `m-${i}`,
        decision: 'allow',
        timestampMs: Date.now() + i * 1000,
      });
    }

    sessionOverride = { principalDid: p, tenantId };
    const page1 = (await (await makeRequest('conn-p', { limit: '2' })).json()) as AuditResponse;
    expect(page1.entries).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = (await (
      await makeRequest('conn-p', { limit: '2', cursor: page1.nextCursor! })
    ).json()) as AuditResponse;
    expect(page2.entries).toHaveLength(2);
    const p3 = (await (
      await makeRequest('conn-p', { limit: '2', cursor: page2.nextCursor! })
    ).json()) as AuditResponse;
    expect(p3.entries).toHaveLength(1);
    expect(p3.nextCursor).toBeNull();

    const ids = [
      ...page1.entries.map((e) => e.msgId),
      ...page2.entries.map((e) => e.msgId),
      ...p3.entries.map((e) => e.msgId),
    ];
    expect(new Set(ids).size).toBe(5);
  });
});

// Silence lint for unused imports in this stub.
void auditEntries;
void messages;
