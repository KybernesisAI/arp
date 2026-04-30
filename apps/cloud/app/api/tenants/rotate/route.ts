/**
 * POST /api/tenants/rotate — Phase 9d principal-key rotation (v1 → v2).
 *
 * User-initiated identity rotation. The caller proves control of BOTH the
 * old AND new DID by signing a canonical challenge with each key. Server
 * records the old DID as `principal_did_previous` (retained for the 90-day
 * grace window so pre-rotation audit-log signatures still verify) and
 * promotes the new DID to `principal_did`. A fresh session cookie is
 * issued under the new DID.
 *
 * The passkey is the authenticator in Phase 9d, but rotation requires
 * cryptographic proof of control over the KEYS, not just authenticator
 * presence — hence the double signature. Passkey sign-in resolves who is
 * making the request; the signatures prove what DIDs they can rotate.
 */

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import * as ed25519 from '@noble/ed25519';
import { base64urlDecode, multibaseEd25519ToRaw } from '@kybernesis/arp-transport';
import { tenants } from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { requireTenantDb, AuthError } from '@/lib/tenant-context';
import { decodeDidKeyPublicKey } from '@/lib/principal-keys';
import { setSession } from '@/lib/session';
import { posthog } from '@/lib/posthog';

export const runtime = 'nodejs';

const Body = z.object({
  oldPrincipalDid: z.string().startsWith('did:key:'),
  newPrincipalDid: z.string().startsWith('did:key:'),
  newPublicKeyMultibase: z.string().startsWith('z').min(2),
  signatureOld: z.string().min(1),
  signatureNew: z.string().min(1),
  issuedAt: z.number().int(),
});

// Rotation challenges are valid for 5 minutes — long enough that a user on
// a flaky connection can retry, short enough to contain replays.
const ROTATION_WINDOW_MS = 5 * 60 * 1000;

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Canonical challenge the caller signs with BOTH keys. Includes the old DID,
 * the new DID, and a client-supplied timestamp (clamped to ±5 min) so a
 * replay of an older pair-of-signatures cannot resurrect a retired DID.
 */
export function rotationChallenge(
  oldDid: string,
  newDid: string,
  issuedAtMs: number,
): Uint8Array {
  const payload = `arp-rotate-v1:${oldDid}:${newDid}:${issuedAtMs}`;
  return new TextEncoder().encode(payload);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenantDb, session } = await requireTenantDb();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'bad_request', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const {
      oldPrincipalDid,
      newPrincipalDid,
      newPublicKeyMultibase,
      signatureOld,
      signatureNew,
      issuedAt,
    } = parsed.data;

    if (oldPrincipalDid === newPrincipalDid) {
      return NextResponse.json({ error: 'dids_identical' }, { status: 400 });
    }

    // Clamp the timestamp to ±ROTATION_WINDOW_MS around now.
    const now = Date.now();
    if (Math.abs(now - issuedAt) > ROTATION_WINDOW_MS) {
      return NextResponse.json({ error: 'timestamp_out_of_window' }, { status: 400 });
    }

    // The OLD DID must match the session's principal (i.e. the logged-in
    // user is rotating their own identity). Passkey-based sessions resolve
    // principal_did through the credential's tenant, so this also works
    // for post-passkey-migration users.
    if (session.principalDid !== oldPrincipalDid) {
      return NextResponse.json({ error: 'session_principal_mismatch' }, { status: 403 });
    }

    // Decode both DIDs' embedded public keys.
    const oldPub = decodeDidKeyPublicKey(oldPrincipalDid);
    if (!oldPub) {
      return NextResponse.json({ error: 'old_did_not_decodable' }, { status: 400 });
    }
    const newPubFromDid = decodeDidKeyPublicKey(newPrincipalDid);
    if (!newPubFromDid) {
      return NextResponse.json({ error: 'new_did_not_decodable' }, { status: 400 });
    }
    // Supplied pubkey multibase must match the new did:key payload exactly —
    // prevents a caller from rotating to a DID they don't actually control.
    let newPubFromMultibase: Uint8Array;
    try {
      newPubFromMultibase = multibaseEd25519ToRaw(newPublicKeyMultibase);
    } catch {
      return NextResponse.json({ error: 'new_public_key_multibase_invalid' }, { status: 400 });
    }
    if (!bytesEqual(newPubFromDid, newPubFromMultibase)) {
      return NextResponse.json({ error: 'new_pubkey_mismatch' }, { status: 400 });
    }

    // Verify BOTH signatures against the canonical challenge.
    const challenge = rotationChallenge(oldPrincipalDid, newPrincipalDid, issuedAt);
    let oldSig: Uint8Array;
    let newSig: Uint8Array;
    try {
      oldSig = base64urlDecode(signatureOld);
      newSig = base64urlDecode(signatureNew);
    } catch {
      return NextResponse.json({ error: 'signature_encoding_invalid' }, { status: 400 });
    }
    const oldOk = await ed25519.verifyAsync(oldSig, challenge, oldPub);
    if (!oldOk) {
      return NextResponse.json({ error: 'old_signature_invalid' }, { status: 401 });
    }
    const newOk = await ed25519.verifyAsync(newSig, challenge, newPubFromDid);
    if (!newOk) {
      return NextResponse.json({ error: 'new_signature_invalid' }, { status: 401 });
    }

    // Persist rotation. Use the raw client so we can update the principal_did
    // uniqueness column without the TenantDb wrapper (which intentionally
    // doesn't expose the rotation shape — it's rare and privileged).
    const db = await getDb();
    const tenantId = tenantDb.tenantId;

    // Idempotency: if principal_did is already the new DID, treat as a no-op.
    const current = await db
      .select({ principalDid: tenants.principalDid })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    const currentDid = current[0]?.principalDid;
    if (currentDid === newPrincipalDid) {
      // Reissue session so the client still gets a fresh cookie under the
      // new DID (useful when a mid-rotation refresh left the client out of
      // sync with the DB).
      const nonce = randomBytes(16).toString('base64url');
      const sessionOut = await setSession(newPrincipalDid, tenantId, nonce);
      return NextResponse.json({
        ok: true,
        already_rotated: true,
        newPrincipalDid,
        session: sessionOut,
      });
    }

    try {
      await db
        .update(tenants)
        .set({
          principalDid: newPrincipalDid,
          principalDidPrevious: oldPrincipalDid,
          v1DeprecatedAt: new Date(now),
          updatedAt: new Date(now),
        })
        .where(eq(tenants.id, tenantId));
    } catch (err) {
      const msg = (err as Error).message ?? '';
      // Unique violation on principal_did — someone else already holds
      // the new DID. Reject rather than clobber.
      if (/unique|duplicate/i.test(msg)) {
        return NextResponse.json(
          { error: 'new_did_already_claimed' },
          { status: 409 },
        );
      }
      throw err;
    }

    const nonce = randomBytes(16).toString('base64url');
    const sessionOut = await setSession(newPrincipalDid, tenantId, nonce);
    posthog.capture({
      distinctId: newPrincipalDid,
      event: 'principal_key_rotated',
      properties: {
        tenant_id: tenantId,
        old_principal_did: oldPrincipalDid,
        new_principal_did: newPrincipalDid,
      },
    });
    return NextResponse.json({
      ok: true,
      oldPrincipalDid,
      newPrincipalDid,
      graceUntil: new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString(),
      session: sessionOut,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    posthog.captureException(err);
    throw err;
  }
}
