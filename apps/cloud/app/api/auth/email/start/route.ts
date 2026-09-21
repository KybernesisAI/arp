/**
 * POST /api/auth/email/start { email } — email a sign-in code.
 * Always answers the same way whether or not the address has an account.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { issueCode, normalizeEmail } from '@/lib/login-codes';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { posthog } from '@/lib/posthog';

export const runtime = 'nodejs';
const Body = z.object({ email: z.string().min(3).max(254) });

export async function POST(req: Request): Promise<Response> {
  try {
    const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown').split(',')[0]!.trim();
    const rl = await checkRateLimit({ bucket: `email-start:ip:${ip}`, windowSeconds: 600, limit: 10 });
    if (!rl.ok) return rateLimitedResponse(rl.retryAfter);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    const email = parsed.success ? normalizeEmail(parsed.data.email) : null;
    if (!email) return NextResponse.json({ error: 'bad_email', message: 'Enter a valid email address.' }, { status: 400 });
    const perEmail = await checkRateLimit({ bucket: `email-start:addr:${email}`, windowSeconds: 600, limit: 5 });
    if (!perEmail.ok) return rateLimitedResponse(perEmail.retryAfter);
    await issueCode(await getDb(), { email, purpose: 'sign_in' });
    return NextResponse.json({ ok: true, message: 'If that address has an account, a code is on its way.' });
  } catch (err) {
    posthog.captureException(err);
    console.error('[auth/email/start]', err);
    return NextResponse.json({ error: 'internal', message: 'The code could not be sent. Please try again.' }, { status: 500 });
  }
}
