import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { createCheckoutSession, getBillingContext } from '@/lib/billing';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

// Phase-10: Pro is the only paid plan. The Stripe subscription's `quantity`
// carries the per-tenant agent count, defaulting to current provisioned
// agents at upgrade time.
const Body = z.object({ quantity: z.number().int().min(1).max(1000).optional() });

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { tenantDb, session } = await requireTenantDb();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const tenant = await tenantDb.getTenant();
    if (!tenant) return NextResponse.json({ error: 'no_tenant' }, { status: 404 });
    const ctx = getBillingContext();
    if (!ctx.stripe) {
      return NextResponse.json(
        {
          error: 'stripe_not_configured',
          hint: 'set STRIPE_SECRET_KEY + STRIPE_PRICE_PRO_PER_AGENT in .env.local',
        },
        { status: 503 },
      );
    }
    const provisionedAgents = (await tenantDb.listAgents()).length;
    const quantity = parsed.data.quantity ?? Math.max(1, provisionedAgents);
    const host = env().ARP_CLOUD_HOST;
    const { url } = await createCheckoutSession(ctx, {
      tenantId: tenant.id,
      principalDid: session.principalDid,
      quantity,
      successUrl: `https://${host}/billing?status=success`,
      cancelUrl: `https://${host}/billing?status=cancel`,
    });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
