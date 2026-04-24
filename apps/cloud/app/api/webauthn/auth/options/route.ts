/**
 * POST /api/webauthn/auth/options — Phase 9d pre-session passkey sign-in.
 *
 * Unauthed. Produces a challenge that the browser hands to
 * `navigator.credentials.get()` via @simplewebauthn/browser. Uses
 * discoverable-credentials by default (allowCredentials empty), so a user
 * with a resident key on their device is prompted without ever typing an
 * identifier. We accept this tradeoff: the pre-session surface has no
 * tenant id yet, so we can't narrow the allow-list anyway.
 */

import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { checkRateLimit, clientIpFromRequest, rateLimitedResponse } from '@/lib/rate-limit';
import { persistChallenge, webauthnConfig } from '@/lib/webauthn';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  // Rate-limit: 10/min per IP. This is pre-session, so keyed on IP only.
  const ip = clientIpFromRequest(req);
  const limitResult = await checkRateLimit({
    bucket: `webauthn-auth-options:ip:${ip}`,
    windowSeconds: 60,
    limit: 10,
  });
  if (!limitResult.ok) {
    return rateLimitedResponse(limitResult.retryAfter);
  }

  const { rpId } = webauthnConfig();

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    userVerification: 'preferred',
    // No allowCredentials → discoverable-credential flow. The authenticator
    // picks a resident key; the verify step resolves it server-side.
  });

  // tenantId = null — we don't know the caller's tenant until they sign.
  await persistChallenge(options.challenge, 'auth', null);

  return NextResponse.json(options);
}
