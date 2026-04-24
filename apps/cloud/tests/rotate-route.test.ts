/**
 * POST /api/tenants/rotate — Phase 9d HKDF v1 → v2 identity rotation.
 *
 * End-to-end: generate two Ed25519 keypairs, register one as a tenant,
 * sign the canonical challenge with BOTH, submit, and assert the server
 * flips principal_did + principal_did_previous + v1_deprecated_at.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { createPgliteDb, tenants } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';
import {
  ed25519RawToMultibase,
  base64urlEncode,
} from '@kybernesis/arp-transport';
import { installCookieMock, installHeadersMock } from './helpers/cookies';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;

vi.mock('@/lib/db', async () => ({
  getDb: async () => {
    if (!currentDb) throw new Error('test db not initialised');
    return currentDb.db;
  },
}));

const cookieStore = installCookieMock();
installHeadersMock();

const { setSession } = await import('../lib/session');
const { POST, rotationChallenge } = await import('../app/api/tenants/rotate/route');

async function genKeypair(): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array; did: string; multibase: string }> {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  const multibase = ed25519RawToMultibase(pub);
  return { privateKey: priv, publicKey: pub, did: `did:key:${multibase}`, multibase };
}

async function seedTenantForDid(principalDid: string): Promise<string> {
  if (!currentDb) throw new Error('db gone');
  const rows = await currentDb.db
    .insert(tenants)
    .values({ principalDid })
    .returning({ id: tenants.id });
  return rows[0]!.id;
}

describe('POST /api/tenants/rotate', () => {
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
  });

  afterEach(async () => {
    if (currentDb) {
      await currentDb.close();
      currentDb = null;
    }
    cookieStore.clear();
  });

  async function post(body: unknown): Promise<Response> {
    return POST(
      new Request('http://test.local/api/tenants/rotate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  it('rotates v1 → v2 end-to-end with two valid signatures', async () => {
    const oldKey = await genKeypair();
    const newKey = await genKeypair();
    const tenantId = await seedTenantForDid(oldKey.did);
    await setSession(oldKey.did, tenantId, 'nonce-before-rotation');

    const issuedAt = Date.now();
    const challenge = rotationChallenge(oldKey.did, newKey.did, issuedAt);
    const oldSig = base64urlEncode(await ed25519.signAsync(challenge, oldKey.privateKey));
    const newSig = base64urlEncode(await ed25519.signAsync(challenge, newKey.privateKey));

    const res = await post({
      oldPrincipalDid: oldKey.did,
      newPrincipalDid: newKey.did,
      newPublicKeyMultibase: newKey.multibase,
      signatureOld: oldSig,
      signatureNew: newSig,
      issuedAt,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      oldPrincipalDid: string;
      newPrincipalDid: string;
      graceUntil: string;
    };
    expect(body.ok).toBe(true);
    expect(body.newPrincipalDid).toBe(newKey.did);
    expect(new Date(body.graceUntil).getTime()).toBeGreaterThan(Date.now());

    if (!currentDb) throw new Error('db gone');
    const row = (await currentDb.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId)))[0]!;
    expect(row.principalDid).toBe(newKey.did);
    expect(row.principalDidPrevious).toBe(oldKey.did);
    expect(row.v1DeprecatedAt).toBeInstanceOf(Date);
  });

  it('rejects when session principal does not match oldPrincipalDid', async () => {
    const oldKey = await genKeypair();
    const otherKey = await genKeypair();
    const newKey = await genKeypair();
    const tenantId = await seedTenantForDid(otherKey.did);
    // Session is for a DIFFERENT principal than the one we're trying to rotate.
    await setSession(otherKey.did, tenantId, 'nonce');

    const issuedAt = Date.now();
    const challenge = rotationChallenge(oldKey.did, newKey.did, issuedAt);
    const res = await post({
      oldPrincipalDid: oldKey.did,
      newPrincipalDid: newKey.did,
      newPublicKeyMultibase: newKey.multibase,
      signatureOld: base64urlEncode(await ed25519.signAsync(challenge, oldKey.privateKey)),
      signatureNew: base64urlEncode(await ed25519.signAsync(challenge, newKey.privateKey)),
      issuedAt,
    });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid old signature', async () => {
    const oldKey = await genKeypair();
    const newKey = await genKeypair();
    const otherKey = await genKeypair();
    const tenantId = await seedTenantForDid(oldKey.did);
    await setSession(oldKey.did, tenantId, 'nonce');

    const issuedAt = Date.now();
    const challenge = rotationChallenge(oldKey.did, newKey.did, issuedAt);
    const res = await post({
      oldPrincipalDid: oldKey.did,
      newPrincipalDid: newKey.did,
      newPublicKeyMultibase: newKey.multibase,
      // signed with the WRONG key
      signatureOld: base64urlEncode(await ed25519.signAsync(challenge, otherKey.privateKey)),
      signatureNew: base64urlEncode(await ed25519.signAsync(challenge, newKey.privateKey)),
      issuedAt,
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('old_signature_invalid');
  });

  it('rejects an invalid new signature', async () => {
    const oldKey = await genKeypair();
    const newKey = await genKeypair();
    const otherKey = await genKeypair();
    const tenantId = await seedTenantForDid(oldKey.did);
    await setSession(oldKey.did, tenantId, 'nonce');

    const issuedAt = Date.now();
    const challenge = rotationChallenge(oldKey.did, newKey.did, issuedAt);
    const res = await post({
      oldPrincipalDid: oldKey.did,
      newPrincipalDid: newKey.did,
      newPublicKeyMultibase: newKey.multibase,
      signatureOld: base64urlEncode(await ed25519.signAsync(challenge, oldKey.privateKey)),
      signatureNew: base64urlEncode(await ed25519.signAsync(challenge, otherKey.privateKey)),
      issuedAt,
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('new_signature_invalid');
  });

  it('rejects a mismatched new public key multibase', async () => {
    const oldKey = await genKeypair();
    const newKey = await genKeypair();
    const otherKey = await genKeypair();
    const tenantId = await seedTenantForDid(oldKey.did);
    await setSession(oldKey.did, tenantId, 'nonce');

    const issuedAt = Date.now();
    const challenge = rotationChallenge(oldKey.did, newKey.did, issuedAt);
    const res = await post({
      oldPrincipalDid: oldKey.did,
      newPrincipalDid: newKey.did,
      // declared pubkey is a different key than the newDid encodes
      newPublicKeyMultibase: otherKey.multibase,
      signatureOld: base64urlEncode(await ed25519.signAsync(challenge, oldKey.privateKey)),
      signatureNew: base64urlEncode(await ed25519.signAsync(challenge, newKey.privateKey)),
      issuedAt,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('new_pubkey_mismatch');
  });

  it('rejects when timestamps are outside the ±5-minute window', async () => {
    const oldKey = await genKeypair();
    const newKey = await genKeypair();
    const tenantId = await seedTenantForDid(oldKey.did);
    await setSession(oldKey.did, tenantId, 'nonce');

    const issuedAt = Date.now() - 10 * 60 * 1000; // 10 minutes ago
    const challenge = rotationChallenge(oldKey.did, newKey.did, issuedAt);
    const res = await post({
      oldPrincipalDid: oldKey.did,
      newPrincipalDid: newKey.did,
      newPublicKeyMultibase: newKey.multibase,
      signatureOld: base64urlEncode(await ed25519.signAsync(challenge, oldKey.privateKey)),
      signatureNew: base64urlEncode(await ed25519.signAsync(challenge, newKey.privateKey)),
      issuedAt,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('timestamp_out_of_window');
  });

  it('idempotent when the tenant has already rotated to the requested new DID', async () => {
    const oldKey = await genKeypair();
    const newKey = await genKeypair();
    const tenantId = await seedTenantForDid(newKey.did);
    // Simulate an already-completed rotation: session is under the NEW
    // principal, but caller replays with oldPrincipalDid = old key.
    // The session check requires session.principalDid == oldPrincipalDid,
    // so we set the session to the old key (mid-rotation retry scenario
    // where the client hasn't refreshed yet).
    await setSession(oldKey.did, tenantId, 'nonce');
    if (!currentDb) throw new Error('db gone');
    await currentDb.db
      .update(tenants)
      .set({ principalDid: newKey.did, principalDidPrevious: oldKey.did, v1DeprecatedAt: new Date() })
      .where(eq(tenants.id, tenantId));

    const issuedAt = Date.now();
    const challenge = rotationChallenge(oldKey.did, newKey.did, issuedAt);
    const res = await post({
      oldPrincipalDid: oldKey.did,
      newPrincipalDid: newKey.did,
      newPublicKeyMultibase: newKey.multibase,
      signatureOld: base64urlEncode(await ed25519.signAsync(challenge, oldKey.privateKey)),
      signatureNew: base64urlEncode(await ed25519.signAsync(challenge, newKey.privateKey)),
      issuedAt,
    });
    // Either the pre-rotation guard fires (session principal doesn't match
    // current principal_did) or the idempotency short-circuit fires. This
    // test exercises the idempotent path because we deliberately set the
    // session to the old DID.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { already_rotated?: boolean };
    expect(body.already_rotated).toBe(true);
  });
});
