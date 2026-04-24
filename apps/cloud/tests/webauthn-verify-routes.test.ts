/**
 * WebAuthn verify routes — guards + error paths.
 *
 * End-to-end attestation verification requires a live authenticator (or a
 * CBOR-encoded synthetic attestation, which is out of scope for vitest
 * coverage). These tests drive the known server-side guards:
 *
 *   - register/verify: rejects unknown challenge, rejects wrong tenant,
 *     rejects malformed clientDataJSON
 *   - auth/verify: rejects unknown challenge, rejects unknown credential,
 *     rejects malformed clientDataJSON
 *
 * The happy-path signature check is delegated to @simplewebauthn/server,
 * covered by its own test suite + a manual browser smoke test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPgliteDb, tenants } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { installCookieMock, installHeadersMock } from './helpers/cookies';

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

const cookieStore = installCookieMock();
installHeadersMock();

const { setSession } = await import('../lib/session');
const { persistChallenge, insertCredential } = await import('../lib/webauthn');
const { POST: registerVerify } = await import('../app/api/webauthn/register/verify/route');
const { POST: authVerify } = await import('../app/api/webauthn/auth/verify/route');

function makeClientDataJSON(challenge: string, type: 'webauthn.create' | 'webauthn.get'): string {
  const obj = {
    type,
    challenge,
    origin: 'http://localhost:3000',
    crossOrigin: false,
  };
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

async function seedTenant(): Promise<string> {
  if (!currentDb) throw new Error('db gone');
  const rows = await currentDb.db
    .insert(tenants)
    .values({ principalDid: `did:key:z6Mkverify${Math.random().toString(36).slice(2, 10)}` })
    .returning({ id: tenants.id });
  return rows[0]!.id;
}

describe('POST /api/webauthn/register/verify', () => {
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

  async function withSession(): Promise<string> {
    const tenantId = await seedTenant();
    await setSession('did:key:z6Mkverify', tenantId, 'test-nonce');
    return tenantId;
  }

  function post(body: unknown): Promise<Response> {
    return registerVerify(
      new Request('http://test.local/api/webauthn/register/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  it('returns 401 without a session', async () => {
    const res = await post({
      response: {
        id: 'x',
        rawId: 'x',
        type: 'public-key',
        response: { clientDataJSON: makeClientDataJSON('abc', 'webauthn.create') },
        clientExtensionResults: {},
      },
    });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed body', async () => {
    await withSession();
    const res = await post({ notResponse: true });
    expect(res.status).toBe(400);
  });

  it('rejects when challenge is missing from clientDataJSON', async () => {
    await withSession();
    const badClientData = Buffer.from('not-json', 'utf8').toString('base64url');
    const res = await post({
      response: {
        id: 'x',
        rawId: 'x',
        type: 'public-key',
        response: { clientDataJSON: badClientData },
        clientExtensionResults: {},
      },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('missing_challenge');
  });

  it('rejects an unknown challenge', async () => {
    await withSession();
    const clientData = makeClientDataJSON('never-issued', 'webauthn.create');
    const res = await post({
      response: {
        id: 'x',
        rawId: 'x',
        type: 'public-key',
        response: { clientDataJSON: clientData },
        clientExtensionResults: {},
      },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unknown_or_expired_challenge');
  });

  it('rejects a challenge bound to a different tenant', async () => {
    const mine = await withSession();
    const other = await seedTenant();
    void mine;
    await persistChallenge('stolen-challenge', 'register', other);
    const res = await post({
      response: {
        id: 'x',
        rawId: 'x',
        type: 'public-key',
        response: { clientDataJSON: makeClientDataJSON('stolen-challenge', 'webauthn.create') },
        clientExtensionResults: {},
      },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('challenge_tenant_mismatch');
  });
});

describe('POST /api/webauthn/auth/verify', () => {
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

  function post(body: unknown): Promise<Response> {
    return authVerify(
      new Request('http://test.local/api/webauthn/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  it('rejects malformed body', async () => {
    const res = await post({ nope: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown challenge', async () => {
    const res = await post({
      response: {
        id: 'cred-x',
        rawId: 'cred-x',
        type: 'public-key',
        response: {
          clientDataJSON: makeClientDataJSON('unknown-challenge', 'webauthn.get'),
          authenticatorData: '',
          signature: '',
        },
        clientExtensionResults: {},
      },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unknown_or_expired_challenge');
  });

  it('rejects a credential that is not registered', async () => {
    await persistChallenge('fresh-auth', 'auth', null);
    const res = await post({
      response: {
        id: 'never-registered',
        rawId: 'never-registered',
        type: 'public-key',
        response: {
          clientDataJSON: makeClientDataJSON('fresh-auth', 'webauthn.get'),
          authenticatorData: '',
          signature: '',
        },
        clientExtensionResults: {},
      },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unknown_credential');
  });

  it('rejects verify when the credential exists but signature is invalid', async () => {
    const tenantId = await seedTenant();
    await insertCredential({
      tenantId,
      credentialId: 'present-cred',
      publicKey: new Uint8Array([1, 2, 3]),
      counter: 0,
      transports: [],
      nickname: null,
    });
    await persistChallenge('auth-challenge-x', 'auth', null);
    const res = await post({
      response: {
        id: 'present-cred',
        rawId: 'present-cred',
        type: 'public-key',
        response: {
          clientDataJSON: makeClientDataJSON('auth-challenge-x', 'webauthn.get'),
          authenticatorData: Buffer.from([0]).toString('base64url'),
          signature: Buffer.from([0]).toString('base64url'),
        },
        clientExtensionResults: {},
      },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('verification_failed');
  });
});
