/**
 * POST /api/webauthn/auth/options — Phase 9d pre-session sign-in kickoff.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPgliteDb, webauthnChallenges } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';
import { installCookieMock, installHeadersMock, freshTestIp } from './helpers/cookies';

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

installCookieMock();
const headersMock = installHeadersMock();

const { POST } = await import('../app/api/webauthn/auth/options/route');

async function makeRequest(ip = '10.0.0.60'): Promise<Response> {
  headersMock.setAll({ 'x-forwarded-for': ip });
  const req = new Request('http://test.local/api/webauthn/auth/options', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: '{}',
  });
  return POST(req);
}

describe('POST /api/webauthn/auth/options', () => {
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
  });

  afterEach(async () => {
    if (currentDb) {
      await currentDb.close();
      currentDb = null;
    }
    headersMock.clear();
  });

  it('returns auth options + persists a pre-session challenge', async () => {
    const res = await makeRequest();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { challenge: string; rpId: string; timeout: number };
    expect(body.challenge).toBeTruthy();
    expect(body.rpId).toBe('localhost');

    // Challenge row persists with tenantId = null.
    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db
      .select()
      .from(webauthnChallenges)
      .where(eq(webauthnChallenges.challenge, body.challenge));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.purpose).toBe('auth');
    expect(rows[0]!.tenantId).toBeNull();
  });

  it('rate-limits at 11/min per IP', async () => {
    const ip = freshTestIp();
    for (let i = 0; i < 10; i++) {
      const ok = await makeRequest(ip);
      expect(ok.status).toBe(200);
    }
    const res = await makeRequest(ip);
    expect(res.status).toBe(429);
  });
});
