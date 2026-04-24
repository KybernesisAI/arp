/**
 * POST /api/push/register — mobile push-token registration.
 *
 * Exercises session auth (401 without), tenant scoping, idempotency on
 * (tenant_id, device_token), and rejection of malformed bodies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPgliteDb,
  pushRegistrations,
  tenants,
} from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { and, eq } from 'drizzle-orm';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';

const PRINCIPAL_DID = 'did:key:z6Mkpz6BnhqJPmKBiLK3t1ZC8JdPsS8DsqHfDffm2LEsEY4y';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
let sessionOverride: { principalDid: string; tenantId: string | null } | null = null;

vi.mock('@/lib/db', async () => ({
  getDb: async () => {
    if (!currentDb) throw new Error('test db not initialised');
    return currentDb.db;
  },
}));

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

const { POST } = await import('../app/api/push/register/route');

async function makeRequest(body: unknown): Promise<Response> {
  return POST(
    new Request('http://test.local/api/push/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function seedTenant(): Promise<string> {
  if (!currentDb) throw new Error('db gone');
  const rows = await currentDb.db
    .insert(tenants)
    .values({ principalDid: PRINCIPAL_DID, plan: 'free', status: 'active' })
    .returning({ id: tenants.id });
  const id = rows[0]?.id;
  if (!id) throw new Error('no tenant');
  return id;
}

describe('POST /api/push/register', () => {
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

  it('401 without a session', async () => {
    const res = await makeRequest({
      device_token: 'device-token-abc123',
      platform: 'ios',
      bundle_id: 'com.arp.owner',
    });
    expect(res.status).toBe(401);
  });

  it('persists a registration and returns a UUID id', async () => {
    const tenantId = await seedTenant();
    sessionOverride = { principalDid: PRINCIPAL_DID, tenantId };

    const res = await makeRequest({
      device_token: 'device-token-abc123',
      platform: 'ios',
      bundle_id: 'com.arp.owner',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; registration_id: string };
    expect(body.ok).toBe(true);
    expect(body.registration_id).toBeTruthy();

    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db.select().from(pushRegistrations);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(tenantId);
    expect(rows[0]?.platform).toBe('ios');
    expect(rows[0]?.bundleId).toBe('com.arp.owner');
  });

  it('is idempotent on (tenant_id, device_token): second POST updates metadata', async () => {
    const tenantId = await seedTenant();
    sessionOverride = { principalDid: PRINCIPAL_DID, tenantId };

    const first = await makeRequest({
      device_token: 'same-token',
      platform: 'ios',
      bundle_id: 'com.arp.owner',
    });
    const firstBody = (await first.json()) as { registration_id: string };

    const second = await makeRequest({
      device_token: 'same-token',
      platform: 'android',
      bundle_id: 'com.arp.owner.next',
    });
    const secondBody = (await second.json()) as { registration_id: string };

    expect(firstBody.registration_id).toBe(secondBody.registration_id);

    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db.select().from(pushRegistrations);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.platform).toBe('android');
    expect(rows[0]?.bundleId).toBe('com.arp.owner.next');
  });

  it('tenant-scopes: the same device token under two tenants gets two rows', async () => {
    const tenantA = await seedTenant();
    // Insert a second tenant directly for the adversarial case.
    if (!currentDb) throw new Error('db gone');
    const otherTenantRows = await currentDb.db
      .insert(tenants)
      .values({
        principalDid: 'did:key:z6MkpTenantB11111111111111111111111111111111',
        plan: 'free',
        status: 'active',
      })
      .returning({ id: tenants.id });
    const tenantB = otherTenantRows[0]?.id;
    if (!tenantB) throw new Error('no tenant B');

    sessionOverride = { principalDid: PRINCIPAL_DID, tenantId: tenantA };
    await makeRequest({
      device_token: 'shared-token',
      platform: 'ios',
      bundle_id: 'com.arp.owner',
    });

    sessionOverride = {
      principalDid: 'did:key:z6MkpTenantB11111111111111111111111111111111',
      tenantId: tenantB,
    };
    await makeRequest({
      device_token: 'shared-token',
      platform: 'ios',
      bundle_id: 'com.arp.owner',
    });

    const rows = await currentDb.db.select().from(pushRegistrations);
    expect(rows).toHaveLength(2);
    // Cross-check: each tenant sees only its own row.
    const rowsA = await currentDb.db
      .select()
      .from(pushRegistrations)
      .where(and(eq(pushRegistrations.tenantId, tenantA)));
    expect(rowsA).toHaveLength(1);
  });

  it('rejects bad platform', async () => {
    const tenantId = await seedTenant();
    sessionOverride = { principalDid: PRINCIPAL_DID, tenantId };
    const res = await makeRequest({
      device_token: 'device-token-abc123',
      platform: 'windows',
      bundle_id: 'com.arp.owner',
    });
    expect(res.status).toBe(400);
  });

  it('rejects too-short device token', async () => {
    const tenantId = await seedTenant();
    sessionOverride = { principalDid: PRINCIPAL_DID, tenantId };
    const res = await makeRequest({
      device_token: 'x',
      platform: 'ios',
      bundle_id: 'com.arp.owner',
    });
    expect(res.status).toBe(400);
  });
});
