/** POST /api/billing/autorenew { sld, auto_renew } — turn a name's yearly renewal on or off. */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { getBillingContext, setSubscriptionAutoRenew } from '@/lib/billing';
import { normalizeSld } from '@/lib/headless';
import { posthog } from '@/lib/posthog';

export const runtime = 'nodejs';
const Body = z.object({ sld: z.string().min(1).max(70), auto_renew: z.boolean() });

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { tenantDb } = await requireTenantDb();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const sld = normalizeSld(parsed.data.sld);
    const reg = await tenantDb.getRegistrationByDomain(`${sld}.agent`);
    if (!reg) return NextResponse.json({ error: 'not_found', message: 'That name is not on this account.' }, { status: 404 });
    if (!reg.stripeSubscriptionId) return NextResponse.json({ error: 'no_subscription', message: 'This name was not bought here, so renewal is handled elsewhere.' }, { status: 409 });
    await setSubscriptionAutoRenew(getBillingContext(), reg.stripeSubscriptionId, parsed.data.auto_renew);
    await tenantDb.updateRegistration(reg.id, { autoRenew: parsed.data.auto_renew });
    return NextResponse.json({ ok: true, auto_renew: parsed.data.auto_renew });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    return NextResponse.json({ error: 'internal', message: 'The change could not be saved.' }, { status: 500 });
  }
}
