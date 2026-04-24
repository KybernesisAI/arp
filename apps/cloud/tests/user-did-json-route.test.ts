/**
 * GET /u/<uuid>/did.json — cloud-managed DID document endpoint.
 *
 * Verifies the DID document for an existing did:key-backed tenant contains the
 * user's public key, 404s on unknown UUIDs + non-did:key principals, and
 * carries the expected cache + content-type headers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPgliteDb, tenants } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';

// Deterministic did:key fixture (same as tenants-route.test.ts).
const PRINCIPAL_DID = 'did:key:z6Mkpz6BnhqJPmKBiLK3t1ZC8JdPsS8DsqHfDffm2LEsEY4y';
const PUBLIC_KEY_MULTIBASE = 'z6Mkpz6BnhqJPmKBiLK3t1ZC8JdPsS8DsqHfDffm2LEsEY4y';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;

vi.mock('@/lib/db', async () => {
  return {
    getDb: async () => {
      if (!currentDb) throw new Error('test db not initialised');
      return currentDb.db;
    },
  };
});

const { GET } = await import('../app/u/[uuid]/did.json/route');

async function hit(uuid: string): Promise<Response> {
  return GET(new Request(`http://test.local/u/${uuid}/did.json`), {
    params: Promise.resolve({ uuid }),
  });
}

describe('GET /u/<uuid>/did.json', () => {
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

  it('returns a DID doc with the did:key-derived pubkey for an existing tenant', async () => {
    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db
      .insert(tenants)
      .values({ principalDid: PRINCIPAL_DID, plan: 'free', status: 'active' })
      .returning({ id: tenants.id });
    const tenantId = rows[0]?.id;
    if (!tenantId) throw new Error('no tenant');

    const res = await hit(tenantId);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/did+json');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, must-revalidate');

    const body = (await res.json()) as {
      '@context': string[];
      id: string;
      controller: string;
      verificationMethod: Array<{ id: string; type: string; publicKeyMultibase: string }>;
      authentication: string[];
      assertionMethod: string[];
      keyAgreement: string[];
    };
    const didSubject = `did:web:arp.cloud:u:${tenantId}`;
    expect(body.id).toBe(didSubject);
    expect(body.controller).toBe(didSubject);
    expect(body.verificationMethod).toHaveLength(1);
    expect(body.verificationMethod[0]?.id).toBe(`${didSubject}#key-1`);
    expect(body.verificationMethod[0]?.type).toBe('Ed25519VerificationKey2020');
    expect(body.verificationMethod[0]?.publicKeyMultibase).toBe(PUBLIC_KEY_MULTIBASE);
    expect(body.authentication).toEqual([`${didSubject}#key-1`]);
    expect(body.assertionMethod).toEqual([`${didSubject}#key-1`]);
    expect(body.keyAgreement).toEqual([`${didSubject}#key-1`]);
  });

  it('404s for an unknown uuid', async () => {
    const res = await hit('11111111-2222-3333-4444-555555555555');
    expect(res.status).toBe(404);
  });

  it('404s when uuid is not a valid UUID shape', async () => {
    const res = await hit('notauuid');
    expect(res.status).toBe(404);
  });

  it('404s when the tenant principal is not a did:key', async () => {
    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db
      .insert(tenants)
      .values({ principalDid: 'did:web:sovereign.example', plan: 'free', status: 'active' })
      .returning({ id: tenants.id });
    const tenantId = rows[0]?.id;
    if (!tenantId) throw new Error('no tenant');

    const res = await hit(tenantId);
    expect(res.status).toBe(404);
  });
});
