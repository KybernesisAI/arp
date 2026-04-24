/**
 * Dashboard health + activity unit tests — slice 10c.
 *
 * Exercises the pure helpers exported from `app/dashboard/page.tsx` plus the
 * TenantDb helpers that feed them (`getAgentActivitySummary`,
 * `listRecentActivity`). We do not render the server component itself; that
 * layer is thin glue over these primitives + already covered by the
 * middleware + route tests elsewhere.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createPgliteDb,
  tenants,
  toTenantId,
  withTenant,
  type CloudDbClient,
} from '@kybernesis/arp-cloud-db';
import { formatAgo, normalizeDecision } from '../app/dashboard/page';

async function seedTenant(db: CloudDbClient, principalDid: string): Promise<string> {
  const rows = await db
    .insert(tenants)
    .values({ principalDid, plan: 'free', status: 'active' })
    .returning({ id: tenants.id });
  const row = rows[0];
  if (!row) throw new Error('seed insert returned no row');
  return row.id;
}

describe('dashboard helpers — formatAgo', () => {
  const base = new Date('2026-04-25T12:00:00Z');

  it('formats sub-minute deltas in seconds', () => {
    expect(formatAgo(base, new Date(base.getTime() - 5000))).toBe('5s ago');
  });
  it('formats sub-hour deltas in minutes', () => {
    expect(formatAgo(base, new Date(base.getTime() - 4 * 60_000))).toBe('4m ago');
  });
  it('formats sub-day deltas in hours', () => {
    expect(formatAgo(base, new Date(base.getTime() - 3 * 3_600_000))).toBe('3h ago');
  });
  it('formats sub-month deltas in days', () => {
    expect(formatAgo(base, new Date(base.getTime() - 5 * 86_400_000))).toBe('5d ago');
  });
  it('clamps negative deltas to zero', () => {
    expect(formatAgo(base, new Date(base.getTime() + 5000))).toBe('0s ago');
  });
});

describe('dashboard helpers — normalizeDecision', () => {
  it('maps known decisions', () => {
    expect(normalizeDecision('allow')).toBe('allow');
    expect(normalizeDecision('ALLOW')).toBe('allow');
    expect(normalizeDecision('deny')).toBe('deny');
    expect(normalizeDecision('revoke')).toBe('revoke');
    expect(normalizeDecision('revoked')).toBe('revoke');
  });
  it('falls back to other', () => {
    expect(normalizeDecision('pending')).toBe('other');
    expect(normalizeDecision('')).toBe('other');
  });
});

describe('dashboard helpers — per-agent health buckets via TenantDb', () => {
  let built: { db: CloudDbClient; close: () => Promise<void> };
  let tenantId: string;

  beforeEach(async () => {
    built = await createPgliteDb();
    tenantId = await seedTenant(built.db, 'did:web:ian.example.agent');
  });

  afterEach(async () => {
    await built.close();
  });

  async function registerAgent(did: string, name: string): Promise<void> {
    const ctx = withTenant(built.db, toTenantId(tenantId));
    await ctx.createAgent({
      did,
      principalDid: 'did:web:ian.example.agent',
      agentName: name,
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

  async function addAudit(
    agentDid: string,
    connectionId: string,
    msgId: string,
    seq: number,
    timestamp: string,
  ): Promise<void> {
    const ctx = withTenant(built.db, toTenantId(tenantId));
    await ctx.appendAudit(
      agentDid,
      {
        connectionId,
        msgId,
        decision: 'allow',
        obligations: [],
        policiesFired: ['P1'],
        timestamp,
      },
      {
        prevHash: 'sha256:' + `${seq}`.padStart(64, '0'),
        selfHash: 'sha256:' + `${seq + 1}`.padStart(64, '0'),
        seq,
      },
    );
  }

  it('classifies active (<5m), idle (5m–24h), inactive (>24h or never)', async () => {
    await Promise.all([
      registerAgent('did:web:active.agent', 'Active'),
      registerAgent('did:web:idle.agent', 'Idle'),
      registerAgent('did:web:stale.agent', 'Stale'),
      registerAgent('did:web:never.agent', 'Never'),
    ]);
    const now = new Date('2026-04-25T12:00:00Z');
    await addAudit('did:web:active.agent', 'c1', 'm-active', 0, new Date(now.getTime() - 60_000).toISOString());
    await addAudit('did:web:idle.agent', 'c2', 'm-idle', 1, new Date(now.getTime() - 2 * 3_600_000).toISOString());
    await addAudit('did:web:stale.agent', 'c3', 'm-stale', 2, new Date(now.getTime() - 48 * 3_600_000).toISOString());

    const ctx = withTenant(built.db, toTenantId(tenantId));
    const summary = await ctx.getAgentActivitySummary();
    const byDid = new Map(summary.map((s) => [s.agentDid, s]));
    expect(byDid.size).toBe(4);

    const ACTIVE = 5 * 60 * 1000;
    const IDLE = 24 * 60 * 60 * 1000;
    function bucket(last: Date | null): string {
      if (!last) return 'inactive';
      const d = now.getTime() - last.getTime();
      if (d <= ACTIVE) return 'active';
      if (d <= IDLE) return 'idle';
      return 'inactive';
    }
    expect(bucket(byDid.get('did:web:active.agent')!.lastAuditAt)).toBe('active');
    expect(bucket(byDid.get('did:web:idle.agent')!.lastAuditAt)).toBe('idle');
    expect(bucket(byDid.get('did:web:stale.agent')!.lastAuditAt)).toBe('inactive');
    expect(bucket(byDid.get('did:web:never.agent')!.lastAuditAt)).toBe('inactive');
    expect(byDid.get('did:web:never.agent')!.lastAuditAt).toBeNull();
  });

  it('reports zero active connections when everything is revoked', async () => {
    await registerAgent('did:web:conn.agent', 'Conn');
    const ctx = withTenant(built.db, toTenantId(tenantId));
    await ctx.createConnection({
      connectionId: 'only-conn',
      agentDid: 'did:web:conn.agent',
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
    await ctx.updateConnectionStatus('only-conn', 'revoked', 'owner');
    const summary = await ctx.getAgentActivitySummary();
    expect(summary).toHaveLength(1);
    expect(summary[0]?.activeConnections).toBe(0);
  });

  it('listRecentActivity returns entries ordered newest first across agents', async () => {
    await Promise.all([
      registerAgent('did:web:one.agent', 'One'),
      registerAgent('did:web:two.agent', 'Two'),
    ]);
    await addAudit('did:web:one.agent', 'c1', 'older', 0, '2026-04-20T00:00:00Z');
    await addAudit('did:web:two.agent', 'c2', 'newest', 1, '2026-04-24T00:00:00Z');
    await addAudit('did:web:one.agent', 'c1', 'middle', 2, '2026-04-22T00:00:00Z');
    const ctx = withTenant(built.db, toTenantId(tenantId));
    const recent = await ctx.listRecentActivity(10);
    expect(recent.map((r) => r.msgId)).toEqual(['newest', 'middle', 'older']);
  });
});
