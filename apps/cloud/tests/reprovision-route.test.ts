/** AgentID S4 live gate: re-provision an owned name into hosted custody. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, registrarBindings, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient, TenantDb } from '@kybernesis/arp-cloud-db';
import { exportPrivateKey, mintIdentity } from '../lib/key-custody';

process.env['ARP_CLOUD_SESSION_SECRET'] = process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';
let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
let tenantId = '';
const PRINCIPAL = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
vi.mock('@/lib/db', async () => ({ getDb: async () => { if (!currentDb) throw new Error('no db'); return currentDb.db; }, resetDbForTests: async () => undefined }));
vi.mock('@/lib/session', async () => ({ getSession: async () => ({ principalDid: PRINCIPAL, tenantId }), SESSION_COOKIE: 'arp_cloud_session' }));

const { POST } = await import('../app/api/names/[sld]/reprovision/route');
const SEAL = Uint8Array.from(Buffer.from('a'.repeat(64), 'hex'));
const post = (sld: string) => POST(new Request('http://t.local/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), { params: Promise.resolve({ sld }) });

describe('POST /api/names/[sld]/reprovision', () => {
  let tdb: TenantDb;
  beforeEach(async () => {
    process.env['ARP_CLOUD_KEY_ENCRYPTION_KEY'] = Buffer.from(SEAL).toString('hex');
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    tenantId = (await currentDb.db.insert(tenants).values({ principalDid: PRINCIPAL }).returning({ id: tenants.id }))[0]!.id;
    tdb = withTenant(currentDb.db, toTenantId(tenantId));
    await currentDb.db.insert(registrarBindings).values({ tenantId, domain: 'atlas.agent', ownerLabel: 'owner', registrar: 'test', principalDid: PRINCIPAL, publicKeyMultibase: 'z6Mk', representationJwt: 'x' });
  });
  afterEach(async () => { if (currentDb) await currentDb.close(); currentDb = null; });

  it('rejects names the tenant does not own', async () => {
    const res = await post('nobody');
    expect(res.status).toBe(403);
  });

  it('moves an exported name back into hosted custody with a new key', async () => {
    await mintIdentity({ tenantDb: tdb, domain: 'atlas.agent', principalDid: PRINCIPAL, agentName: 'Atlas', agentDescription: 'desc', custody: 'cloud', runtimeKind: 'none', wellKnownOrigin: 'https://atlas.agent.arp.run', mirrorOrigin: 'https://atlas.agent.arp.run', sealKey: SEAL });
    await exportPrivateKey({ tenantDb: tdb, agentDid: 'did:web:atlas.agent', sealKey: SEAL });
    const before = await tdb.getAgent('did:web:atlas.agent');
    expect(before?.keyCustody).toBe('exported');

    const res = await post('atlas');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, agent_did: 'did:web:atlas.agent', custody: 'cloud', rotated: true });
    const after = await tdb.getAgent('did:web:atlas.agent');
    expect(after?.keyCustody).toBe('cloud');
    expect(after?.privateKeyEnc).toBeTruthy();
    expect(after?.publicKeyMultibase).not.toBe(before?.publicKeyMultibase);
    expect(after?.agentName).toBe('Atlas');
    expect(after?.runtimeKind).toBe('none');
    expect(((after?.wellKnownA2aCard as { signatures?: unknown[] } | null)?.signatures?.length ?? 0) > 0).toBe(true);
  });

  it('provisions an owned name that has no identity yet', async () => {
    const res = await post('atlas.agent');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, rotated: false });
    expect((await tdb.getAgent('did:web:atlas.agent'))?.keyCustody).toBe('cloud');
  });
});
