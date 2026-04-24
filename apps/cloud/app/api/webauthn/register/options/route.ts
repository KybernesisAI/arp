/**
 * POST /api/webauthn/register/options — Phase 9d passkey registration kickoff.
 *
 * Session-authed: the caller must already own a tenant (via did:key sign-in
 * or the onboarding flow). Returns WebAuthn creation options the browser can
 * hand to `navigator.credentials.create()` via @simplewebauthn/browser.
 *
 * The challenge is persisted server-side (60s TTL) so the verify step is a
 * true one-time lookup: replays fail consume, not just the signature check.
 */

import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { requireTenantDb, AuthError } from '@/lib/tenant-context';
import { checkRateLimit, clientIpFromRequest, rateLimitedResponse } from '@/lib/rate-limit';
import {
  listCredentialsForTenant,
  persistChallenge,
  webauthnConfig,
} from '@/lib/webauthn';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenantDb } = await requireTenantDb();

    // Rate-limit: 10/min per IP. Registration-options requests are
    // cheap but a sustained burst suggests enumeration.
    const ip = clientIpFromRequest(req);
    const limitResult = await checkRateLimit({
      bucket: `webauthn-register-options:ip:${ip}`,
      windowSeconds: 60,
      limit: 10,
    });
    if (!limitResult.ok) {
      return rateLimitedResponse(limitResult.retryAfter);
    }

    const { rpId, rpName } = webauthnConfig();
    const existing = await listCredentialsForTenant(tenantDb.tenantId);
    const excludeCredentials = existing.map((cred) => ({
      id: cred.credentialId,
      transports: cred.transports as AuthenticatorTransportFuture[],
    }));

    const tenantRow = await tenantDb.getTenant();
    const userName = tenantRow?.displayName ?? tenantRow?.principalDid ?? tenantDb.tenantId;

    const options = await generateRegistrationOptions({
      rpName,
      rpID: rpId,
      userName,
      userID: new TextEncoder().encode(tenantDb.tenantId),
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        requireResidentKey: false,
        userVerification: 'preferred',
      },
    });

    // Persist the challenge SimpleWebAuthn chose — the authenticator signs
    // over the exact base64url string returned in `options.challenge`, and
    // `verifyRegistrationResponse` expects the same value back.
    await persistChallenge(options.challenge, 'register', tenantDb.tenantId);

    return NextResponse.json(options);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
