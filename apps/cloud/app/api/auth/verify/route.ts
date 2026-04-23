import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as ed25519 from '@noble/ed25519';
import { base64urlDecode } from '@kybernesis/arp-transport';
import { consumeChallenge } from '@/lib/challenge-store';
import { publicKeyForPrincipal } from '@/lib/principal-keys';
import { setSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { tenants } from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

const Body = z.object({
  principalDid: z.string().min(1),
  nonce: z.string().min(1),
  signature: z.string().min(1),
});

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const { principalDid, nonce, signature } = parsed.data;
  const record = consumeChallenge(nonce);
  if (!record || record.principalDid !== principalDid) {
    return NextResponse.json({ error: 'unknown_or_expired_nonce' }, { status: 401 });
  }
  const publicKey = publicKeyForPrincipal(principalDid);
  if (!publicKey) {
    return NextResponse.json({ error: 'principal_not_registered' }, { status: 500 });
  }
  let sigBytes: Uint8Array;
  try {
    sigBytes = base64urlDecode(signature);
  } catch {
    return NextResponse.json({ error: 'bad_signature_encoding' }, { status: 400 });
  }
  const ok = await ed25519.verifyAsync(sigBytes, new TextEncoder().encode(nonce), publicKey);
  if (!ok) {
    return NextResponse.json({ error: 'signature_verify_failed' }, { status: 401 });
  }

  const db = await getDb();
  const rows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.principalDid, principalDid))
    .limit(1);
  const tenantId = rows[0]?.id ?? null;
  const session = await setSession(principalDid, tenantId, nonce);
  return NextResponse.json({ ok: true, session });
}
