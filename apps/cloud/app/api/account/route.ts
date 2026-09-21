/**
 * /api/account — the owner's account.
 *   GET   → { name, email, email_verified, passkeys, created_at, plan }
 *   PATCH { name? }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { listCredentialsForTenant } from '@/lib/webauthn';
import { posthog } from '@/lib/posthog';

export const runtime = 'nodejs';
const Patch = z.object({ name: z.string().trim().min(1).max(60).optional() });

export async function GET(): Promise<Response> {
  try {
    const { tenantDb } = await requireTenantDb();
    const [tenant, passkeys] = await Promise.all([tenantDb.getTenant(), listCredentialsForTenant(tenantDb.tenantId)]);
    if (!tenant) return NextResponse.json({ error: 'no_tenant' }, { status: 404 });
    return NextResponse.json({
      account: {
        name: tenant.displayName,
        email: tenant.email,
        email_verified: tenant.emailVerifiedAt !== null,
        passkeys: passkeys.map((p) => ({ id: p.id, nickname: p.nickname, created_at: p.createdAt.toISOString(), last_used_at: p.lastUsedAt?.toISOString() ?? null })),
        plan: tenant.plan,
        created_at: tenant.createdAt.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    const { tenantDb } = await requireTenantDb();
    const parsed = Patch.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'bad_request', message: 'Name must be 1–60 characters.' }, { status: 400 });
    if (parsed.data.name !== undefined) await tenantDb.updateTenant({ displayName: parsed.data.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
