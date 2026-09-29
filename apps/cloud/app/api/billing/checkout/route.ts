/** POST /api/billing/checkout — start the Connect subscription ($5/month) for this account. */
import { NextResponse } from 'next/server';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { createConnectCheckoutSession, getBillingContext } from '@/lib/billing';
import { consoleUrl } from '@/lib/origins';
import { posthog, track } from '@/lib/posthog';

export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  try {
    const { tenantDb, session } = await requireTenantDb();
    const tenant = await tenantDb.getTenant();
    if (!tenant) return NextResponse.json({ error: 'no_tenant' }, { status: 404 });
    if (tenant.connectStatus === 'active' || tenant.connectStatus === 'past_due') {
      return NextResponse.json({ error: 'already_active', message: 'Connect is already on for this account.' }, { status: 409 });
    }
    const ctx = getBillingContext();
    if (!ctx.stripe || !ctx.connectPriceId) {
      return NextResponse.json({ error: 'stripe_not_configured', message: 'Payments are not configured.' }, { status: 503 });
    }
    const { url } = await createConnectCheckoutSession(ctx, {
      tenantId: tenant.id,
      principalDid: session.principalDid,
      customerId: tenant.stripeCustomerId,
      customerEmail: tenant.email,
      successUrl: consoleUrl('/billing?status=connect_on'),
      cancelUrl: consoleUrl('/billing?status=cancel'),
    });
    track({ distinctId: session.principalDid, event: 'connect_checkout_started', properties: { tenant_id: tenant.id } });
    if (!url) return NextResponse.json({ error: 'stripe_not_configured' }, { status: 503 });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    return NextResponse.json({ error: 'internal', message: 'Checkout could not be started.' }, { status: 500 });
  }
}
