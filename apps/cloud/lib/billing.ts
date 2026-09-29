/**
 * Billing, lander model (2026-09-29):
 *   - a name = one yearly Stripe subscription ($29/year, auto-renews; the
 *     customer can stop it in the portal → cancel_at_period_end)
 *   - Connect = one monthly subscription per account ($5/month) that
 *     allows pairing
 * No free/pro tiers. `tenants.plan === 'internal'` still bypasses everything.
 *
 * Stripe webhook events are deduped by id in `stripe_events`; the effects
 * are dispatched through hooks so this file stays free of registrar code.
 */

import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { PLAN_LIMITS, tenants, stripeEvents, effectiveMaxAgents, monthlyBillCents, checkQuota, canPair, type CloudDbClient, type PlanLimits } from '@kybernesis/arp-cloud-db';
import { env } from './env';

export type Plan = PlanLimits['plan'];

export const NAME_CHECKOUT_KIND = 'agentid_name';
export const CONNECT_CHECKOUT_KIND = 'agentid_connect';

export interface BillingContext {
  /** null when STRIPE_SECRET_KEY isn't configured; caller should gate UI. */
  stripe: Stripe | null;
  webhookSecret: string | null;
  namePriceId: string | null;
  connectPriceId: string | null;
}

export function getBillingContext(): BillingContext {
  const e = env();
  const stripe = e.STRIPE_SECRET_KEY ? new Stripe(e.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion }) : null;
  return { stripe, webhookSecret: e.STRIPE_WEBHOOK_SECRET, namePriceId: e.STRIPE_PRICE_NAME_YEARLY, connectPriceId: e.STRIPE_PRICE_CONNECT_MONTHLY };
}

// ------------------------------------------------------------------ Connect checkout + portal

