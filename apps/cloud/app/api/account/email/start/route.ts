/** POST /api/account/email/start { email } — send a code to a new address for this account. */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { issueCode, normalizeEmail, tenantIdForEmail } from '@/lib/login-codes';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { posthog } from '@/lib/posthog';

export const runtime = 'nodejs';
const Body = z.object({ email: z.string().min(3).max(254) });

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenantDb } = await requireTenantDb();
    const rl = await checkRateLimit({ bucket: `account-email:tenant:${tenantDb.tenantId}`, windowSeconds: 600, limit: 5 });
    if (!rl.ok) return rateLimitedResponse(rl.retryAfter);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    const email = parsed.success ? normalizeEmail(parsed.data.email) : null;
    if (!email) return NextResponse.json({ error: 'bad_email', message: 'Enter a valid email address.' }, { status: 400 });
    const owner = await tenantIdForEmail(tenantDb.raw, email);
    if (owner && owner !== tenantDb.tenantId) return NextResponse.json({ error: 'in_use', message: 'That address is already used by another account.' }, { status: 409 });
    await issueCode(tenantDb.raw, { email, purpose: 'verify_email', tenantId: tenantDb.tenantId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    console.error('[account/email/start]', err);
    return NextResponse.json({ error: 'internal', message: 'The code could not be sent. Please try again.' }, { status: 500 });
  }
}
