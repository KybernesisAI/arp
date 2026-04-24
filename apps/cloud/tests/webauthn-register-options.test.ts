/**
 * POST /api/webauthn/register/options — Phase 9d passkey registration
 * options route.
 *
 * Drives the handler directly against a fresh PGlite + programmatically-set
 * session cookie. Verifies the happy path returns SimpleWebAuthn-shaped
 * options + persists a challenge, and rate-limits kick in at 11/min.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPgliteDb, tenants, webauthnChallenges } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';
import { installCookieMock, installHeadersMock, freshTestIp } from './helpers/cookies';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';
process.env['WEBAUTHN_RP_ID'] = 'localhost';
process.env['WEBAUTHN_RP_NAME'] = 'ARP Test';
process.env['WEBAUTHN_ORIGINS'] = 'http://localhost:3000';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;

vi.mock('@/lib/db', async () => ({
  getDb: async () => {
    if (!currentDb) throw new Error('test db not initialised');
    return currentDb.db;
  },
}));

const cookieStore = installCookieMock();
const headersMock = installHeadersMock();

const { setSession } = await import('../lib/session');
const { POST } = await import('../app/api/webauthn/register/options/route');

async function seedTenantAndSession(): Promise<string> {
  if (!currentDb) throw new Error('db gone');
  const rows = await currentDb.db
    .insert(tenants)
    .values({ principalDid: 'did:key:z6MkWebAuthnTenant001', displayName: 'Test Tenant' })
    .returning({ id: tenants.id });
  const tenantId = rows[0]!.id;
  // Seed session cookie — mirrors what /api/auth/verify issues.
  const session = await setSession(
    'did:key:z6MkWebAuthnTenant001',
    tenantId,
    'test-nonce-0123',
  );
  // The installCookieMock store.set was called by setSession via the mocked
  // `cookies()` helper; confirm we have it.
  void session;
  void cookieStore;
  return tenantId;
}

async function makeRequest(ip = '10.0.0.50'): Promise<Response> {
  headersMock.setAll({ 'x-forwarded-for': ip });
  const req = new Request('http://test.local/api/webauthn/register/options', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: '{}',
  });
  return POST(req);
}

describe('POST /api/webauthn/register/options', () => {
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
    headersMock.clear();
  });

  it('returns WebAuthn registration options + persists challenge', async () => {
    const tenantId = await seedTenantAndSession();
    const res = await makeRequest();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      challenge: string;
      rp: { id: string; name: string };
      user: { id: string; name: string };
      pubKeyCredParams: unknown[];
      excludeCredentials?: unknown[];
    };
    expect(body.challenge).toBeTruthy();
    expect(body.rp.id).toBe('localhost');
    expect(body.rp.name).toBe('ARP Test');
    expect(body.user.name).toBe('Test Tenant');
    expect(body.pubKeyCredParams.length).toBeGreaterThan(0);
    expect(body.excludeCredentials ?? []).toHaveLength(0);

    // Challenge row is persisted + tenant-scoped.
    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db
      .select()
      .from(webauthnChallenges)
      .where(eq(webauthnChallenges.tenantId, tenantId));
    expect(rows.length).toBe(1);
    expect(rows[0]!.purpose).toBe('register');
    expect(rows[0]!.challenge).toBe(body.challenge);
  });

  it('returns 401 without a session', async () => {
    cookieStore.clear();
    const res = await makeRequest();
    expect(res.status).toBe(401);
  });

  it('rate-limits at 11 requests/min per IP', async () => {
    await seedTenantAndSession();
    const ip = freshTestIp();
    for (let i = 0; i < 10; i++) {
      const ok = await makeRequest(ip);
      expect(ok.status).toBe(200);
    }
    const res = await makeRequest(ip);
    expect(res.status).toBe(429);
  });
});
