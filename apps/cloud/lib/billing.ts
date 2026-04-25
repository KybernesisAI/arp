/**
 * Stripe billing helpers — Phase-7 Task 8.
 *
 * Test keys only in v0 (see phase brief rule #3). Production flip lands
 * at Phase 9. All Stripe API calls gate on env().STRIPE_SECRET_KEY being
 * set; when unset (dev w/o stripe creds) the helpers stub out so the
 * app remains runnable.
 *
 * Webhook dedup: every Stripe event id is written to `stripe_events`
 * inside the same transaction that updates the tenant row. The primary
 * key conflict makes replays safe.
 */

import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import {
  PLAN_LIMITS,
  tenants,
  stripeEvents,
  type CloudDbClient,
  type PlanLimits,
} from '@kybernesis/arp-cloud-db';
import { env } from './env';

export type Plan = PlanLimits['plan'];

export interface BillingContext {
  /** null when STRIPE_SECRET_KEY isn't configured; caller should gate UI. */
  stripe: Stripe | null;
  webhookSecret: string | null;
  priceIds: Record<'pro' | 'team', string | null>;
}

export function getBillingContext(): BillingContext {
  const e = env();
  const stripe = e.STRIPE_SECRET_KEY
    ? new Stripe(e.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion })
    : null;
  return {
    stripe,
    webhookSecret: e.STRIPE_WEBHOOK_SECRET,
    priceIds: { pro: e.STRIPE_PRICE_PRO, team: e.STRIPE_PRICE_TEAM },
  };
}

export interface CreateCheckoutInput {
  tenantId: string;
  principalDid: string;
  plan: 'pro' | 'team';
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(
  ctx: BillingContext,
  input: CreateCheckoutInput,
): Promise<{ url: string | null }> {
  if (!ctx.stripe) return { url: null };
  const priceId = ctx.priceIds[input.plan];
  if (!priceId) {
    throw new Error(`stripe_price_not_configured:${input.plan}`);
  }
  const session = await ctx.stripe.checkout.sessions.create({
    mode: 'subscription',
    client_reference_id: input.tenantId,
    metadata: {
      tenant_id: input.tenantId,
      principal_did: input.principalDid,
      plan: input.plan,
    },
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  return { url: session.url ?? null };
}

export interface CreatePortalInput {
  customerId: string;
  returnUrl: string;
}

/**
 * Stripe customer-portal session. Used for "Manage subscription" — gives the
 * tenant a self-serve page for updating payment methods, switching plans,
 * downloading invoices, and cancelling. Returns null when Stripe isn't
 * configured so the caller can surface a dev-mode hint instead of crashing.
 */
export async function createPortalSession(
  ctx: BillingContext,
  input: CreatePortalInput,
): Promise<{ url: string | null }> {
  if (!ctx.stripe) return { url: null };
  const session = await ctx.stripe.billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  });
  return { url: session.url };
}

export interface WebhookHandleResult {
  ok: boolean;
  processed: boolean;
  reason?: string;
}

export async function handleStripeWebhook(
  ctx: BillingContext,
  db: CloudDbClient,
  payload: string,
  signatureHeader: string,
): Promise<WebhookHandleResult> {
  if (!ctx.stripe || !ctx.webhookSecret) {
    return { ok: false, processed: false, reason: 'stripe_not_configured' };
  }
  let event: Stripe.Event;
  try {
    event = ctx.stripe.webhooks.constructEvent(payload, signatureHeader, ctx.webhookSecret);
  } catch {
    return { ok: false, processed: false, reason: 'bad_signature' };
  }

  // Idempotency: dedup by event.id.
  const existing = await db
    .select({ eventId: stripeEvents.eventId })
    .from(stripeEvents)
    .where(eq(stripeEvents.eventId, event.id))
    .limit(1);
  if (existing.length > 0) {
    return { ok: true, processed: false, reason: 'dedup' };
  }

  const tenantId = extractTenantId(event);
  await applyEvent(db, event, tenantId);

  await db.insert(stripeEvents).values({
    eventId: event.id,
    type: event.type,
    ...(tenantId ? { tenantId } : {}),
    payload: event as unknown as Record<string, unknown>,
  });

  return { ok: true, processed: true };
}

function extractTenantId(event: Stripe.Event): string | null {
  const data = event.data?.object as unknown as {
    metadata?: Record<string, string>;
    client_reference_id?: string;
    customer?: string;
    subscription?: string;
  };
  return (
    data?.metadata?.['tenant_id'] ?? data?.client_reference_id ?? null
  );
}

async function applyEvent(
  db: CloudDbClient,
  event: Stripe.Event,
  tenantId: string | null,
): Promise<void> {
  if (!tenantId) return;
  switch (event.type) {
    case 'checkout.session.completed': {
      const obj = event.data.object as Stripe.Checkout.Session;
      const plan = (obj.metadata?.['plan'] ?? 'pro') as Plan;
      await db
        .update(tenants)
        .set({
          plan,
          status: 'active',
          ...(obj.customer && typeof obj.customer === 'string'
            ? { stripeCustomerId: obj.customer }
            : {}),
          ...(obj.subscription && typeof obj.subscription === 'string'
            ? { stripeSubscriptionId: obj.subscription }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));
      return;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.created': {
      const sub = event.data.object as Stripe.Subscription;
      const status = normalizeSubscriptionStatus(sub.status);
      await db
        .update(tenants)
        .set({
          status,
          stripeSubscriptionId: sub.id,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));
      return;
    }
    case 'customer.subscription.deleted': {
      await db
        .update(tenants)
        .set({ plan: 'free', status: 'canceled', updatedAt: new Date() })
        .where(eq(tenants.id, tenantId));
      return;
    }
    case 'invoice.payment_failed': {
      await db
        .update(tenants)
        .set({ status: 'past_due', updatedAt: new Date() })
        .where(eq(tenants.id, tenantId));
      return;
    }
    default:
      return;
  }
}

function normalizeSubscriptionStatus(s: Stripe.Subscription.Status): 'active' | 'past_due' | 'canceled' {
  switch (s) {
    case 'active':
    case 'trialing':
    case 'incomplete':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
    default:
      return 'canceled';
  }
}

/**
 * Check if a tenant is within plan quota. Returns null when under cap,
 * or the plan limits if the cap is exceeded (so callers can render a
 * helpful error).
 */
export function checkQuota(plan: Plan, inboundThisMonth: number): PlanLimits | null {
  const limits = PLAN_LIMITS[plan];
  if (limits.maxInboundMessagesPerMonth === null) return null;
  if (inboundThisMonth < limits.maxInboundMessagesPerMonth) return null;
  return limits;
}

export { PLAN_LIMITS };
