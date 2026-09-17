/**
 * POST /api/registrar/checkout  { sld, years }
 *
 * Re-checks availability, opens a `domain_registrations` row in
 * pending_payment, and returns a Stripe Checkout URL (one-time payment).
 * Fulfilment happens on the `checkout.session.completed` webhook.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { getBillingContext } from '@/lib/billing';
import { env } from '@/lib/env';
import { posthog, track } from '@/lib/posthog';
import { RegistrarError, startNameCheckout } from '@/lib/registrar';
import { headlessFromEnv, registrarEnv } from '@/lib/registrar-server';

export const runtime = 'nodejs';

const Body = z.object({
  sld: z.string().min(1).max(70),
  years: z.number().int().min(1).max(10).optional().default(1),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenantDb, session } = await requireTenantDb();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'bad_request', issues: parsed.error.issues }, { status: 400 });
    }
    const host = env().ARP_CLOUD_HOST;
    const { url, registration } = await startNameCheckout({
      tenantDb,
      tenantId: tenantDb.tenantId,
      principalDid: session.principalDid,
      sld: parsed.data.sld,
      years: parsed.data.years,
      headless: headlessFromEnv(),
      stripe: getBillingContext().stripe,
      env: registrarEnv(),
      successUrl: `https://${host}/dashboard?claim=${encodeURIComponent(parsed.data.sld)}&status=paid`,
      cancelUrl: `https://${host}/dashboard?claim=${encodeURIComponent(parsed.data.sld)}&status=cancel`,
    });
    track({
      distinctId: session.principalDid,
      event: 'agentid_name_checkout_started',
      properties: { tenant_id: tenantDb.tenantId, domain: registration.domain, years: registration.years },
    });
    return NextResponse.json({ url, registration_id: registration.id, domain: registration.domain });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof RegistrarError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    posthog.captureException(err);
    console.error('[registrar/checkout]', err);
    return NextResponse.json(
      { error: 'registry_unavailable', message: 'Checkout could not be started. Please try again.' },
      { status: 503 },
    );
  }
}
