/**
 * GET /api/cron/registrar-reconcile  (AgentID S2 / T10)
 *
 * Daily: diff the upstream owned-domain list against our registrations and
 * fix drift (expiry dates, expired names). Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET`.
 */

import { NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';
import { domainRegistrations, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import { getDb } from '@/lib/db';
import { headlessFromEnv } from '@/lib/registrar-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env['CRON_SECRET'];
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = await getDb();
  const owned = await headlessFromEnv().myDomains();
  const byDomain = new Map(owned.map((d) => [d.domain.toLowerCase(), d]));

  const ours = await db
    .select({
      id: domainRegistrations.id,
      tenantId: domainRegistrations.tenantId,
      domain: domainRegistrations.domain,
      status: domainRegistrations.status,
      expiryAt: domainRegistrations.expiryAt,
    })
    .from(domainRegistrations)
    .where(inArray(domainRegistrations.status, ['registered', 'owner_pending', 'active', 'expired']));

  let updated = 0;
  const missingUpstream: string[] = [];
  for (const r of ours) {
    const up = byDomain.get(r.domain);
    if (!up) {
      missingUpstream.push(r.domain);
      continue;
    }
    const tenantDb = withTenant(db, toTenantId(r.tenantId));
    const patch: { expiryAt?: Date; status?: 'expired' | 'active' } = {};
    if (up.expiryAt && (!r.expiryAt || up.expiryAt.getTime() !== r.expiryAt.getTime())) patch.expiryAt = up.expiryAt;
    if (up.status === 'expired' && r.status !== 'expired') patch.status = 'expired';
    if (up.status === 'active' && r.status === 'expired') patch.status = 'active';
    if (Object.keys(patch).length > 0) {
      await tenantDb.updateRegistration(r.id, patch);
      updated += 1;
    }
  }
  if (missingUpstream.length > 0) console.warn('[registrar-reconcile] registered here but not owned upstream', missingUpstream);
  return NextResponse.json({ ok: true, checked: ours.length, updated, missing_upstream: missingUpstream.length });
}
