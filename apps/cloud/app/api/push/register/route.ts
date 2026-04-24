/**
 * POST /api/push/register — mobile push-token registration.
 *
 * Session-authed; tenant-scoped via `TenantDb.upsertPushRegistration`.
 * Idempotent on `(tenant_id, device_token)`: re-registration from the same
 * device just updates platform + bundle_id + updated_at.
 *
 * Unblocks Phase-8 mobile scaffold (arp-mobile/lib/push/register.ts used to
 * log a 404 warning — slice 9b closes that conservative call).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTenantDb, AuthError } from '@/lib/tenant-context';

export const runtime = 'nodejs';

const Body = z.object({
  device_token: z.string().min(8).max(1024),
  platform: z.enum(['ios', 'android']),
  bundle_id: z.string().min(1).max(255),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { tenantDb } = await requireTenantDb();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'bad_request', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { device_token, platform, bundle_id } = parsed.data;

    const row = await tenantDb.upsertPushRegistration({
      deviceToken: device_token,
      platform,
      bundleId: bundle_id,
    });

    return NextResponse.json({ ok: true, registration_id: row.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
