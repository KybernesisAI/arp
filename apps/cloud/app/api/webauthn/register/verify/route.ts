/**
 * POST /api/webauthn/register/verify — Phase 9d passkey registration completion.
 *
 * Session-authed; verifies the attestation response from the browser, consumes
 * the paired challenge, and persists the new credential under the caller's
 * tenant. Idempotency on credentialId is enforced by the unique index — a
 * re-registration of the same passkey returns a 409.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { requireTenantDb, AuthError } from '@/lib/tenant-context';
import { consumeChallenge, insertCredential, webauthnConfig } from '@/lib/webauthn';
import { posthog } from '@/lib/posthog';

export const runtime = 'nodejs';

const Body = z.object({
  response: z.custom<RegistrationResponseJSON>(
    (v) => typeof v === 'object' && v !== null && 'id' in v && 'response' in v,
    { message: 'expected WebAuthn RegistrationResponseJSON' },
  ),
  nickname: z.string().trim().min(1).max(64).nullish(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenantDb } = await requireTenantDb();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'bad_request', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { response, nickname } = parsed.data;

    const { rpId, origins } = webauthnConfig();
    const clientChallenge = decodeClientDataChallenge(response.response.clientDataJSON);
    if (!clientChallenge) {
      return NextResponse.json({ error: 'missing_challenge' }, { status: 400 });
    }

    // Consume the challenge atomically BEFORE verifying so a replay of the
    // same attestation loses the race (even if the attestation signature
    // itself is valid).
    const challengeRow = await consumeChallenge(clientChallenge, 'register');
    if (!challengeRow) {
      return NextResponse.json({ error: 'unknown_or_expired_challenge' }, { status: 400 });
    }
    if (challengeRow.tenantId !== tenantDb.tenantId) {
      return NextResponse.json({ error: 'challenge_tenant_mismatch' }, { status: 403 });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: clientChallenge,
        expectedOrigin: origins,
        expectedRPID: rpId,
        requireUserVerification: false,
      });
    } catch (err) {
      return NextResponse.json(
        { error: 'verification_failed', detail: (err as Error).message },
        { status: 400 },
      );
    }
    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'verification_failed' }, { status: 400 });
    }
    const { credential } = verification.registrationInfo;

    try {
      const row = await insertCredential({
        tenantId: tenantDb.tenantId,
        credentialId: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports ?? [],
        nickname: nickname ?? null,
      });
      posthog.capture({
        distinctId: tenantDb.tenantId,
        event: 'passkey_registered',
        properties: {
          tenant_id: tenantDb.tenantId,
          has_nickname: !!nickname,
          transports: credential.transports ?? [],
        },
      });
      return NextResponse.json({
        ok: true,
        credentialId: row.credentialId,
        id: row.id,
      });
    } catch (err) {
      // Unique constraint on credential_id — already registered.
      const msg = (err as Error).message ?? '';
      if (/user_credentials_credential_id|duplicate key|UNIQUE constraint/i.test(msg)) {
        return NextResponse.json({ error: 'credential_already_registered' }, { status: 409 });
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

/**
 * Extract the `challenge` field from the authenticator's base64url-encoded
 * clientDataJSON. We do this ourselves (instead of trusting the server-side
 * verifier's internal parse) so the consume step can key on a known string
 * BEFORE @simplewebauthn runs its own checks — ensures the rate-limit +
 * consume paths run even for malformed attestations.
 */
function decodeClientDataChallenge(clientDataJSON: string): string | null {
  try {
    const json = Buffer.from(clientDataJSON, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as { challenge?: unknown };
    return typeof parsed.challenge === 'string' ? parsed.challenge : null;
  } catch {
    return null;
  }
}
