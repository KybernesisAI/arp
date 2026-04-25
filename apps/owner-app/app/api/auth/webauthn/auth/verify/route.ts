import { NextResponse } from 'next/server';
import { RuntimeClient } from '@/lib/runtime-client';
import { setSession } from '@/lib/session';

export const runtime = 'nodejs';

interface VerifyBody {
  response: unknown;
}

/**
 * Unauthenticated proxy to `POST /admin/webauthn/auth/verify`. On
 * successful sidecar verification, mint a session cookie bound to the
 * principal DID the sidecar reported back. Mirrors the shape of
 * `POST /api/auth/verify` (did:key sign-in) so downstream session checks
 * work unchanged.
 */
export async function POST(req: Request) {
  let body: VerifyBody;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || !body.response) {
    return NextResponse.json({ error: 'missing_response' }, { status: 400 });
  }
  let result;
  try {
    result = await new RuntimeClient().webauthnAuthVerify({ response: body.response });
  } catch (err) {
    return NextResponse.json(
      { error: 'auth_verify_failed', reason: (err as Error).message },
      { status: 401 },
    );
  }
  // The sidecar's verify endpoint already consumes the challenge — it's our
  // single source of truth that this credential controls the agent. Use the
  // credential id as the session nonce so a subsequent /api/auth/verify
  // (did:key path) cannot replay it.
  const session = await setSession(result.principalDid, `passkey:${result.credentialId}`);
  return NextResponse.json({
    ok: true,
    session,
    principalDid: result.principalDid,
    agentDid: result.agentDid,
  });
}
