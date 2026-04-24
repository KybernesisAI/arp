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
});
