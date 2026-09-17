/**
 * POST /api/webhooks/headless  (AgentID S2 / T10)
 *
 * Upstream registry events → registration status/expiry. HMAC-SHA256
 * verified against HEADLESS_WEBHOOK_SECRET; unknown domains are ignored.
 * Internal route: nothing here is customer-facing.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { domainRegistrations, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { parseHeadlessWebhookEvent, verifyHeadlessWebhookSignature } from '@/lib/headless';

export const runtime = 'nodejs';

function toDate(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v.endsWith('Z') || /[+-]\d\d:\d\d$/.test(v) ? v : `${v}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request): Promise<Response> {
  const secret = env().HEADLESS_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const raw = await req.text();
  if (!verifyHeadlessWebhookSignature(raw, req.headers.get('x-headless-signature'), secret)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const event = parseHeadlessWebhookEvent(json);
  if (!event) return NextResponse.json({ ok: true, ignored: 'unknown_event' });

  const domain = typeof event.data['domain'] === 'string' ? (event.data['domain'] as string).toLowerCase() : null;
  if (!domain) return NextResponse.json({ ok: true, ignored: 'no_domain' });

  const db = await getDb();
  const rows = await db
    .select({ id: domainRegistrations.id, tenantId: domainRegistrations.tenantId, status: domainRegistrations.status })
    .from(domainRegistrations)
    .where(eq(domainRegistrations.domain, domain))
    .limit(1);
  const row = rows[0];
  if (!row) return NextResponse.json({ ok: true, ignored: 'unknown_domain' });
  const tenantDb = withTenant(db, toTenantId(row.tenantId));

  switch (event.event_type) {
    case 'domain.registered':
    case 'domain.renewed': {
      const expiryAt = toDate(event.data['expiry_date'] ?? event.data['new_expiry_date']);
      await tenantDb.updateRegistration(row.id, {
        ...(expiryAt ? { expiryAt } : {}),
        ...(row.status === 'expired' ? { status: 'active' as const } : {}),
      });
      break;
    }
    case 'domain.expired':
      await tenantDb.updateRegistration(row.id, { status: 'expired' });
      break;
    default:
      break;
  }
  return NextResponse.json({ ok: true, event_id: event.event_id });
}
