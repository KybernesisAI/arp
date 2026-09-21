/**
 * POST /api/pairing/invitations/resolve { token } — a short link's signed
 * invitation. Public: the recipient may not be signed in yet. The token
 * travels in the body, never the URL. Only pending invitations resolve.
 */

import { NextResponse } from 'next/server';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { pairingInvitations } from '@kybernesis/arp-cloud-db';
import { getDb } from '@/lib/db';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { posthog } from '@/lib/posthog';

export const runtime = 'nodejs';

const Body = z.object({ token: z.string().min(16).max(64) });

export async function POST(req: Request): Promise<Response> {
  try {
    const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown').split(',')[0]!.trim();
    const rl = await checkRateLimit({ bucket: `invite-resolve:ip:${ip}`, windowSeconds: 60, limit: 60 });
    if (!rl.ok) return rateLimitedResponse(rl.retryAfter);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    const db = await getDb();
    const rows = await db
      .select({ payload: pairingInvitations.payload })
      .from(pairingInvitations)
      .where(and(eq(pairingInvitations.shortToken, parsed.data.token), isNull(pairingInvitations.consumedAt), isNull(pairingInvitations.cancelledAt), gt(pairingInvitations.expiresAt, new Date())))
      .limit(1);
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'not_found', message: 'This invitation link is no longer open.' }, { status: 404 });
    return NextResponse.json({ payload: row.payload }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    posthog.captureException(err);
    console.error('[invitations/resolve]', err);
    return NextResponse.json({ error: 'internal', message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
