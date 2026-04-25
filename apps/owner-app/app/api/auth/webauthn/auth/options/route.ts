import { NextResponse } from 'next/server';
import { RuntimeClient } from '@/lib/runtime-client';

export const runtime = 'nodejs';

/**
 * Unauthenticated proxy to `POST /admin/webauthn/auth/options` on the
 * sidecar. Pre-session by design — the user is signing in, so they have
 * no session cookie yet. The owner-app server holds the bearer token
 * and proxies on their behalf.
 */
export async function POST() {
  try {
    const options = await new RuntimeClient().webauthnAuthOptions();
    return NextResponse.json(options);
  } catch (err) {
    return NextResponse.json(
      { error: 'auth_options_failed', reason: (err as Error).message },
      { status: 502 },
    );
  }
}
