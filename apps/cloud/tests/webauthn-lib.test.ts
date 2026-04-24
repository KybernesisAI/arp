/**
 * Unit tests for lib/webauthn.ts — challenge persistence + consumption
 * atomicity + credential CRUD. These are the primitives the four
 * WebAuthn routes depend on, so we cover them independently.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPgliteDb, tenants, webauthnChallenges } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';
process.env['WEBAUTHN_RP_ID'] = 'localhost';
process.env['WEBAUTHN_ORIGINS'] = 'http://localhost:3000';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;

vi.mock('@/lib/db', async () => ({
  getDb: async () => {
    if (!currentDb) throw new Error('test db not initialised');
    return currentDb.db;
  },
}));

const {
  persistChallenge,
  consumeChallenge,
  insertCredential,
  findCredentialByCredentialId,
  listCredentialsForTenant,
  bumpCredentialCounter,
  mintChallenge,
  webauthnConfig,
} = await import('../lib/webauthn');

async function seedTenant(): Promise<string> {
  if (!currentDb) throw new Error('db gone');
  const rows = await currentDb.db
    .insert(tenants)
    .values({ principalDid: `did:key:z6Mklib${Math.random().toString(36).slice(2, 10)}` })
    .returning({ id: tenants.id });
  return rows[0]!.id;
}

describe('lib/webauthn', () => {
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
  });

  afterEach(async () => {
    if (currentDb) {
      await currentDb.close();
      currentDb = null;
    }
  });

  it('webauthnConfig returns rpId + rpName + origins', () => {
    const cfg = webauthnConfig();
    expect(cfg.rpId).toBe('localhost');
    expect(cfg.origins).toContain('http://localhost:3000');
  });

  it('persist + consume round-trips once and only once', async () => {
    const tenantId = await seedTenant();
    const challenge = mintChallenge();
    await persistChallenge(challenge, 'register', tenantId);

    const first = await consumeChallenge(challenge, 'register');
    expect(first).not.toBeNull();
    expect(first?.tenantId).toBe(tenantId);

    const replay = await consumeChallenge(challenge, 'register');
    expect(replay).toBeNull();
  });

  it('consume rejects a challenge issued for a different purpose', async () => {
    const challenge = mintChallenge();
    await persistChallenge(challenge, 'auth', null);
    const mismatch = await consumeChallenge(challenge, 'register');
    expect(mismatch).toBeNull();
    // Not consumed → should still be available under the right purpose.
    const right = await consumeChallenge(challenge, 'auth');
    expect(right).not.toBeNull();
  });

  it('consume rejects an expired challenge', async () => {
    if (!currentDb) throw new Error('db gone');
    // Insert directly with expires_at in the past.
    const challenge = mintChallenge();
    await currentDb.db.insert(webauthnChallenges).values({
      challenge,
      purpose: 'auth',
      tenantId: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await consumeChallenge(challenge, 'auth');
    expect(res).toBeNull();
  });

  it('insertCredential + lookup + bumpCounter work end-to-end', async () => {
    const tenantId = await seedTenant();
    const publicKey = new Uint8Array([1, 2, 3, 4]);
    const row = await insertCredential({
      tenantId,
      credentialId: 'cred-abc',
      publicKey,
      counter: 0,
      transports: ['internal', 'hybrid'],
      nickname: 'my macbook',
    });
    expect(row.tenantId).toBe(tenantId);
    expect(row.credentialId).toBe('cred-abc');
    expect(row.counter).toBe(0);
    expect(row.transports).toEqual(['internal', 'hybrid']);
    expect(row.nickname).toBe('my macbook');

    const found = await findCredentialByCredentialId('cred-abc');
    expect(found).not.toBeNull();
    expect(found?.publicKey).toEqual(publicKey);

    const list = await listCredentialsForTenant(tenantId);
    expect(list).toHaveLength(1);

    await bumpCredentialCounter('cred-abc', 42);
    const bumped = await findCredentialByCredentialId('cred-abc');
    expect(bumped?.counter).toBe(42);
    expect(bumped?.lastUsedAt).not.toBeNull();
  });

  it('credentialId is unique across tenants', async () => {
    const a = await seedTenant();
    const b = await seedTenant();
    await insertCredential({
      tenantId: a,
      credentialId: 'shared-cred',
      publicKey: new Uint8Array([1]),
      counter: 0,
      transports: [],
      nickname: null,
    });
    await expect(
      insertCredential({
        tenantId: b,
        credentialId: 'shared-cred',
        publicKey: new Uint8Array([2]),
        counter: 0,
        transports: [],
        nickname: null,
      }),
    ).rejects.toThrow();
  });

  it('findCredentialByCredentialId returns null for unknown id', async () => {
    const res = await findCredentialByCredentialId('does-not-exist');
    expect(res).toBeNull();
  });

  it('challenge row persists under the correct purpose label', async () => {
    if (!currentDb) throw new Error('db gone');
    await persistChallenge('register-challenge', 'register', null);
    await persistChallenge('auth-challenge', 'auth', null);
    const rows = await currentDb.db
      .select()
      .from(webauthnChallenges)
      .where(eq(webauthnChallenges.challenge, 'register-challenge'));
    expect(rows[0]!.purpose).toBe('register');
  });
});
