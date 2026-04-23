import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { issueChallenge } from '@/lib/challenge-store';

export const runtime = 'nodejs';

const Body = z.object({ principalDid: z.string().min(1) });

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const nonce = randomBytes(24).toString('base64url');
  issueChallenge(parsed.data.principalDid, nonce);
  return NextResponse.json({
    nonce,
    principalDid: parsed.data.principalDid,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}
