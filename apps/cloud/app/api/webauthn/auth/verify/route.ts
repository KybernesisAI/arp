/**
 * POST /api/webauthn/auth/verify — Phase 9d passkey sign-in completion.
 *
 * Unauthed on entry. Verifies the assertion, bumps the stored signature
 * counter, and issues a session cookie bound to the credential's tenant.
 * The session's `authMethod` is set to 'webauthn' so downstream features
 * (rotation, sensitive-action prompts) can distinguish it from a did:key
 * challenge/verify login.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { eq } from 'drizzle-orm';
import { tenants } from '@kybernesis/arp-cloud-db';
import { getDb } from '@/lib/db';
import {
  bumpCredentialCounter,
  consumeChallenge,
  findCredentialByCredentialId,
  webauthnConfig,
} from '@/lib/webauthn';
import { setSession } from '@/lib/session';

export const runtime = 'nodejs';

const Body = z.object({
  response: z.custom<AuthenticationResponseJSON>(
    (v) => typeof v === 'object' && v !== null && 'id' in v && 'response' in v,
    { message: 'expected WebAuthn AuthenticationResponseJSON' },
  ),
});

export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { response } = parsed.data;

  const { rpId, origins } = webauthnConfig();
  const clientChallenge = decodeClientDataChallenge(response.response.clientDataJSON);
  if (!clientChallenge) {
    return NextResponse.json({ error: 'missing_challenge' }, { status: 400 });
  }

  const consumed = await consumeChallenge(clientChallenge, 'auth');
  if (!consumed) {
    return NextResponse.json({ error: 'unknown_or_expired_challenge' }, { status: 401 });
  }

  const credential = await findCredentialByCredentialId(response.id);
  if (!credential) {
    return NextResponse.json({ error: 'unknown_credential' }, { status: 401 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: clientChallenge,
      expectedOrigin: origins,
      expectedRPID: rpId,
      credential: {
        id: credential.credentialId,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports as AuthenticatorTransportFuture[],
      },
      requireUserVerification: false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'verification_failed', detail: (err as Error).message },
      { status: 401 },
    );
  }
  if (!verification.verified) {
    return NextResponse.json({ error: 'verification_failed' }, { status: 401 });
  }

  const newCounter = verification.authenticationInfo.newCounter;
  // Counter regression = cloned authenticator. Reject and DO NOT bump.
  if (newCounter > 0 && newCounter <= credential.counter) {
    return NextResponse.json({ error: 'counter_regression' }, { status: 401 });
  }
  await bumpCredentialCounter(credential.credentialId, newCounter);

  // Resolve the tenant's current principal DID (HKDF rotation may have moved
  // it since the passkey was registered — passkey is the authenticator, not
  // the identity). Session rides under the live `principal_did`.
  const db = await getDb();
  const tenantRows = await db
    .select({ principalDid: tenants.principalDid })
    .from(tenants)
    .where(eq(tenants.id, credential.tenantId))
    .limit(1);
  const principalDid = tenantRows[0]?.principalDid;
  if (!principalDid) {
    return NextResponse.json({ error: 'tenant_not_found' }, { status: 500 });
  }

  const nonce = randomBytes(16).toString('base64url');
  const session = await setSession(principalDid, credential.tenantId, nonce);

  return NextResponse.json({
    ok: true,
    session,
    tenantId: credential.tenantId,
    principalDid,
    authMethod: 'webauthn',
  });
}

function decodeClientDataChallenge(clientDataJSON: string): string | null {
  try {
    const json = Buffer.from(clientDataJSON, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as { challenge?: unknown };
    return typeof parsed.challenge === 'string' ? parsed.challenge : null;
  } catch {
    return null;
  }
}
