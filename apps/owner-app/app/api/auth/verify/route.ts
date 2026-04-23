import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as ed25519 from '@noble/ed25519';
import { base64urlDecode, multibaseEd25519ToRaw } from '@kybernesis/arp-transport';
import { consumeChallenge } from '@/lib/challenge-store';
import { publicKeyForPrincipal } from '@/lib/principal-keys';
import { setSession } from '@/lib/session';

const Body = z.object({
  principalDid: z.string().min(1).optional(),
  nonce: z.string().min(1),
  signature: z.string().min(1),
});

export const runtime = 'nodejs';

/**
 * Verifies the signature over the challenge nonce and, on success, sets the
 * session cookie. Pubkey lookup:
 * 1. If the principal DID is a `did:key:z...`, decode the pubkey inline from
 *    the DID string itself (Phase 8.5 browser-generated path).
 * 2. Else fall back to the fixture table in `principals.json` (legacy / dev).
 *
 * TODO(phase-9): once `@kybernesis/arp-resolver::parseDidKey` lands, swap the
 * inline decode for that call so the logic lives in one place.
 */
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

  // Clients may optionally include the principalDid as a defensive check.
  // The challenge record is the authoritative binding.
  if (parsed.data.principalDid && parsed.data.principalDid !== record.principalDid) {
    return NextResponse.json(
      { error: 'principal_mismatch' },
      { status: 400 },
    );
  }

  const publicKey = publicKeyForDid(record.principalDid);
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

function publicKeyForDid(did: string): Uint8Array | null {
  if (did.startsWith('did:key:')) {
    const multibase = did.slice('did:key:'.length);
    if (!multibase.startsWith('z')) return null;
    try {
      return multibaseEd25519ToRaw(multibase);
    } catch {
      return null;
    }
  }
  return publicKeyForPrincipal(did);
}
