/**
 * POST /internal/registrar/bind — v2.1 TLD registrar callback receiver.
 *
 * Exercises PSK auth (missing / wrong / valid), body validation, tenant-id
 * linkage by principal DID, and idempotency on (domain, owner_label).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPgliteDb, registrarBindings, tenants } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';

const PSK = 'test-registrar-psk-abcdefg1234567890';
process.env['ARP_CLOUD_REGISTRAR_PSK'] = PSK;
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

const { POST } = await import('../app/internal/registrar/bind/route');

function request(
  body: unknown,
  opts: { psk?: string | null; ip?: string } = {},
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': opts.ip ?? '198.51.100.1',
  };
  const psk = opts.psk === undefined ? PSK : opts.psk;
  if (psk) headers['authorization'] = `Bearer ${psk}`;
  return new Request('http://test.local/internal/registrar/bind', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  domain: 'samantha.agent',
  owner_label: 'ian',
  principal_did: 'did:web:arp.cloud:u:11111111-2222-3333-4444-555555555555',
  public_key_multibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  representation_jwt: 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJkaWQ6d2ViOmFycC5jbG91ZCJ9.c2ln',
};

describe('POST /internal/registrar/bind', () => {
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

  it('rejects when Authorization header is missing', async () => {
    const res = await POST(request(VALID_BODY, { psk: null }));
    expect(res.status).toBe(401);
  });

  it('rejects when PSK is wrong', async () => {
    const res = await POST(request(VALID_BODY, { psk: 'wrong-psk' }));
    expect(res.status).toBe(401);
  });

  it('persists a binding on valid PSK + body, tenantId null when no tenant exists', async () => {
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; tenant_id: string | null; binding_id: string };
    expect(body.ok).toBe(true);
    expect(body.tenant_id).toBeNull();
    expect(body.binding_id).toBeTruthy();

    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db.select().from(registrarBindings);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.domain).toBe('samantha.agent');
    expect(rows[0]?.ownerLabel).toBe('ian');
    expect(rows[0]?.registrar).toBe('headless');
    expect(rows[0]?.tenantId).toBeNull();
  });

  it('links tenantId when a tenant row exists for the principal DID', async () => {
    if (!currentDb) throw new Error('db gone');
    const tenantRows = await currentDb.db
      .insert(tenants)
      .values({ principalDid: VALID_BODY.principal_did, plan: 'free', status: 'active' })
      .returning({ id: tenants.id });
    const tenantId = tenantRows[0]?.id;

    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; tenant_id: string | null };
    expect(body.tenant_id).toBe(tenantId);

    const rows = await currentDb.db.select().from(registrarBindings);
    expect(rows[0]?.tenantId).toBe(tenantId);
  });

  it('upserts on (domain, owner_label): re-bind overwrites previous principal', async () => {
    const first = await POST(request(VALID_BODY));
    expect(first.status).toBe(200);

    const rebound = {
      ...VALID_BODY,
      principal_did: 'did:web:arp.cloud:u:99999999-9999-9999-9999-999999999999',
      public_key_multibase: 'z6MkpnewkeyNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
    };
    const second = await POST(request(rebound));
    expect(second.status).toBe(200);

    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db.select().from(registrarBindings);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.principalDid).toBe(rebound.principal_did);
    expect(rows[0]?.publicKeyMultibase).toBe(rebound.public_key_multibase);
  });

  it('rejects bad domain', async () => {
    const res = await POST(request({ ...VALID_BODY, domain: 'not a domain' }));
    expect(res.status).toBe(400);
  });

  it('rejects bad owner_label', async () => {
    const res = await POST(request({ ...VALID_BODY, owner_label: '-bad-' }));
    expect(res.status).toBe(400);
  });

  it('rejects bad principal_did', async () => {
    const res = await POST(request({ ...VALID_BODY, principal_did: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('rejects JWT that is not a compact JWS', async () => {
    const res = await POST(request({ ...VALID_BODY, representation_jwt: 'not.a.jws.at.all' }));
    expect(res.status).toBe(400);
  });

  it('accepts an explicit registrar value in the body', async () => {
    const res = await POST(request({ ...VALID_BODY, registrar: 'futureco' }));
    expect(res.status).toBe(200);
    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db.select().from(registrarBindings).where(eq(registrarBindings.domain, VALID_BODY.domain));
    expect(rows[0]?.registrar).toBe('futureco');
  });

  it('429s on burst: 61st hit from the same IP inside a minute', async () => {
    const ip = '198.51.100.42';
    // Burst cap is 60/min. Fire 60 valid requests, then expect the 61st to 429.
    for (let i = 0; i < 60; i++) {
      // Vary the (domain, owner_label) to avoid the unique constraint.
      const res = await POST(
        request(
          { ...VALID_BODY, owner_label: `ian${i}`, domain: `site${i}.agent` },
          { ip },
        ),
      );
      expect(res.status).toBe(200);
    }
    const tripped = await POST(request(VALID_BODY, { ip }));
    expect(tripped.status).toBe(429);
    expect(tripped.headers.get('retry-after')).toBeTruthy();
  });
});
