import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as ed25519 from '@noble/ed25519';
import { base64urlDecode } from '@kybernesis/arp-transport';
import { consumeChallenge } from '@/lib/challenge-store';
import { publicKeyForPrincipal } from '@/lib/principal-keys';
import { setSession } from '@/lib/session';

const Body = z.object({
  nonce: z.string().min(1),
  signature: z.string().min(1),
});

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const { nonce, signature } = parsed.data;

  const record = consumeChallenge(nonce);
  if (!record) {
    return NextResponse.json(
      { error: 'unknown_or_expired_nonce' },
      { status: 401 },
    );
  }

  const publicKey = publicKeyForPrincipal(record.principalDid);
  if (!publicKey) {
    return NextResponse.json(
      { error: 'principal_not_registered' },
      { status: 500 },
    );
  }

  let sigBytes: Uint8Array;
  try {
    sigBytes = base64urlDecode(signature);
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  const nonceBytes = new TextEncoder().encode(nonce);
  let ok = false;
  try {
    ok = await ed25519.verifyAsync(sigBytes, nonceBytes, publicKey);
  } catch {
    ok = false;
  }
  if (!ok) {
    return NextResponse.json({ error: 'signature_verify_failed' }, { status: 401 });
  }

  const session = await setSession(record.principalDid, nonce);
  return NextResponse.json({ ok: true, session });
}
