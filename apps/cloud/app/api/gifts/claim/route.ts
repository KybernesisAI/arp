/**
 * POST /api/gifts/claim { token } — accept a gifted name into the signed-in account.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { claimGift, GiftError } from '@/lib/name-gifts';
import { posthog, track } from '@/lib/posthog';

export const runtime = 'nodejs';

const Body = z.object({ token: z.string().min(16).max(128) });

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenantDb, session, db } = await requireTenantDb();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'bad_request', message: 'This gift link is not valid.' }, { status: 400 });
    const result = await claimGift({ db, token: parsed.data.token, toTenantId: tenantDb.tenantId, toPrincipalDid: session.principalDid });
    track({ distinctId: session.principalDid, event: 'agentid_name_gift_claimed', properties: { tenant_id: tenantDb.tenantId, domain: result.domain, identity: result.identity } });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof GiftError) return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    posthog.captureException(err);
    console.error('[gifts/claim]', err);
    return NextResponse.json({ error: 'internal', message: 'The gift could not be accepted. Please try again.' }, { status: 500 });
  }
}
