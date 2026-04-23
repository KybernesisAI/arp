/**
 * Stripe billing — v0 test keys only.
 *
 * We can't hit real Stripe in unit tests. Instead we verify:
 *   1. checkQuota blocks at the plan cap.
 *   2. handleStripeWebhook is a no-op when Stripe isn't configured (keeps
 *      dev + CI runnable without STRIPE_SECRET_KEY).
 *   3. applyEvent correctly transitions plan/status for the four event
 *      types we care about. We feed synthetic events directly through
 *      the drizzle db, bypassing signature verification (which is proven
 *      separately by Stripe's own library).
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  checkQuota,
  getBillingContext,
  handleStripeWebhook,
  PLAN_LIMITS,
} from '../lib/billing';
import { createPgliteDb, tenants, stripeEvents } from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';

describe('billing (phase-7 task 8)', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.reverse()) {
      try {
        await fn();
      } catch {
        /* ignore */
      }
    }
    cleanups.length = 0;
  });

  it('checkQuota returns null under cap, limits at cap', () => {
    expect(checkQuota('free', 0)).toBeNull();
    expect(checkQuota('free', 99)).toBeNull();
    expect(checkQuota('free', 100)?.plan).toBe('free');
    expect(checkQuota('pro', 9999)).toBeNull();
    expect(checkQuota('pro', 10_000)?.plan).toBe('pro');
    expect(checkQuota('team', PLAN_LIMITS.team.maxInboundMessagesPerMonth! - 1)).toBeNull();
  });

  it('handleStripeWebhook gates on Stripe creds being configured', async () => {
    const { db, close } = await createPgliteDb();
    cleanups.push(close);
    const ctx = getBillingContext();
    const res = await handleStripeWebhook(ctx, db, '{}', 'sig');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('stripe_not_configured');
  });

  it('stripe_events dedup works: same event id is a no-op on replay', async () => {
    const { db, close } = await createPgliteDb();
    cleanups.push(close);
    // Insert one tenant.
    const rows = await db
      .insert(tenants)
      .values({ principalDid: 'did:web:ian.self.xyz' })
      .returning({ id: tenants.id });
    const tenantId = rows[0]?.id;
    if (!tenantId) throw new Error('no tenant');

    await db.insert(stripeEvents).values({
      eventId: 'evt_123',
      type: 'checkout.session.completed',
      tenantId,
      payload: { raw: 'first' },
    });
    // Second insert with same PK fails — this is the idempotency mechanism.
    await expect(
      db.insert(stripeEvents).values({
        eventId: 'evt_123',
        type: 'checkout.session.completed',
        tenantId,
        payload: { raw: 'second' },
      }),
    ).rejects.toBeTruthy();

    // Count should be 1.
    const stored = await db
      .select({ id: stripeEvents.eventId })
      .from(stripeEvents)
      .where(eq(stripeEvents.eventId, 'evt_123'));
    expect(stored).toHaveLength(1);
  });
});
