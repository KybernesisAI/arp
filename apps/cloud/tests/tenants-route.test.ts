/**
 * POST /api/tenants — Phase-8.5 account bootstrap.
 *
 * We drive the route handler directly (not through Next.js) so the test is
 * hermetic: it depends only on the DB layer + env. A fresh PGlite instance
 * is created per test, mounted into `@/lib/db` via a module mock.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPgliteDb, tenants } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';

// Deterministic did:key fixture (seed: (i*7+13) & 0xff for i in 0..31).
// Generated offline via @noble/ed25519 + ed25519RawToMultibase.
const PRINCIPAL_DID = 'did:key:z6Mkpz6BnhqJPmKBiLK3t1ZC8JdPsS8DsqHfDffm2LEsEY4y';
const PUBLIC_KEY_MULTIBASE = 'z6Mkpz6BnhqJPmKBiLK3t1ZC8JdPsS8DsqHfDffm2LEsEY4y';

// A second independent did:key (seed: (i*11+5) & 0xff) for "wrong key" cases.
// Generated offline via @noble/ed25519 + ed25519RawToMultibase.
const OTHER_MULTIBASE = 'z6MkpzfuWK75xJ4UGwaz4K8ZQA7TGNSbE2FUi5XiFH3cLzb8';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;

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

vi.mock('next/headers', async () => {
  const store = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (name: string) => {
        const v = store.get(name);
        return v ? { name, value: v } : undefined;
      },
      set: (name: string, value: string) => {
        store.set(name, value);
      },
      delete: (name: string) => {
        store.delete(name);
      },
    }),
  };
});

// Import after mocks so the route resolves `@/lib/db` through the mock.
const { POST } = await import('../app/api/tenants/route');

async function makeRequest(body: unknown): Promise<Response> {
  const req = new Request('http://test.local/api/tenants', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req);
}

describe('POST /api/tenants', () => {
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

  it('creates a tenant and returns a session on happy path', async () => {
    const res = await makeRequest({
      principalDid: PRINCIPAL_DID,
      publicKeyMultibase: PUBLIC_KEY_MULTIBASE,
      recoveryPhraseConfirmed: true,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; tenantId: string; principalDid: string };
    expect(body.ok).toBe(true);
    expect(body.principalDid).toBe(PRINCIPAL_DID);
    expect(body.tenantId).toBeTruthy();

    // Row exists in the DB.
    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db
      .select({ id: tenants.id, principalDid: tenants.principalDid })
      .from(tenants)
      .where(eq(tenants.principalDid, PRINCIPAL_DID));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(body.tenantId);
  });

  it('is idempotent: second POST returns same tenantId', async () => {
    const first = await makeRequest({
      principalDid: PRINCIPAL_DID,
      publicKeyMultibase: PUBLIC_KEY_MULTIBASE,
      recoveryPhraseConfirmed: true,
    });
    const second = await makeRequest({
      principalDid: PRINCIPAL_DID,
      publicKeyMultibase: PUBLIC_KEY_MULTIBASE,
      recoveryPhraseConfirmed: true,
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = (await first.json()) as { tenantId: string };
    const b = (await second.json()) as { tenantId: string };
    expect(a.tenantId).toBe(b.tenantId);

    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db.select({ id: tenants.id }).from(tenants);
    expect(rows).toHaveLength(1);
  });

  it('rejects when publicKeyMultibase does not match principalDid', async () => {
    const res = await makeRequest({
      principalDid: PRINCIPAL_DID,
      publicKeyMultibase: OTHER_MULTIBASE,
      recoveryPhraseConfirmed: true,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('did_key_pubkey_mismatch');
  });

  it('rejects when recoveryPhraseConfirmed is false', async () => {
    const res = await makeRequest({
      principalDid: PRINCIPAL_DID,
      publicKeyMultibase: PUBLIC_KEY_MULTIBASE,
      recoveryPhraseConfirmed: false,
    });
    // zod literal(true) triggers bad_request before our inline guard runs.
    expect(res.status).toBe(400);
  });

  it('rejects non-did:key principals', async () => {
    const res = await makeRequest({
      principalDid: 'did:web:example.agent',
      publicKeyMultibase: PUBLIC_KEY_MULTIBASE,
      recoveryPhraseConfirmed: true,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('principal_not_did_key');
  });

  it('rejects malformed principalDid', async () => {
    const res = await makeRequest({
      principalDid: 'not a did',
      publicKeyMultibase: PUBLIC_KEY_MULTIBASE,
      recoveryPhraseConfirmed: true,
    });
    expect(res.status).toBe(400);
  });
});
