/**
 * Unit-level tenant isolation test.
 *
 * Provisions 3 tenants in a fresh PGlite instance, exercises every public
 * method on `TenantDb`, and asserts zero cross-tenant leakage. The bigger
 * adversarial pass (5 tenants × every HTTP endpoint) lives in
 * tests/phase-7/multi-tenant-isolation.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPgliteDb, toTenantId, withTenant, tenants } from '../src/index.js';
import type { CloudDbClient } from '../src/db.js';

async function seedTenant(
  client: CloudDbClient,
  principalDid: string,
): Promise<string> {
  const rows = await client
    .insert(tenants)
    .values({ principalDid })
    .returning({ id: tenants.id });
  const row = rows[0];
  if (!row) throw new Error('seed insert returned no row');
  return row.id;
}

describe('tenant-db isolation', () => {
  let db: CloudDbClient;
  let close: (() => Promise<void>) | null = null;
  let t1: string;
  let t2: string;

  beforeEach(async () => {
    const built = await createPgliteDb();
    db = built.db;
    close = built.close;
    t1 = await seedTenant(db, 'did:web:ian.example.agent');
    t2 = await seedTenant(db, 'did:web:nick.example.agent');
    await seedTenant(db, 'did:web:alice.example.agent');
  });

  afterEach(async () => {
    if (close) await close();
    close = null;
  });

  it('agents scoped by tenant', async () => {
    const ctx1 = withTenant(db, toTenantId(t1));
    const ctx2 = withTenant(db, toTenantId(t2));

    const agent1 = await ctx1.createAgent({
      did: 'did:web:samantha.agent',
      principalDid: 'did:web:ian.example.agent',
      agentName: 'Samantha',
      agentDescription: 'ians agent',
      publicKeyMultibase: 'z6Mk1',
      handoffJson: {},
      wellKnownDid: {},
      wellKnownAgentCard: {},
      wellKnownArp: {},
      scopeCatalogVersion: 'v1',
      tlsFingerprint: 'stub',
    });
    expect(agent1.did).toBe('did:web:samantha.agent');

    // Same DID under tenant 2 must not be visible.
    const fromT2 = await ctx2.getAgent('did:web:samantha.agent');
    expect(fromT2).toBeNull();

    const list2 = await ctx2.listAgents();
    expect(list2).toHaveLength(0);

    // Update through tenant 2 is a no-op.
    await ctx2.updateAgent('did:web:samantha.agent', { lastSeenAt: new Date() });
    const agent1Fresh = await ctx1.getAgent('did:web:samantha.agent');
    expect(agent1Fresh?.lastSeenAt).toBeNull();

    // Delete through tenant 2 is a no-op.
    await ctx2.deleteAgent('did:web:samantha.agent');
    const stillThere = await ctx1.getAgent('did:web:samantha.agent');
    expect(stillThere).not.toBeNull();
  });

  it('connections + audit + revocations isolated', async () => {
    const ctx1 = withTenant(db, toTenantId(t1));
    const ctx2 = withTenant(db, toTenantId(t2));

    await ctx1.createAgent({
      did: 'did:web:samantha.agent',
      principalDid: 'did:web:ian.example.agent',
      agentName: 'Samantha',
      agentDescription: '',
      publicKeyMultibase: 'z6Mk1',
      handoffJson: {},
      wellKnownDid: {},
      wellKnownAgentCard: {},
      wellKnownArp: {},
      scopeCatalogVersion: 'v1',
      tlsFingerprint: 'stub',
    });
    await ctx1.createConnection({
      connectionId: 'conn-1',
      agentDid: 'did:web:samantha.agent',
      peerDid: 'did:web:ghost.agent',
      label: null,
      purpose: null,
      tokenJws: '{}',
      tokenJson: {},
      cedarPolicies: [],
      obligations: [],
      scopeCatalogVersion: 'v1',
      metadata: null,
      expiresAt: null,
    });

    // Tenant 2 cannot read connection.
    expect(await ctx2.getConnection('conn-1')).toBeNull();
    expect(await ctx2.listConnections()).toHaveLength(0);

    // Tenant 2's status update is a no-op.
    await ctx2.updateConnectionStatus('conn-1', 'revoked', 'forged');
    const fresh = await ctx1.getConnection('conn-1');
    expect(fresh?.status).toBe('active');

    // Audit insert through tenant 1 visible only to tenant 1.
    await ctx1.appendAudit(
      'did:web:samantha.agent',
      {
        connectionId: 'conn-1',
        msgId: 'msg-1',
        decision: 'allow',
        obligations: [],
        policiesFired: ['P1'],
        timestamp: new Date().toISOString(),
      },
      { prevHash: 'sha256:' + '0'.repeat(64), selfHash: 'sha256:' + '1'.repeat(64), seq: 0 },
    );
    const list1 = await ctx1.listAudit('did:web:samantha.agent', 'conn-1');
    expect(list1).toHaveLength(1);
    const list2 = await ctx2.listAudit('did:web:samantha.agent', 'conn-1');
    expect(list2).toHaveLength(0);

    // Revocations scoped by tenant.
    await ctx1.addRevocation('did:web:samantha.agent', 'connection', 'conn-1', 'owner');
    expect(await ctx1.isRevoked('did:web:samantha.agent', 'connection', 'conn-1')).toBe(true);
    expect(await ctx2.isRevoked('did:web:samantha.agent', 'connection', 'conn-1')).toBe(false);
  });

  it('messages enqueue + claim isolated', async () => {
    const ctx1 = withTenant(db, toTenantId(t1));
    const ctx2 = withTenant(db, toTenantId(t2));
    await ctx1.createAgent({
      did: 'did:web:s1.agent',
      principalDid: 'did:web:ian.example.agent',
      agentName: 's1',
      agentDescription: '',
      publicKeyMultibase: 'z',
      handoffJson: {},
      wellKnownDid: {},
      wellKnownAgentCard: {},
      wellKnownArp: {},
      scopeCatalogVersion: 'v1',
      tlsFingerprint: 'stub',
    });
    await ctx1.enqueueMessage({
      agentDid: 'did:web:s1.agent',
      connectionId: null,
      direction: 'in',
      msgId: 'm1',
      msgType: 'test/ping',
      envelopeJws: 'abc',
      body: { hi: true },
      peerDid: null,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const claimed1 = await ctx1.claimQueuedMessages('did:web:s1.agent');
    expect(claimed1).toHaveLength(1);
    const claimed2 = await ctx2.claimQueuedMessages('did:web:s1.agent');
    expect(claimed2).toHaveLength(0);
  });

  it('usage counters scoped', async () => {
    const ctx1 = withTenant(db, toTenantId(t1));
    const ctx2 = withTenant(db, toTenantId(t2));
    await ctx1.incrementUsage('2026-04', { inbound: 50 });
    await ctx1.incrementUsage('2026-04', { inbound: 10 });
    const u1 = await ctx1.getUsage('2026-04');
    expect(u1?.inboundMessages).toBe(60);
    expect(await ctx2.getUsage('2026-04')).toBeNull();
  });

  it('tenantId is read-only on TenantDb', () => {
    const ctx = withTenant(db, toTenantId(t1));
    expect(() => {
      (ctx as unknown as { tenantId: string }).tenantId = t2;
    }).toThrow();
  });

  it('toTenantId refuses empty input', () => {
    expect(() => toTenantId('')).toThrow();
    // @ts-expect-error intentional invalid input
    expect(() => toTenantId(null)).toThrow();
  });

  it('getAgentActivitySummary aggregates per-agent health', async () => {
    const ctx1 = withTenant(db, toTenantId(t1));
    const ctx2 = withTenant(db, toTenantId(t2));

    // Tenant 1 has two agents.
    for (const did of ['did:web:a.agent', 'did:web:b.agent']) {
      await ctx1.createAgent({
        did,
        principalDid: 'did:web:ian.example.agent',
        agentName: did,
        agentDescription: '',
        publicKeyMultibase: 'z',
        handoffJson: {},
        wellKnownDid: {},
        wellKnownAgentCard: {},
        wellKnownArp: {},
        scopeCatalogVersion: 'v1',
        tlsFingerprint: 'stub',
      });
    }

    // Agent A: two active + one revoked connection + 2 audit entries.
    for (const [cid, status] of [
      ['conn-a1', 'active'],
      ['conn-a2', 'active'],
      ['conn-a3', 'active'],
    ] as const) {
      await ctx1.createConnection({
        connectionId: cid,
        agentDid: 'did:web:a.agent',
        peerDid: 'did:web:peer.agent',
        label: null,
        purpose: null,
        tokenJws: '{}',
        tokenJson: {},
        cedarPolicies: [],
        obligations: [],
        scopeCatalogVersion: 'v1',
        metadata: null,
        expiresAt: null,
        status,
      });
    }
    await ctx1.updateConnectionStatus('conn-a3', 'revoked', 'owner');

    const olderTs = new Date('2026-04-01T00:00:00Z').toISOString();
    const newerTs = new Date('2026-04-10T00:00:00Z').toISOString();
    await ctx1.appendAudit(
      'did:web:a.agent',
      {
        connectionId: 'conn-a1',
        msgId: 'old-a',
        decision: 'allow',
        obligations: [],
        policiesFired: ['P1'],
        timestamp: olderTs,
      },
      { prevHash: 'sha256:' + '0'.repeat(64), selfHash: 'sha256:' + '1'.repeat(64), seq: 0 },
    );
    await ctx1.appendAudit(
      'did:web:a.agent',
      {
        connectionId: 'conn-a1',
        msgId: 'latest-a',
        decision: 'allow',
        obligations: [],
        policiesFired: ['P1'],
        timestamp: newerTs,
      },
      { prevHash: 'sha256:' + '1'.repeat(64), selfHash: 'sha256:' + '2'.repeat(64), seq: 1 },
    );

    // Agent B: no connections, no audit — should land in "never active" bucket.

    // Tenant 2 provisions an agent + active connection that MUST NOT leak.
    await ctx2.createAgent({
      did: 'did:web:leak.agent',
      principalDid: 'did:web:nick.example.agent',
      agentName: 'Leak',
      agentDescription: '',
      publicKeyMultibase: 'z',
      handoffJson: {},
      wellKnownDid: {},
      wellKnownAgentCard: {},
      wellKnownArp: {},
      scopeCatalogVersion: 'v1',
      tlsFingerprint: 'stub',
    });
    await ctx2.createConnection({
      connectionId: 'leak-conn',
      agentDid: 'did:web:leak.agent',
      peerDid: 'did:web:peer.agent',
      label: null,
      purpose: null,
      tokenJws: '{}',
      tokenJson: {},
      cedarPolicies: [],
      obligations: [],
      scopeCatalogVersion: 'v1',
      metadata: null,
      expiresAt: null,
    });

    const summary = await ctx1.getAgentActivitySummary();
    expect(summary).toHaveLength(2);
    const byDid = new Map(summary.map((s) => [s.agentDid, s]));
    const a = byDid.get('did:web:a.agent')!;
    expect(a.activeConnections).toBe(2); // conn-a3 is revoked, excluded
    expect(a.lastAuditMsgId).toBe('latest-a');
    expect(a.lastAuditAt?.toISOString()).toBe(newerTs);
    const b = byDid.get('did:web:b.agent')!;
    expect(b.activeConnections).toBe(0);
    expect(b.lastAuditAt).toBeNull();
    expect(b.lastAuditMsgId).toBeNull();

    // Tenant 2 sees only its own agent.
    const t2Summary = await ctx2.getAgentActivitySummary();
    expect(t2Summary).toHaveLength(1);
    expect(t2Summary[0]?.agentDid).toBe('did:web:leak.agent');
    expect(t2Summary[0]?.activeConnections).toBe(1);
  });

  it('listRecentActivity returns tenant-scoped audit rows desc', async () => {
    const ctx1 = withTenant(db, toTenantId(t1));
    const ctx2 = withTenant(db, toTenantId(t2));

    await ctx1.createAgent({
      did: 'did:web:act.agent',
      principalDid: 'did:web:ian.example.agent',
      agentName: 'Act',
      agentDescription: '',
      publicKeyMultibase: 'z',
      handoffJson: {},
      wellKnownDid: {},
      wellKnownAgentCard: {},
      wellKnownArp: {},
      scopeCatalogVersion: 'v1',
      tlsFingerprint: 'stub',
    });

    const stamps = [
      '2026-04-05T00:00:00Z',
      '2026-04-06T00:00:00Z',
      '2026-04-07T00:00:00Z',
    ];
    for (let i = 0; i < stamps.length; i++) {
      const ts = stamps[i]!;
      await ctx1.appendAudit(
        'did:web:act.agent',
        {
          connectionId: 'conn-x',
          msgId: `msg-${i}`,
          decision: 'allow',
          obligations: [],
          policiesFired: ['P1'],
          timestamp: ts,
        },
        {
          prevHash: 'sha256:' + `${i}`.padStart(64, '0'),
          selfHash: 'sha256:' + `${i + 1}`.padStart(64, '0'),
          seq: i,
        },
      );
    }

    const recent = await ctx1.listRecentActivity(10);
    expect(recent).toHaveLength(3);
    // Newest first.
    expect(recent[0]?.msgId).toBe('msg-2');
    expect(recent[2]?.msgId).toBe('msg-0');

    // Respect limit.
    const recentOne = await ctx1.listRecentActivity(1);
    expect(recentOne).toHaveLength(1);
    expect(recentOne[0]?.msgId).toBe('msg-2');

    // Tenant 2 sees nothing.
    const other = await ctx2.listRecentActivity(10);
    expect(other).toHaveLength(0);
  });
});
