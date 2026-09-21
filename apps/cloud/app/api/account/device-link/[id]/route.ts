/** GET /api/account/device-link/:id — new device: poll; the sealed key is handed out once. */
import { NextResponse } from 'next/server';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { pollLink } from '@/lib/device-link';
import { posthog } from '@/lib/posthog';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const { tenantDb } = await requireTenantDb();
    const r = await pollLink(tenantDb.raw, tenantDb.tenantId, id);
    if (r.status === 'delivered') return NextResponse.json({ status: 'delivered', ciphertext: r.ciphertext, iv: r.iv, sender_pub: r.senderPub }, { headers: { 'cache-control': 'no-store' } });
    return NextResponse.json({ status: r.status }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
