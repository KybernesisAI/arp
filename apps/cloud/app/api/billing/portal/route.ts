import { NextResponse } from 'next/server';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { createPortalSession, getBillingContext } from '@/lib/billing';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * POST /api/billing/portal — open a Stripe customer portal session.
 *
 * Responses:
 *   401 — no session
 *   404 — no_tenant
 *   400 — no_stripe_customer (tenant hasn't checked out yet)
 *   503 — stripe_not_configured (dev w/o STRIPE_SECRET_KEY)
 *   200 — { url }
 *
 * The portal URL is single-use + short-lived; we do NOT cache it. The client
 * follows the redirect immediately on receipt.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const { tenantDb } = await requireTenantDb();
    const tenant = await tenantDb.getTenant();
    if (!tenant) return NextResponse.json({ error: 'no_tenant' }, { status: 404 });
    if (!tenant.stripeCustomerId) {
      return NextResponse.json(
        { error: 'no_stripe_customer', hint: 'checkout first via /billing' },
        { status: 400 },
      );
    }
    const ctx = getBillingContext();
    if (!ctx.stripe) {
      return NextResponse.json(
        { error: 'stripe_not_configured', hint: 'set STRIPE_SECRET_KEY in .env.local' },
        { status: 503 },
      );
    }
    const host = env().ARP_CLOUD_HOST;
    const { url } = await createPortalSession(ctx, {
      customerId: tenant.stripeCustomerId,
      returnUrl: `https://${host}/billing`,
    });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
