/**
 * POST /api/onboard/complete — session-authed update of an onboarding_sessions
 * row with the resolved principal DID once the /onboard client has minted a
 * did:key and created a tenant. Lets a future login reconcile a tab-closed
 * mid-flow session with the tenant the user actually created.
 *
 * Auth: `arp_cloud_session` cookie (issued by `POST /api/tenants` earlier in
 * the same /onboard flow). The body's `principalDid` must match the session's
 * principal — we never blindly write whatever the client claims.
 *
 * Pre-tenant scoping: `onboarding_sessions` rows are not tenant-scoped (they
 * exist before tenant creation completes); the session cookie is still the
 * correct identity proof because its `principalDid` is what will populate the
 * row.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { onboardingSessions } from '@kybernesis/arp-cloud-db';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

const DID_REGEX = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({
  sessionId: z.string().regex(UUID_REGEX),
  principalDid: z.string().regex(DID_REGEX),
});

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  // The client's claimed principal DID must be rooted in the session's
  // principal. We allow the cloud-managed did:web alias as a superset of
  // the raw did:key (the alias tail is the tenantId, which is also in the
  // session), so accept either.
  if (
    parsed.data.principalDid !== session.principalDid &&
    parsed.data.principalDid !== `did:web:arp.cloud:u:${session.tenantId ?? ''}`
  ) {
    return NextResponse.json({ error: 'principal_mismatch' }, { status: 403 });
  }
  const db = await getDb();
  await db
    .update(onboardingSessions)
    .set({ principalDid: parsed.data.principalDid })
    .where(eq(onboardingSessions.id, parsed.data.sessionId));
  return NextResponse.json({ ok: true });
}
