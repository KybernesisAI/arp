/**
 * Phase-10 billing: inbound message quota enforcement at dispatch time.
 *
 * Verifies:
 *   1. Under-cap traffic is allowed and increments the usage counter.
 *   2. Once the tenant's plan cap is reached, further inbound messages
 *      are denied with reason 'quota_exceeded' and the counter does NOT
 *      double-count (the dispatch path skips incrementUsage on deny).
 *   3. The audit chain records the denial with a 'quota_exceeded' reason
 *      so over-cap traffic stays visible.
 *
 * The gate sits between PDP allow and message enqueue, so this test
 * uses the basic-permit policy from the harness — i.e. the deny we
 * observe is purely from the quota check.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { dispatchInbound, currentUsagePeriod } from '../src/dispatch.js';
import { tenants } from '@kybernesis/arp-cloud-db';
import { createTestHarness, type TestHarness } from './helpers.js';

describe('inbound quota gate (phase-10 billing)', () => {
  let h: TestHarness;

  beforeEach(async () => {
    h = await createTestHarness();
    await h.createActiveConnection('conn_quota');
  });

  afterEach(async () => {
    await h.closeDb();
  });

  function ctx(now?: number) {
    return {
      tenantDb: h.tenantDb,
      tenantId: h.tenantId,
      agentDid: h.agentDid,
      audit: h.audit,
      pdp: h.pdp,
      resolver: h.resolver,
      sessions: h.sessions,
      logger: h.logger,
      metrics: h.metrics,
      now: now !== undefined ? () => now : () => Date.now(),
    };
  }

  it('allows under-cap traffic and increments inbound counter', async () => {
    const env = await h.signFromPeer({
      id: 'msg-under-cap',
      type: 'https://didcomm.org/arp/1.0/request',
      from: h.peerDid,
      to: [h.agentDid],
      body: { connection_id: 'conn_quota', action: 'ping' },
    });
    const result = await dispatchInbound(ctx(), env);
    expect(result.ok).toBe(true);
    expect(result.decision).toBe('allow');

    const period = currentUsagePeriod(Date.now());
    const usage = await h.tenantDb.getUsage(period);
    expect(usage?.inboundMessages).toBe(1);
  });

  it('denies inbound once the free-tier cap is reached and does NOT increment', async () => {
    // Pre-seed usage to the cap. Free tier = 1,000 inbound msgs/mo
    // (see PLAN_LIMITS.free in @kybernesis/arp-cloud-db/types).
    const period = currentUsagePeriod(Date.now());
    await h.tenantDb.incrementUsage(period, { inbound: 1_000 });

    const env = await h.signFromPeer({
      id: 'msg-over-cap',
      type: 'https://didcomm.org/arp/1.0/request',
      from: h.peerDid,
      to: [h.agentDid],
      body: { connection_id: 'conn_quota', action: 'ping' },
    });
    const result = await dispatchInbound(ctx(), env);
    expect(result.ok).toBe(true);
    expect(result.decision).toBe('deny');
    expect(result.reason).toBe('quota_exceeded');

    // Counter unchanged — denied messages are NOT billed.
    const usage = await h.tenantDb.getUsage(period);
    expect(usage?.inboundMessages).toBe(1_000);

    // No envelope persisted.
    const queued = await h.tenantDb.claimQueuedMessages(h.agentDid);
    expect(queued).toHaveLength(0);
  });

  it('records the quota denial in the audit chain', async () => {
    const period = currentUsagePeriod(Date.now());
    await h.tenantDb.incrementUsage(period, { inbound: 1_000 });
    const env = await h.signFromPeer({
      id: 'msg-audit-quota',
      type: 'https://didcomm.org/arp/1.0/request',
      from: h.peerDid,
      to: [h.agentDid],
      body: { connection_id: 'conn_quota', action: 'ping' },
    });
    await dispatchInbound(ctx(), env);
    const latest = await h.tenantDb.latestAudit(h.agentDid, 'conn_quota');
    expect(latest?.decision).toBe('deny');
    expect(latest?.reason).toMatch(/quota_exceeded:free:1000\/1000/);
  });

  it('uses Pro tier 10_000 cap when tenant.plan === "pro"', async () => {
    // Switch the tenant to Pro plan.
    await h.tenantDb.raw
      .update(tenants)
      .set({ plan: 'pro' })
      .where(eq(tenants.id, h.tenantId));

    const period = currentUsagePeriod(Date.now());
    // Just under the Pro cap (10_000) — should still allow.
    await h.tenantDb.incrementUsage(period, { inbound: 9_999 });
    const env = await h.signFromPeer({
      id: 'msg-pro-just-under',
      type: 'https://didcomm.org/arp/1.0/request',
      from: h.peerDid,
      to: [h.agentDid],
      body: { connection_id: 'conn_quota', action: 'ping' },
    });
    const result = await dispatchInbound(ctx(), env);
    expect(result.decision).toBe('allow');

    // Now at the cap — next message should be denied.
    const env2 = await h.signFromPeer({
      id: 'msg-pro-at-cap',
      type: 'https://didcomm.org/arp/1.0/request',
      from: h.peerDid,
      to: [h.agentDid],
      body: { connection_id: 'conn_quota', action: 'ping' },
    });
    const result2 = await dispatchInbound(ctx(), env2);
    expect(result2.decision).toBe('deny');
    expect(result2.reason).toBe('quota_exceeded');
  });
});