export interface CreateConnectCheckoutInput {
  tenantId: string;
  principalDid: string;
  customerId?: string | null;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export async function createConnectCheckoutSession(ctx: BillingContext, input: CreateConnectCheckoutInput): Promise<{ url: string | null }> {
  if (!ctx.stripe) return { url: null };
  if (!ctx.connectPriceId) throw new Error('stripe_price_not_configured');
  const meta = { tenant_id: input.tenantId, principal_did: input.principalDid, kind: CONNECT_CHECKOUT_KIND };
  const session = await ctx.stripe.checkout.sessions.create({
    mode: 'subscription',
    client_reference_id: input.tenantId,
    ...(input.customerId ? { customer: input.customerId } : input.customerEmail ? { customer_email: input.customerEmail } : {}),
    metadata: meta,
    subscription_data: { metadata: meta },
    line_items: [{ price: ctx.connectPriceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  return { url: session.url ?? null };
}

export interface CreatePortalInput { customerId: string; returnUrl: string }

export async function createPortalSession(ctx: BillingContext, input: CreatePortalInput): Promise<{ url: string | null }> {
  if (!ctx.stripe) return { url: null };
  const session = await ctx.stripe.billingPortal.sessions.create({ customer: input.customerId, return_url: input.returnUrl });
  return { url: session.url };
}

/** Turn auto-renew on/off for a name's subscription (cancel at period end, or resume). */
export async function setSubscriptionAutoRenew(ctx: BillingContext, subscriptionId: string, autoRenew: boolean): Promise<void> {
  if (!ctx.stripe) return;
  await ctx.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: !autoRenew });
}

// ------------------------------------------------------------------ webhook

export interface WebhookHandleResult { ok: boolean; processed: boolean; reason?: string }

/** Registrar-side effects, injected by the webhook route. */
export interface BillingHooks {
  /** A name checkout completed: register upstream + mint the identity. */
  onNameCheckout?: (session: Stripe.Checkout.Session, tenantId: string) => Promise<void>;
  /** A name subscription's renewal invoice was paid (billing_reason=subscription_cycle). */
  onNameRenewalPaid?: (input: { subscriptionId: string; tenantId: string; periodEnd: Date | null; invoiceId: string }) => Promise<void>;
  /** A name subscription changed (auto-renew flag, period end, status). */
  onNameSubscriptionChanged?: (input: { subscriptionId: string; tenantId: string; autoRenew: boolean; periodEnd: Date | null; status: Stripe.Subscription.Status }) => Promise<void>;
  /** Any payment failed for this tenant (name or Connect). */
  onPaymentFailed?: (input: { tenantId: string; subscriptionId: string | null; kind: string | null }) => Promise<void>;
  /** Connect started/ended. */
  onConnectChanged?: (input: { tenantId: string; active: boolean }) => Promise<void>;
}

export async function handleStripeWebhook(ctx: BillingContext, db: CloudDbClient, payload: string, signatureHeader: string, hooks: BillingHooks = {}): Promise<WebhookHandleResult> {
  if (!ctx.stripe || !ctx.webhookSecret) return { ok: false, processed: false, reason: 'stripe_not_configured' };
  let event: Stripe.Event;
  try {
    event = ctx.stripe.webhooks.constructEvent(payload, signatureHeader, ctx.webhookSecret);
  } catch {
    return { ok: false, processed: false, reason: 'bad_signature' };
  }
  const existing = await db.select({ eventId: stripeEvents.eventId }).from(stripeEvents).where(eq(stripeEvents.eventId, event.id)).limit(1);
  if (existing.length > 0) return { ok: true, processed: false, reason: 'dedup' };

  const tenantId = await extractTenantId(db, event);
  await applyEvent(db, event, tenantId, hooks);
  await db.insert(stripeEvents).values({ eventId: event.id, type: event.type, ...(tenantId ? { tenantId } : {}), payload: event as unknown as Record<string, unknown> });
  return { ok: true, processed: true };
}

async function extractTenantId(db: CloudDbClient, event: Stripe.Event): Promise<string | null> {
  const data = event.data?.object as unknown as { metadata?: Record<string, string>; client_reference_id?: string; customer?: string | { id?: string }; subscription_details?: { metadata?: Record<string, string> }; parent?: { subscription_details?: { metadata?: Record<string, string> } } };
  const metaId = data?.metadata?.['tenant_id'] ?? data?.subscription_details?.metadata?.['tenant_id'] ?? data?.parent?.subscription_details?.metadata?.['tenant_id'];
  if (metaId) return metaId;
  const refId = data?.client_reference_id;
  if (refId) return refId;
  const customerId = typeof data?.customer === 'string' ? data.customer : (data?.customer?.id ?? null);
  if (customerId) {
    const rows = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.stripeCustomerId, customerId)).limit(1);
    if (rows[0]) return rows[0].id;
  }
  return null;
}

function subMeta(sub: Stripe.Subscription): Record<string, string> {
  return (sub.metadata ?? {}) as Record<string, string>;
}
function invoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  const raw = (inv as unknown as { subscription?: string | { id: string } | null; parent?: { subscription_details?: { subscription?: string | { id: string } } } });
  const s = raw.subscription ?? raw.parent?.subscription_details?.subscription ?? null;
  return typeof s === 'string' ? s : (s?.id ?? null);
}
function invoiceKind(inv: Stripe.Invoice): string | null {
  const raw = inv as unknown as { subscription_details?: { metadata?: Record<string, string> }; parent?: { subscription_details?: { metadata?: Record<string, string> } }; lines?: { data?: Array<{ metadata?: Record<string, string> }> } };
  return raw.subscription_details?.metadata?.['kind'] ?? raw.parent?.subscription_details?.metadata?.['kind'] ?? raw.lines?.data?.[0]?.metadata?.['kind'] ?? null;
}
function invoicePeriodEnd(inv: Stripe.Invoice): Date | null {
  const raw = inv as unknown as { lines?: { data?: Array<{ period?: { end?: number } }> }; period_end?: number };
  const end = raw.lines?.data?.[0]?.period?.end ?? raw.period_end;
  return typeof end === 'number' ? new Date(end * 1000) : null;
}
function subPeriodEnd(sub: Stripe.Subscription): Date | null {
  const raw = sub as unknown as { current_period_end?: number; items?: { data?: Array<{ current_period_end?: number }> } };
  const end = raw.current_period_end ?? raw.items?.data?.[0]?.current_period_end;
  return typeof end === 'number' ? new Date(end * 1000) : null;
}

