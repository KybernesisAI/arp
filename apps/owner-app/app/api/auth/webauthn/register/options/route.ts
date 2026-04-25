import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';

export const runtime = 'nodejs';

/**
 * Session-authed proxy to `POST /admin/webauthn/register/options` on the
 * sidecar. The bearer token never leaves the server.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const options = await new RuntimeClient().webauthnRegisterOptions();
    return NextResponse.json(options);
  } catch (err) {
    return NextResponse.json(
      { error: 'register_options_failed', reason: (err as Error).message },
      { status: 502 },
    );
  }
}
