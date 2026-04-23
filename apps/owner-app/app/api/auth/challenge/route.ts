import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { issueChallenge } from '@/lib/challenge-store';
import { configuredPrincipalDid } from '@/lib/principal-keys';

/**
 * Accepts any syntactically valid DID as the principal (did:key, did:web,
 * etc.). Issues a nonce bound to that DID for 5 minutes. The /verify route
 * is the integrity point — it decodes did:key pubkeys inline and falls back
 * to the fixture `principals.json` table for legacy DIDs.
 */
const DID_REGEX = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/;

const Body = z.object({
  principalDid: z
    .string()
    .min(1)
    .regex(DID_REGEX, 'principalDid must be a syntactically valid DID')
    .optional(),
});

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const principalDid = parsed.data.principalDid ?? configuredPrincipalDid();
  const nonce = randomBytes(24).toString('base64url');
  issueChallenge(principalDid, nonce);
  return NextResponse.json({
    nonce,
    principalDid,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}
