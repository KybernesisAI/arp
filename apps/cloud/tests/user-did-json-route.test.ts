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
import { eq } from 'drizzle-orm';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';

// Deterministic did:key fixture (same as tenants-route.test.ts).
const PRINCIPAL_DID = 'did:key:z6Mkpz6BnhqJPmKBiLK3t1ZC8JdPsS8DsqHfDffm2LEsEY4y';
const PUBLIC_KEY_MULTIBASE = 'z6Mkpz6BnhqJPmKBiLK3t1ZC8JdPsS8DsqHfDffm2LEsEY4y';
// A distinct did:key fixture for the rotation "previous DID" path.
const OLD_PRINCIPAL_DID = 'did:key:z6MkpzfuWK75xJ4UGwaz4K8ZQA7TGNSbE2FUi5XiFH3cLzb8';
const OLD_PUBLIC_KEY_MULTIBASE = 'z6MkpzfuWK75xJ4UGwaz4K8ZQA7TGNSbE2FUi5XiFH3cLzb8';

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

async function hit(uuid: string, ip = '192.0.2.9'): Promise<Response> {
  return GET(
    new Request(`http://test.local/u/${uuid}/did.json`, {
      headers: { 'x-forwarded-for': ip },
    }),
    {
      params: Promise.resolve({ uuid }),
    },
  );
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

  it('dual-publishes during the HKDF v1 → v2 rotation grace window', async () => {
    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db
      .insert(tenants)
      .values({
        principalDid: PRINCIPAL_DID,
        principalDidPrevious: OLD_PRINCIPAL_DID,
        v1DeprecatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      })
      .returning({ id: tenants.id });
    const tenantId = rows[0]!.id;

    const res = await hit(tenantId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      verificationMethod: Array<{ id: string; publicKeyMultibase: string }>;
      authentication: string[];
      assertionMethod: string[];
      keyAgreement: string[];
    };
    expect(body.verificationMethod).toHaveLength(2);
    const didSubject = `did:web:arp.cloud:u:${tenantId}`;
    expect(body.verificationMethod[0]?.id).toBe(`${didSubject}#key-1`);
    expect(body.verificationMethod[0]?.publicKeyMultibase).toBe(PUBLIC_KEY_MULTIBASE);
    expect(body.verificationMethod[1]?.id).toBe(`${didSubject}#key-0`);
    expect(body.verificationMethod[1]?.publicKeyMultibase).toBe(OLD_PUBLIC_KEY_MULTIBASE);
    // Both keys referenced in authentication + assertionMethod + keyAgreement.
    expect(body.authentication).toEqual([`${didSubject}#key-1`, `${didSubject}#key-0`]);
    expect(body.assertionMethod).toEqual([`${didSubject}#key-1`, `${didSubject}#key-0`]);
    expect(body.keyAgreement).toEqual([`${didSubject}#key-1`, `${didSubject}#key-0`]);
  });

  it('clears rotation columns + publishes only the current key past the 90-day grace', async () => {
    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db
      .insert(tenants)
      .values({
        principalDid: PRINCIPAL_DID,
        principalDidPrevious: OLD_PRINCIPAL_DID,
        // 91 days ago = past grace
        v1DeprecatedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: tenants.id });
    const tenantId = rows[0]!.id;

    const res = await hit(tenantId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      verificationMethod: Array<{ id: string; publicKeyMultibase: string }>;
    };
    // Only the current key is published past the grace.
    expect(body.verificationMethod).toHaveLength(1);
    expect(body.verificationMethod[0]?.publicKeyMultibase).toBe(PUBLIC_KEY_MULTIBASE);

    // The fire-and-forget cleanup runs async, but we can see its effect
    // on a subsequent read OR by waiting one tick.
    await new Promise((r) => setTimeout(r, 20));
    const row = (await currentDb.db
      .select({
        principalDidPrevious: tenants.principalDidPrevious,
        v1DeprecatedAt: tenants.v1DeprecatedAt,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId)))[0]!;
    expect(row.principalDidPrevious).toBeNull();
    expect(row.v1DeprecatedAt).toBeNull();
  });

  it('429s on burst: 121st hit inside a minute from the same IP', async () => {
    // Freeze Date.now so 121 requests always land in the same window
    // regardless of host speed. On slow CI runners the burst can otherwise
    // cross a minute boundary and split the count across two buckets.
    const frozen = Date.UTC(2026, 5, 1, 13, 15, 30);
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(frozen);
    try {
      const ip = '192.0.2.200';
      const unknownUuid = '11111111-2222-3333-4444-555555555555';
      // Rate-limit is 120/min per IP. 404s still count — limit fires before
      // the UUID shape check in the handler.
      for (let i = 0; i < 120; i++) {
        const res = await hit(unknownUuid, ip);
        expect(res.status).toBe(404);
      }
      const tripped = await hit(unknownUuid, ip);
      expect(tripped.status).toBe(429);
      expect(tripped.headers.get('retry-after')).toBeTruthy();
    } finally {
      dateNowSpy.mockRestore();
    }
  });
});
