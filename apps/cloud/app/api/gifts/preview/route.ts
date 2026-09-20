/**
 * POST /api/gifts/preview { token } — what a gift link points at.
 *
 * Public (the recipient may not be signed in yet). Reveals only the name, the
 * sender's note and display name, and whether the link is still open. The
 * token travels in the request body, never the URL.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { previewGift } from '@/lib/name-gifts';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { posthog } from '@/lib/posthog';

export const runtime = 'nodejs';

const Body = z.object({ token: z.string().min(16).max(128) });

export async function POST(req: Request): Promise<Response> {
  try {
    const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown').split(',')[0]!.trim();
    const rl = await checkRateLimit({ bucket: `gift-preview:ip:${ip}`, windowSeconds: 60, limit: 60 });
    if (!rl.ok) return rateLimitedResponse(rl.retryAfter);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ state: 'invalid' }, { status: 400 });
    return NextResponse.json(await previewGift(await getDb(), parsed.data.token));
  } catch (err) {
    posthog.captureException(err);
    console.error('[gifts/preview]', err);
    return NextResponse.json({ error: 'internal', message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
