/** POST /api/account/device-link/deliver { id, ciphertext, iv, sender_pub } — device with the key: drop the sealed key. */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { deliverLink } from '@/lib/device-link';
import { posthog, track } from '@/lib/posthog';

export const runtime = 'nodejs';
const B64U = /^[A-Za-z0-9_-]+$/;
const Body = z.object({ id: z.string().uuid(), ciphertext: z.string().min(16).max(8192).regex(B64U), iv: z.string().min(12).max(24).regex(B64U), sender_pub: z.string().min(80).max(120).regex(B64U) });

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenantDb, session } = await requireTenantDb();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const ok = await deliverLink(tenantDb.raw, tenantDb.tenantId, parsed.data.id, { ciphertext: parsed.data.ciphertext, iv: parsed.data.iv, senderPub: parsed.data.sender_pub });
    if (!ok) return NextResponse.json({ error: 'gone', message: 'That link is no longer open. Start again on the other device.' }, { status: 409 });
    track({ distinctId: session.principalDid, event: 'account_key_linked_device', properties: { tenant_id: tenantDb.tenantId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
