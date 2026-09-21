/** POST /api/account/device-link { receiver_pub } — new device: start a link, get the code to read out. */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { startLink } from '@/lib/device-link';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { posthog } from '@/lib/posthog';

export const runtime = 'nodejs';
const Body = z.object({ receiver_pub: z.string().min(80).max(120).regex(/^[A-Za-z0-9_-]+$/) });

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenantDb } = await requireTenantDb();
    const rl = await checkRateLimit({ bucket: `device-link:start:${tenantDb.tenantId}`, windowSeconds: 600, limit: 10 });
    if (!rl.ok) return rateLimitedResponse(rl.retryAfter);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const link = await startLink(tenantDb.raw, tenantDb.tenantId, parsed.data.receiver_pub);
    return NextResponse.json({ id: link.id, code: link.code, expires_at: link.expiresAt.toISOString() });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
