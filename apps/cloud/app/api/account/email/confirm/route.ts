/** POST /api/account/email/confirm { email, code } — bind the address to this account. */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { normalizeEmail, redeemCode } from '@/lib/login-codes';
import { posthog, track } from '@/lib/posthog';

export const runtime = 'nodejs';
const Body = z.object({ email: z.string().min(3).max(254), code: z.string().min(6).max(8) });

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenantDb, session } = await requireTenantDb();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    const email = parsed.success ? normalizeEmail(parsed.data.email) : null;
    if (!email || !parsed.success) return NextResponse.json({ error: 'bad_request', message: 'Enter the email and the 6-digit code.' }, { status: 400 });
    const r = await redeemCode(tenantDb.raw, { email, code: parsed.data.code, purpose: 'verify_email' });
    if (!r.ok || r.tenantId !== tenantDb.tenantId) {
      const message = r.ok ? 'That code is not right.' : r.reason === 'expired' ? 'That code has expired. Request a new one.' : r.reason === 'locked' ? 'Too many tries. Request a new code.' : 'That code is not right.';
      return NextResponse.json({ error: r.ok ? 'invalid' : r.reason, message }, { status: 401 });
    }
    await tenantDb.updateTenant({ email, emailVerifiedAt: new Date() });
    track({ distinctId: session.principalDid, event: 'account_email_verified', properties: { tenant_id: tenantDb.tenantId } });
    return NextResponse.json({ ok: true, email });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    console.error('[account/email/confirm]', err);
    return NextResponse.json({ error: 'internal', message: 'Verification failed. Please try again.' }, { status: 500 });
  }
}
