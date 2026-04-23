import { NextResponse } from 'next/server';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    const { tenantDb } = await requireTenantDb();
    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    const reason = body.reason ?? 'owner_revoked';
    const conn = await tenantDb.getConnection(id);
    if (!conn) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await tenantDb.updateConnectionStatus(id, 'revoked', reason);
    await tenantDb.addRevocation(conn.agentDid, 'connection', id, reason);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
