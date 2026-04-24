/**
 * PATCH + DELETE /api/webauthn/credentials/:id — Phase 9e.
 *
 * Covers the dashboard /settings credential management surface:
 *   - unauthenticated requests rejected (401)
 *   - tenant-scoping: a credential owned by another tenant returns 404
 *   - rename happy path persists the new nickname
 *   - rename bad body returns 400
 *   - delete refuses when only one credential remains (cannot_delete_last_credential)
 *   - delete succeeds when more than one credential is present
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPgliteDb, tenants } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { installCookieMock, installHeadersMock } from './helpers/cookies';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';

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
const { insertCredential } = await import('../lib/webauthn');
const { PATCH, DELETE } = await import(
  '../app/api/webauthn/credentials/[id]/route'
);

async function seedTenant(labelSuffix: string): Promise<string> {
  if (!currentDb) throw new Error('db gone');
  const rows = await currentDb.db
    .insert(tenants)
    .values({ principalDid: `did:key:z6Mkcreds${labelSuffix}` })
    .returning({ id: tenants.id });
  return rows[0]!.id;
}

async function seedCredential(tenantId: string, suffix: string): Promise<string> {
  const row = await insertCredential({
    tenantId,
    credentialId: `credid-${suffix}`,
    publicKey: new Uint8Array([1, 2, 3]),
    counter: 0,
    transports: [],
    nickname: null,
  });
  return row.id;
}

function req(method: 'PATCH' | 'DELETE', id: string, body?: unknown): Request {
  return new Request(`http://test.local/api/webauthn/credentials/${id}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/webauthn/credentials/:id', () => {
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

  it('returns 401 without a session', async () => {
    const res = await PATCH(req('PATCH', 'any', { nickname: 'x' }), params('any'));
    expect(res.status).toBe(401);
  });

  it('returns 400 on bad body', async () => {
    const tenantId = await seedTenant('patch-bad-body');
    await setSession('did:key:z6Mkcredspatch-bad-body', tenantId, 'nonce');
    const res = await PATCH(
      req('PATCH', 'any-id', { nickname: '' }),
      params('any-id'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the credential is owned by another tenant', async () => {
    const mine = await seedTenant('mine');
    const other = await seedTenant('other');
    await setSession('did:key:z6Mkcredsmine', mine, 'nonce');
    const otherCredId = await seedCredential(other, 'other-owned');

    const res = await PATCH(
      req('PATCH', otherCredId, { nickname: 'Stolen' }),
      params(otherCredId),
    );
    expect(res.status).toBe(404);
  });

  it('renames a credential the caller owns', async () => {
    const tenantId = await seedTenant('rename-happy');
    await setSession('did:key:z6Mkcredsrename-happy', tenantId, 'nonce');
    const credId = await seedCredential(tenantId, 'rename-happy');

    const res = await PATCH(
      req('PATCH', credId, { nickname: "Ian's MacBook" }),
      params(credId),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; nickname: string };
    expect(body.ok).toBe(true);
    expect(body.nickname).toBe("Ian's MacBook");
  });

  it('accepts nickname: null to clear the nickname', async () => {
    const tenantId = await seedTenant('rename-null');
    await setSession('did:key:z6Mkcredsrename-null', tenantId, 'nonce');
    const credId = await seedCredential(tenantId, 'rename-null');

    const res = await PATCH(
      req('PATCH', credId, { nickname: null }),
      params(credId),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { nickname: string | null };
    expect(body.nickname).toBeNull();
  });
});

describe('DELETE /api/webauthn/credentials/:id', () => {
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

  it('returns 401 without a session', async () => {
    const res = await DELETE(req('DELETE', 'any'), params('any'));
    expect(res.status).toBe(401);
  });

  it('returns 400 with cannot_delete_last_credential when only one remains', async () => {
    const tenantId = await seedTenant('del-last');
    await setSession('did:key:z6Mkcredsdel-last', tenantId, 'nonce');
    const credId = await seedCredential(tenantId, 'only');

    const res = await DELETE(req('DELETE', credId), params(credId));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('cannot_delete_last_credential');
  });

  it('deletes a credential when more than one is registered', async () => {
    const tenantId = await seedTenant('del-ok');
    await setSession('did:key:z6Mkcredsdel-ok', tenantId, 'nonce');
    const keepId = await seedCredential(tenantId, 'keep');
    const dropId = await seedCredential(tenantId, 'drop');
    void keepId;

    const res = await DELETE(req('DELETE', dropId), params(dropId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(body.id).toBe(dropId);
  });

  it("refuses to delete another tenant's credential (returns 400 last-credential or 404)", async () => {
    // My tenant has two credentials so the last-credential guard doesn't
    // mask the tenant-scope check. The victim's credential id lives on a
    // different tenant; the scoped delete returns zero rows, handler
    // returns 404.
    const mine = await seedTenant('cross-mine');
    const other = await seedTenant('cross-other');
    await setSession('did:key:z6Mkcredscross-mine', mine, 'nonce');
    await seedCredential(mine, 'my-a');
    await seedCredential(mine, 'my-b');
    const victimId = await seedCredential(other, 'victim');

    const res = await DELETE(req('DELETE', victimId), params(victimId));
    expect(res.status).toBe(404);
  });
});