async function applyEvent(db: CloudDbClient, event: Stripe.Event, tenantId: string | null, hooks: BillingHooks): Promise<void> {
  if (!tenantId) return;
  switch (event.type) {
    case 'checkout.session.completed': {
      const obj = event.data.object as Stripe.Checkout.Session;
      const customer = typeof obj.customer === 'string' ? obj.customer : (obj.customer?.id ?? null);
      if (customer) await db.update(tenants).set({ stripeCustomerId: customer, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
      const kind = obj.metadata?.['kind'];
      if (kind === NAME_CHECKOUT_KIND) {
        if (hooks.onNameCheckout) await hooks.onNameCheckout(obj, tenantId);
        return;
      }
      if (kind === CONNECT_CHECKOUT_KIND) {
        const subId = typeof obj.subscription === 'string' ? obj.subscription : (obj.subscription?.id ?? null);
        await db.update(tenants).set({ connectStatus: 'active', ...(subId ? { connectSubscriptionId: subId } : {}), status: 'active', updatedAt: new Date() }).where(eq(tenants.id, tenantId));
        if (hooks.onConnectChanged) await hooks.onConnectChanged({ tenantId, active: true });
      }
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const kind = subMeta(sub)['kind'];
      if (kind === CONNECT_CHECKOUT_KIND) {
        const status = normalizeConnectStatus(sub.status);
        const before = (await db.select({ c: tenants.connectStatus }).from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0]?.c;
        await db.update(tenants).set({ connectStatus: status, connectSubscriptionId: sub.id, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
        if (hooks.onConnectChanged && before !== status && (status === 'active' || status === 'canceled')) await hooks.onConnectChanged({ tenantId, active: status === 'active' });
        return;
      }
      if (kind === NAME_CHECKOUT_KIND && hooks.onNameSubscriptionChanged) {
        await hooks.onNameSubscriptionChanged({ subscriptionId: sub.id, tenantId, autoRenew: !sub.cancel_at_period_end && sub.status !== 'canceled', periodEnd: subPeriodEnd(sub), status: sub.status });
      }
      return;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const kind = subMeta(sub)['kind'];
      if (kind === CONNECT_CHECKOUT_KIND) {
        await db.update(tenants).set({ connectStatus: 'canceled', connectSubscriptionId: null, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
        if (hooks.onConnectChanged) await hooks.onConnectChanged({ tenantId, active: false });
        return;
      }
      if (kind === NAME_CHECKOUT_KIND && hooks.onNameSubscriptionChanged) {
        await hooks.onNameSubscriptionChanged({ subscriptionId: sub.id, tenantId, autoRenew: false, periodEnd: subPeriodEnd(sub), status: 'canceled' });
      }
      return;
    }
    case 'invoice.paid': {
      const inv = event.data.object as Stripe.Invoice;
      const kind = invoiceKind(inv);
      const subId = invoiceSubscriptionId(inv);
      if (kind === NAME_CHECKOUT_KIND && subId && inv.billing_reason === 'subscription_cycle' && hooks.onNameRenewalPaid) {
        await hooks.onNameRenewalPaid({ subscriptionId: subId, tenantId, periodEnd: invoicePeriodEnd(inv), invoiceId: inv.id ?? '' });
      }
      if (kind === CONNECT_CHECKOUT_KIND) {
        await db.update(tenants).set({ connectStatus: 'active', status: 'active', updatedAt: new Date() }).where(eq(tenants.id, tenantId));
      }
      return;
    }
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      const kind = invoiceKind(inv);
      if (kind === CONNECT_CHECKOUT_KIND) await db.update(tenants).set({ connectStatus: 'past_due', updatedAt: new Date() }).where(eq(tenants.id, tenantId));
      if (hooks.onPaymentFailed) await hooks.onPaymentFailed({ tenantId, subscriptionId: invoiceSubscriptionId(inv), kind });
      return;
    }
    default:
      return;
  }
}

function normalizeConnectStatus(s: Stripe.Subscription.Status): 'active' | 'past_due' | 'canceled' {
  switch (s) {
    case 'active':
    case 'trialing':
    case 'incomplete':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    default:
      return 'canceled';
  }
}

export { PLAN_LIMITS, effectiveMaxAgents, monthlyBillCents, checkQuota, canPair };

/** Current usage period in `YYYY-MM` form (UTC). */
export function currentUsagePeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}
