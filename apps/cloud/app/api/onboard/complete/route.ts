/**
 * POST /api/onboard/complete — best-effort update of an onboarding_sessions
 * row with the resolved principal DID once the /onboard client has minted a
 * did:key and created a tenant. Lets a future login reconcile a tab-closed
 * mid-flow session with the tenant the user actually created.
 *
 * No auth: the session id is an unpredictable UUID carried in the page's
 * render props. Spoofing requires leaking the id, and the worst case is an
 * attacker marks an unrelated session as "completed by" their principal,
 * which does not grant them tenant access (tenants are keyed on principal
 * DID via `POST /api/tenants`, not on this row).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { onboardingSessions } from '@kybernesis/arp-cloud-db';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

const DID_REGEX = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({
  sessionId: z.string().regex(UUID_REGEX),
  principalDid: z.string().regex(DID_REGEX),
});

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const db = await getDb();
  await db
    .update(onboardingSessions)
    .set({ principalDid: parsed.data.principalDid })
    .where(eq(onboardingSessions.id, parsed.data.sessionId));
  return NextResponse.json({ ok: true });
}
