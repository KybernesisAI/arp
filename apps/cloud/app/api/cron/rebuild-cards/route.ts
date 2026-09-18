/**
 * GET /api/cron/rebuild-cards  (AgentID S5 / A6)
 *
 * Re-derives every hosted identity's well-known documents — DID document,
 * ARP card, and the signed A2A card — from the current rows. Runs weekly so
 * cards never drift from links / runtime state, and is the one-shot backfill
 * for identities minted before the A2A card existed (`?only=missing`).
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
 */

import { NextResponse } from 'next/server';
import { agents, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import { getDb } from '@/lib/db';
import { rebuildWellKnown } from '@/lib/links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env['CRON_SECRET'];
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const onlyMissing = new URL(req.url).searchParams.get('only') === 'missing';
  const db = await getDb();
  const rows = await db
    .select({ tenantId: agents.tenantId, did: agents.did, card: agents.wellKnownA2aCard })
    .from(agents);

  let rebuilt = 0;
  let signed = 0;
  const failed: string[] = [];
  for (const r of rows) {
    if (onlyMissing && r.card) continue;
    try {
      const updated = await rebuildWellKnown(withTenant(db, toTenantId(r.tenantId)), r.did);
      if (!updated) continue;
      rebuilt += 1;
      if (((updated.wellKnownA2aCard as { signatures?: unknown[] } | null)?.signatures?.length ?? 0) > 0) signed += 1;
    } catch (err) {
      console.warn('[rebuild-cards] failed', r.did, (err as Error).message);
      failed.push(r.did);
    }
  }
  return NextResponse.json({ ok: true, checked: rows.length, rebuilt, signed, failed });
}
