import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { createCheckoutSession, getBillingContext } from '@/lib/billing';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const Body = z.object({ plan: z.enum(['pro', 'team']) });

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
        { error: 'stripe_not_configured', hint: 'set STRIPE_SECRET_KEY + STRIPE_PRICE_* in .env.local' },
        { status: 503 },
      );
    }
    const host = env().ARP_CLOUD_HOST;
    const { url } = await createCheckoutSession(ctx, {
      tenantId: tenant.id,
      principalDid: session.principalDid,
      plan: parsed.data.plan,
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
