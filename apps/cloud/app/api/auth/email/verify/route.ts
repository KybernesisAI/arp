/**
 * POST /api/auth/email/verify { email, code } — redeem a sign-in code and open
 * a session for the account that owns the address.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { tenants } from '@kybernesis/arp-cloud-db';
import { getDb } from '@/lib/db';
import { normalizeEmail, redeemCode } from '@/lib/login-codes';
import { setSession } from '@/lib/session';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { posthog, track } from '@/lib/posthog';

export const runtime = 'nodejs';
const Body = z.object({ email: z.string().min(3).max(254), code: z.string().min(6).max(8) });

export async function POST(req: Request): Promise<Response> {
  try {
    const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown').split(',')[0]!.trim();
    const rl = await checkRateLimit({ bucket: `email-verify:ip:${ip}`, windowSeconds: 600, limit: 30 });
    if (!rl.ok) return rateLimitedResponse(rl.retryAfter);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    const email = parsed.success ? normalizeEmail(parsed.data.email) : null;
    if (!email || !parsed.success) return NextResponse.json({ error: 'bad_request', message: 'Enter the email and the 6-digit code.' }, { status: 400 });
    const db = await getDb();
    const r = await redeemCode(db, { email, code: parsed.data.code, purpose: 'sign_in' });
    if (!r.ok) {
      const message = r.reason === 'expired' ? 'That code has expired. Request a new one.' : r.reason === 'locked' ? 'Too many tries. Request a new code.' : 'That code is not right.';
      return NextResponse.json({ error: r.reason, message }, { status: 401 });
    }
    const rows = await db.select({ id: tenants.id, principalDid: tenants.principalDid }).from(tenants).where(eq(tenants.id, r.tenantId ?? '00000000-0000-0000-0000-000000000000')).limit(1);
    const tenant = rows[0];
    if (!tenant) return NextResponse.json({ error: 'no_account', message: 'That code is not right.' }, { status: 401 });
    await setSession(tenant.principalDid, tenant.id, `email:${Date.now()}`);
    track({ distinctId: tenant.principalDid, event: 'account_signed_in_email', properties: { tenant_id: tenant.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    posthog.captureException(err);
    console.error('[auth/email/verify]', err);
    return NextResponse.json({ error: 'internal', message: 'Sign-in failed. Please try again.' }, { status: 500 });
  }
}
