/**
 * Stripe billing helpers — Phase-10 per-agent rewrite.
 *
 * Pricing model:
 *  - free: $0, 1 agent, 100 inbound msgs/mo
 *  - pro:  $5/mo per agent, 10_000 inbound msgs/mo SHARED across the
 *          tenant's agents. The Stripe subscription carries one line item
 *          (price = STRIPE_PRICE_PRO_PER_AGENT) with `quantity` matching
 *          the number of provisioned agents on the tenant.
 *
 * Quantity sync runs in two directions:
 *  - Cloud → Stripe: `updateSubscriptionQuantity()` is called from the
 *    agent-create + agent-archive routes, with proration enabled so the
 *    user is charged/credited for the time-pro-rated delta.
 *  - Stripe → Cloud: `customer.subscription.updated` carries the new
 *    quantity (e.g. when the user adjusts via Stripe's customer portal),
 *    and the webhook mirrors it into `tenants.subscription_quantity`.
 *
 * Webhook dedup: every Stripe event id is recorded in `stripe_events`.
 * The PK conflict makes replays idempotent.
 */

import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import {
  PLAN_LIMITS,
  tenants,
  stripeEvents,
  effectiveMaxAgents,
  monthlyBillCents,
  checkQuota,
  type CloudDbClient,
  type PlanLimits,
} from '@kybernesis/arp-cloud-db';
import { env } from './env';

export type Plan = PlanLimits['plan'];

export interface BillingContext {
  /** null when STRIPE_SECRET_KEY isn't configured; caller should gate UI. */
  stripe: Stripe | null;
  webhookSecret: string | null;
  /** Single per-agent price id. null when not configured (dev w/o Stripe). */
  proPerAgentPriceId: string | null;
}

export function getBillingContext(): BillingContext {
  const e = env();
  const stripe = e.STRIPE_SECRET_KEY
    ? new Stripe(e.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion })
    : null;
  return {
    stripe,
    webhookSecret: e.STRIPE_WEBHOOK_SECRET,
    proPerAgentPriceId: e.STRIPE_PRICE_PRO_PER_AGENT,
  };
}

export interface CreateCheckoutInput {
  tenantId: string;
  principalDid: string;
  /** Number of agent units to start the subscription with. Min 1. */
  quantity: number;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(
  ctx: BillingContext,
  input: CreateCheckoutInput,
): Promise<{ url: string | null }> {
  if (!ctx.stripe) return { url: null };
  if (!ctx.proPerAgentPriceId) {
    throw new Error('stripe_price_not_configured');
  }
  const qty = Math.max(1, Math.floor(input.quantity));
  const session = await ctx.stripe.checkout.sessions.create({
    mode: 'subscription',
    client_reference_id: input.tenantId,
    metadata: {
      tenant_id: input.tenantId,
      principal_did: input.principalDid,
      plan: 'pro',
    },
    subscription_data: {
      metadata: {
        tenant_id: input.tenantId,
        principal_did: input.principalDid,
        plan: 'pro',
      },
    },
    line_items: [{ price: ctx.proPerAgentPriceId, quantity: qty }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  return { url: session.url ?? null };
}

export interface CreatePortalInput {
  customerId: string;
  returnUrl: string;
}

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

/**
 * Set the Stripe subscription line-item quantity. Called when an agent is
 * created or archived on a Pro tenant so billing always matches the actual
 * agent count. Returns the canonical Stripe-side quantity after the update
 * (write that back into `tenants.subscription_quantity`); returns null when
 * Stripe isn't configured (dev). Proration is enabled — Stripe pro-rates
 * the delta on the next invoice.
 */
export async function updateSubscriptionQuantity(
  ctx: BillingContext,
  subscriptionId: string,
  quantity: number,
): Promise<number | null> {
  if (!ctx.stripe) return null;
  const qty = Math.max(1, Math.floor(quantity));
  const sub = await ctx.stripe.subscriptions.retrieve(subscriptionId);
  const item = sub.items.data[0];
  if (!item) {
    throw new Error('stripe_subscription_no_items');
  }
  const updated = await ctx.stripe.subscriptions.update(subscriptionId, {
    items: [{ id: item.id, quantity: qty }],
    proration_behavior: 'create_prorations',
  });
  const updatedItem = updated.items.data[0];
  return updatedItem?.quantity ?? qty;
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

  const tenantId = await extractTenantId(db, event);
  await applyEvent(db, event, tenantId);

  await db.insert(stripeEvents).values({
    eventId: event.id,
    type: event.type,
    ...(tenantId ? { tenantId } : {}),
    payload: event as unknown as Record<string, unknown>,
  });

  return { ok: true, processed: true };
}

/**
 * Extract the tenant id for an event. Tries metadata.tenant_id, then
 * client_reference_id, then a lookup by `customer` against
 * tenants.stripe_customer_id (handles portal-driven events where Stripe
 * does not propagate the metadata blob).
 */
async function extractTenantId(
  db: CloudDbClient,
  event: Stripe.Event,
): Promise<string | null> {
  const data = event.data?.object as unknown as {
    metadata?: Record<string, string>;
    client_reference_id?: string;
    customer?: string | { id?: string };
  };

  const metaId = data?.metadata?.['tenant_id'];
  if (metaId) return metaId;
  const refId = data?.client_reference_id;
  if (refId) return refId;
  const customerId =
    typeof data?.customer === 'string'
      ? data.customer
      : data?.customer?.id ?? null;
  if (customerId) {
    const rows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.stripeCustomerId, customerId))
      .limit(1);
    if (rows[0]) return rows[0].id;
  }
  return null;
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
      // Plan is always 'pro' under the new model — the legacy 'team' tier
      // was collapsed into pro-with-quantity.
      await db
        .update(tenants)
        .set({
          plan: 'pro',
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
      const quantity = extractSubscriptionQuantity(sub);
      await db
        .update(tenants)
        .set({
          plan: 'pro',
          status,
          stripeSubscriptionId: sub.id,
          ...(quantity !== null ? { subscriptionQuantity: quantity } : {}),
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));
      return;
    }
    case 'customer.subscription.deleted': {
      // Cancellation drops the tenant back to free + resets the qty. Existing
      // agents survive the downgrade; the agent-create gate refuses new ones
      // while the message-quota gate naturally throttles them into upgrading
      // or archiving extras.
      await db
        .update(tenants)
        .set({
          plan: 'free',
          status: 'canceled',
          subscriptionQuantity: 1,
          stripeSubscriptionId: null,
          updatedAt: new Date(),
        })
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

function extractSubscriptionQuantity(sub: Stripe.Subscription): number | null {
  const item = sub.items?.data?.[0];
  if (!item || typeof item.quantity !== 'number') return null;
  return Math.max(1, Math.floor(item.quantity));
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

export { PLAN_LIMITS, effectiveMaxAgents, monthlyBillCents, checkQuota };

/**
 * Current usage period in `YYYY-MM` form (UTC). Matches the period key
 * the cloud-runtime uses when writing inbound message increments.
 */
export function currentUsagePeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}
