/**
 * POST /api/tenants — Phase-8.5 account bootstrap.
 *
 * A browser-generated principal (did:key) posts its public key and the user's
 * confirmation that they have saved the recovery phrase. The server validates
 * that `did:key:z<X>` actually decodes to the supplied `publicKeyMultibase`
 * (no free-rider spoofing), creates or reuses a tenant row, issues a session
 * cookie, and returns the tenant id.
 *
 * This is additive — the handoff-bundle flow (`POST /api/agents`) stays live
 * for sovereign-sidecar users who already hold a keypair in their sidecar
 * keystore.
 */

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { tenants } from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { setSession } from '@/lib/session';
import { decodeDidKeyPublicKey } from '@/lib/principal-keys';
import { multibaseEd25519ToRaw } from '@kybernesis/arp-transport';
import { posthog } from '@/lib/posthog';

export const runtime = 'nodejs';

const DID_REGEX = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/;

const Body = z.object({
  principalDid: z.string().regex(DID_REGEX),
  publicKeyMultibase: z.string().startsWith('z').min(2),
  recoveryPhraseConfirmed: z.literal(true),
});

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { principalDid, publicKeyMultibase, recoveryPhraseConfirmed } = parsed.data;
  if (!recoveryPhraseConfirmed) {
    return NextResponse.json({ error: 'recovery_phrase_not_confirmed' }, { status: 400 });
  }

  // Spoof guard: the supplied pubkey must match the did:key payload exactly.
  // For non-did:key DIDs (e.g. did:web) we cannot verify the pubkey inline
  // and reject — Phase-8.5 onboarding is did:key-only. Sidecar migrations use
  // the POST /api/agents path, which has its own verification flow.
  if (!principalDid.startsWith('did:key:')) {
    return NextResponse.json(
      { error: 'principal_not_did_key', hint: 'use POST /api/agents for sidecar migration' },
      { status: 400 },
    );
  }
  const didKeyPub = decodeDidKeyPublicKey(principalDid);
  if (!didKeyPub) {
    return NextResponse.json({ error: 'principal_did_not_decodable' }, { status: 400 });
  }
  let suppliedPub: Uint8Array;
  try {
    suppliedPub = multibaseEd25519ToRaw(publicKeyMultibase);
  } catch {
    return NextResponse.json({ error: 'public_key_multibase_invalid' }, { status: 400 });
  }
  if (!bytesEqual(didKeyPub, suppliedPub)) {
    return NextResponse.json({ error: 'did_key_pubkey_mismatch' }, { status: 400 });
  }

  const db = await getDb();
  // Idempotency: return the existing tenant if one already exists for this
  // principal. Don't attempt to merge display name / plan — that stays in
  // the tenant's settings flow.
  const existing = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.principalDid, principalDid))
    .limit(1);
  let tenantId: string | null = existing[0]?.id ?? null;
  const isNewTenant = !tenantId;

  if (!tenantId) {
    const inserted = await db
      .insert(tenants)
      .values({ principalDid, plan: 'free', status: 'active' })
      .returning({ id: tenants.id });
    tenantId = inserted[0]?.id ?? null;
  }
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_create_failed' }, { status: 500 });
  }

  // Issue a session cookie. The nonce field is a freshness marker on the
  // session itself (see `apps/cloud/lib/session.ts`); it is not tied to a
  // consumed challenge here because this route creates its own session
  // outside the challenge/verify flow.
  const nonce = randomBytes(16).toString('base64url');
  await setSession(principalDid, tenantId, nonce);

  if (isNewTenant) {
    posthog.identify({
      distinctId: principalDid,
      properties: {
        $set: { tenant_id: tenantId, plan: 'free' },
        $set_once: { first_seen: new Date().toISOString() },
      },
    });
    posthog.capture({
      distinctId: principalDid,
      event: 'tenant_signed_up',
      properties: { tenant_id: tenantId },
    });
  }

  return NextResponse.json({ ok: true, tenantId, principalDid });
}
