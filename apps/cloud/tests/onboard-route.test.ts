/**
 * GET /onboard and POST /api/onboard/complete — phase 9b v2.1 flow.
 *
 * We drive the route handlers directly. The `onboarding_sessions` row lifecycle
 * is the key assertion: a /onboard hit creates the row; /api/onboard/complete
 * updates the principal_did; bad params render a descriptive error page.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPgliteDb, onboardingSessions } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
let sessionOverride: { principalDid: string; tenantId: string | null } | null = null;

vi.mock('@/lib/db', async () => {
  return {
    getDb: async () => {
      if (!currentDb) throw new Error('test db not initialised');
      return currentDb.db;
    },
    resetDbForTests: async () => {
      if (currentDb) {
        await currentDb.close();
        currentDb = null;
      }
    },
  };
});

vi.mock('@/lib/session', async () => ({
  getSession: async () => {
    if (!sessionOverride) return null;
    return {
      ...sessionOverride,
      nonce: 'test-nonce',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
    };
  },
}));

const OnboardPage = (await import('../app/onboard/page')).default;
const { POST: OnboardCompletePost } = await import('../app/api/onboard/complete/route');

describe('GET /onboard (server component)', () => {
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

  it('creates an onboarding_sessions row on valid params', async () => {
    // Invoke the server component. We ignore the returned JSX — the
    // side-effect of creating the session row is what we assert on.
    await OnboardPage({
      searchParams: Promise.resolve({
        domain: 'samantha.agent',
        registrar: 'headless',
        callback: 'https://headless.example/callback',
      }),
    });
    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db.select().from(onboardingSessions);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.domain).toBe('samantha.agent');
    expect(row?.registrar).toBe('headless');
    expect(row?.callbackUrl).toBe('https://headless.example/callback');
    expect(row?.principalDid).toBeNull();
    expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 30 * 60 * 1000);
  });

  it('does NOT create a row when domain is malformed', async () => {
    await OnboardPage({
      searchParams: Promise.resolve({
        domain: 'not a valid domain',
        registrar: 'headless',
        callback: 'https://headless.example/callback',
      }),
    });
    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db.select().from(onboardingSessions);
    expect(rows).toHaveLength(0);
  });

  it('does NOT create a row when callback is not a URL', async () => {
    await OnboardPage({
      searchParams: Promise.resolve({
        domain: 'samantha.agent',
        registrar: 'headless',
        callback: 'totally bogus',
      }),
    });
    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db.select().from(onboardingSessions);
    expect(rows).toHaveLength(0);
  });

  it('does NOT create a row when registrar is missing', async () => {
    await OnboardPage({
      searchParams: Promise.resolve({
        domain: 'samantha.agent',
        callback: 'https://headless.example/callback',
      }),
    });
    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db.select().from(onboardingSessions);
    expect(rows).toHaveLength(0);
  });
});

describe('POST /api/onboard/complete', () => {
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    sessionOverride = null;
  });
  afterEach(async () => {
    if (currentDb) {
      await currentDb.close();
      currentDb = null;
    }
    sessionOverride = null;
  });

  async function seedSession(): Promise<string> {
    if (!currentDb) throw new Error('db gone');
    const inserted = await currentDb.db
      .insert(onboardingSessions)
      .values({
        domain: 'samantha.agent',
        registrar: 'headless',
        callbackUrl: 'https://headless.example/cb',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      .returning({ id: onboardingSessions.id });
    const id = inserted[0]?.id;
    if (!id) throw new Error('no session');
    return id;
  }

  it('401 without a session cookie', async () => {
    const sessionId = await seedSession();
    const req = new Request('http://test.local/api/onboard/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        principalDid: 'did:key:z6Mkpz6BnhqJPmKBiLK3t1ZC8JdPsS8DsqHfDffm2LEsEY4y',
      }),
    });
    const res = await OnboardCompletePost(req);
    expect(res.status).toBe(401);
  });

  it('updates the session row with the resolved principal DID (did:key match)', async () => {
    const sessionId = await seedSession();
    const principalDid = 'did:key:z6Mkpz6BnhqJPmKBiLK3t1ZC8JdPsS8DsqHfDffm2LEsEY4y';
    sessionOverride = { principalDid, tenantId: '00000000-0000-0000-0000-000000000001' };

    const req = new Request('http://test.local/api/onboard/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, principalDid }),
    });
    const res = await OnboardCompletePost(req);
    expect(res.status).toBe(200);

    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db.select().from(onboardingSessions);
    expect(rows[0]?.principalDid).toBe(principalDid);
  });

  it('also accepts the cloud-managed did:web alias for the session tenant', async () => {
    const sessionId = await seedSession();
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const principalDidKey = 'did:key:z6Mkpz6BnhqJPmKBiLK3t1ZC8JdPsS8DsqHfDffm2LEsEY4y';
    sessionOverride = { principalDid: principalDidKey, tenantId };

    const req = new Request('http://test.local/api/onboard/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        principalDid: `did:web:arp.cloud:u:${tenantId}`,
      }),
    });
    const res = await OnboardCompletePost(req);
    expect(res.status).toBe(200);
  });

  it('rejects a principal DID that does not match the session', async () => {
    const sessionId = await seedSession();
    sessionOverride = {
      principalDid: 'did:key:z6Mkpz6BnhqJPmKBiLK3t1ZC8JdPsS8DsqHfDffm2LEsEY4y',
      tenantId: '00000000-0000-0000-0000-000000000001',
    };

    const req = new Request('http://test.local/api/onboard/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        principalDid: 'did:key:z6Mkdifferent1111111111111111111111111111111',
      }),
    });
    const res = await OnboardCompletePost(req);
    expect(res.status).toBe(403);
  });

  it('rejects bad session id', async () => {
    sessionOverride = {
      principalDid: 'did:key:z6Mkpz6BnhqJPmKBiLK3t1ZC8JdPsS8DsqHfDffm2LEsEY4y',
      tenantId: null,
    };
    const req = new Request('http://test.local/api/onboard/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'not-a-uuid',
        principalDid: 'did:key:z6Mkpz6BnhqJPmKBiLK3t1ZC8JdPsS8DsqHfDffm2LEsEY4y',
      }),
    });
    const res = await OnboardCompletePost(req);
    expect(res.status).toBe(400);
  });
});
