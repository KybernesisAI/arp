/** POST /api/account/device-link/claim { code } — device with the key: get the receiver's public key. */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { claimLink } from '@/lib/device-link';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { posthog } from '@/lib/posthog';

export const runtime = 'nodejs';
const Body = z.object({ code: z.string().min(6).max(8) });

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenantDb } = await requireTenantDb();
    const rl = await checkRateLimit({ bucket: `device-link:claim:${tenantDb.tenantId}`, windowSeconds: 600, limit: 20 });
    if (!rl.ok) return rateLimitedResponse(rl.retryAfter);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'bad_request', message: 'Enter the 6-digit code shown on the other device.' }, { status: 400 });
    const r = await claimLink(tenantDb.raw, tenantDb.tenantId, parsed.data.code);
    if (!r.ok) {
      const message = r.reason === 'expired' ? 'That code has expired. Start again on the other device.' : r.reason === 'locked' ? 'Too many wrong tries. Start again on the other device.' : 'That code is not right, or nothing is waiting for it.';
      return NextResponse.json({ error: r.reason, message }, { status: 404 });
    }
    return NextResponse.json({ id: r.id, receiver_pub: r.receiverPub });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
