import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { issueChallenge } from '@/lib/challenge-store';
import { configuredPrincipalDid } from '@/lib/principal-keys';

const Body = z.object({ principalDid: z.string().min(1).optional() });

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
