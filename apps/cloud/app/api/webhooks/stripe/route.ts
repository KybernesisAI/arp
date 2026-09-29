/**
 * POST /api/webhooks/stripe — Stripe → console. Verified by signature,
 * deduped by event id; effects (register a name, record a renewal, Connect
 * on/off, payment failures) run through the hooks in registrar-server.
 */
import { NextResponse } from 'next/server';
import { getBillingContext, handleStripeWebhook } from '@/lib/billing';
import { getDb } from '@/lib/db';
import { billingWebhookHooks } from '@/lib/registrar-server';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = getBillingContext();
  if (!ctx.stripe || !ctx.webhookSecret) {
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 503 });
  }
  const sigHeader = req.headers.get('stripe-signature') ?? '';
  const payload = await req.text();
  const db = await getDb();
  const result = await handleStripeWebhook(ctx, db, payload, sigHeader, billingWebhookHooks);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, processed: result.processed });
}
