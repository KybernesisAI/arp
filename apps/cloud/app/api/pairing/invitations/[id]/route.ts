/**
 * DELETE /api/pairing/invitations/:id — cancel or deny a pending invitation.
 *
 * Authorisation: either the issuing tenant (cancel) or any tenant that owns
 * an agent matching the invitation's `audience_did` (deny). Consumed or
 * already cancelled rows are a no-op (idempotent 200 — consistent with
 * typical DELETE-cancel semantics where the caller just wants the state to
 * be "not-pending"). Returns `actor: 'issuer' | 'audience' | null` so the
 * UI can phrase the toast appropriately.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { pairingInvitations } from '@kybernesis/arp-cloud-db';
import { requireTenantDb, AuthError } from '@/lib/tenant-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { tenantDb } = await requireTenantDb();
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'bad_id' }, { status: 400 });
    }

    // Look up the invitation cross-tenant first so we can decide whether
    // the caller is the issuer (their tenant_id matches) or the audience
    // (their tenant owns the audience_did agent).
    const found = await tenantDb.raw
      .select()
      .from(pairingInvitations)
      .where(eq(pairingInvitations.id, id))
      .limit(1);
    const inv = found[0];
    if (!inv) {
      return NextResponse.json({ ok: true, cancelled: false, actor: null });
    }

    let actor: 'issuer' | 'audience' | null = null;
    if (inv.tenantId === tenantDb.tenantId) {
      actor = 'issuer';
    } else {
      const audienceAgent = await tenantDb.getAgent(inv.audienceDid);
      if (audienceAgent) actor = 'audience';
    }
    if (!actor) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const rows = await tenantDb.raw
      .update(pairingInvitations)
      .set({ cancelledAt: new Date() })
      .where(
        and(
          eq(pairingInvitations.id, id),
          isNull(pairingInvitations.consumedAt),
          isNull(pairingInvitations.cancelledAt),
        ),
      )
      .returning({ id: pairingInvitations.id });
    return NextResponse.json({
      ok: true,
      cancelled: rows.length === 1,
      actor,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
