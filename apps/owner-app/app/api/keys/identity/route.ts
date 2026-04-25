import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';

export const runtime = 'nodejs';

/**
 * Session-authed proxy to `GET /admin/identity` — returns the sidecar's
 * current + previous principal DIDs + grace expiry. Drives the rotation
 * panel's status banner.
 */
export async function GET() {
  if (!(await getSession())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const body = await new RuntimeClient().getIdentity();
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      { error: 'identity_fetch_failed', reason: (err as Error).message },
      { status: 502 },
    );
  }
}
