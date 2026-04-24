/**
 * DELETE /api/pairing/invitations/:id — cancel a pending invitation.
 *
 * Tenant-scoped; only the issuing tenant may cancel. Consumed or already
 * cancelled rows are a no-op (idempotent 200 — consistent with typical
 * DELETE-cancel semantics where the caller just wants the state to be
 * "not-pending").
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
    const rows = await tenantDb.raw
      .update(pairingInvitations)
      .set({ cancelledAt: new Date() })
      .where(
        and(
          eq(pairingInvitations.id, id),
          eq(pairingInvitations.tenantId, tenantDb.tenantId),
          isNull(pairingInvitations.consumedAt),
          isNull(pairingInvitations.cancelledAt),
        ),
      )
      .returning({ id: pairingInvitations.id });
    return NextResponse.json({ ok: true, cancelled: rows.length === 1 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
