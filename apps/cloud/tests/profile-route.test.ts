/** AgentID S6c: the identity profile — edit in the console, published with the name. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, registrarBindings, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient, TenantDb } from '@kybernesis/arp-cloud-db';
import { exportPrivateKey, mintIdentity } from '../lib/key-custody';

process.env['ARP_CLOUD_SESSION_SECRET'] = process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';
let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
let tenantId = '';
const PRINCIPAL = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
let noSession = false;
vi.mock('@/lib/db', async () => ({ getDb: async () => { if (!currentDb) throw new Error('no db'); return currentDb.db; }, resetDbForTests: async () => undefined }));
vi.mock('@/lib/session', async () => ({ getSession: async () => (noSession ? null : { principalDid: PRINCIPAL, tenantId }), SESSION_COOKIE: 'arp_cloud_session' }));

const { GET, PUT } = await import('../app/api/names/[sld]/profile/route');
const { POST: reprovision } = await import('../app/api/names/[sld]/reprovision/route');
const SEAL = Uint8Array.from(Buffer.from('a'.repeat(64), 'hex'));
const params = (sld: string) => ({ params: Promise.resolve({ sld }) });
const put = (sld: string, body: unknown) => PUT(new Request('http://t.local/x', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), params(sld));
const get = (sld: string) => GET(new Request('http://t.local/x'), params(sld));

// A real 1×1 PNG so the magic-byte check passes.
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DATA_URL = `data:image/png;base64,${PNG_1PX}`;

describe('identity profile', () => {
  let tdb: TenantDb;
  beforeEach(async () => {
    process.env['ARP_CLOUD_KEY_ENCRYPTION_KEY'] = Buffer.from(SEAL).toString('hex');
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    tenantId = (await currentDb.db.insert(tenants).values({ principalDid: PRINCIPAL }).returning({ id: tenants.id }))[0]!.id;
    tdb = withTenant(currentDb.db, toTenantId(tenantId));
    await currentDb.db.insert(registrarBindings).values({ tenantId, domain: 'kyber.agent', ownerLabel: 'ian', registrar: 'test', principalDid: PRINCIPAL, publicKeyMultibase: 'z6Mk', representationJwt: 'x' });
    await mintIdentity({ tenantDb: tdb, domain: 'kyber.agent', principalDid: PRINCIPAL, agentName: 'Kyber', agentDescription: 'desc', custody: 'cloud', runtimeKind: 'none', wellKnownOrigin: 'https://kyber.agent.arp.run', mirrorOrigin: 'https://kyber.agent.arp.run', sealKey: SEAL });
  });
  afterEach(async () => { if (currentDb) await currentDb.close(); currentDb = null; noSession = false; });

  it('reads the profile with no picture', async () => {
    const body = (await (await get('kyber')).json()) as { profile: Record<string, unknown> };
    expect(body.profile).toMatchObject({ name: 'Kyber', description: 'desc', accent: null, picture: null });
  });

  it('the identity document lists the profile service from mint', async () => {
    const agent = await tdb.getAgent('did:web:kyber.agent');
    const svc = (agent?.wellKnownDid as { service: Array<{ type: string; serviceEndpoint: string }> }).service.find((s) => s.type === 'AgentProfile');
    expect(svc?.serviceEndpoint).toBe('https://kyber.agent.arp.run/.well-known/agent-profile.json');
  });

  it('saves name, description, accent and picture; the card carries the picture', async () => {
    const res = await put('kyber', { name: 'Kyber', description: 'Ian’s ops agent.', accent: '#10B981', avatar: DATA_URL });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; profile: Record<string, unknown> };
    expect(body.profile).toMatchObject({ description: 'Ian’s ops agent.', accent: '#10b981', picture: 'https://kyber.agent.arp.run/avatar.png' });
    const agent = await tdb.getAgent('did:web:kyber.agent');
    expect(agent?.avatarData).toBe(PNG_1PX);
    expect(agent?.avatarMime).toBe('image/png');
    expect((agent?.wellKnownA2aCard as { iconUrl?: string }).iconUrl).toBe('https://kyber.agent.arp.run/avatar.png');
    expect(((agent?.wellKnownA2aCard as { signatures?: unknown[] }).signatures?.length ?? 0) > 0).toBe(true);
  });

  it('rejects a picture that is not an image, or is too large', async () => {
    expect((await put('kyber', { avatar: 'data:image/png;base64,aGVsbG8=' })).status).toBe(400);
    expect((await put('kyber', { avatar: `data:text/plain;base64,${PNG_1PX}` })).status).toBe(400);
    const big = `data:image/png;base64,${PNG_1PX}${'A'.repeat(560_000)}`;
    expect((await put('kyber', { avatar: big })).status).toBe(413);
    expect((await put('kyber', { accent: 'green' })).status).toBe(400);
  });

  it('clears the picture with null and drops it from the card', async () => {
    await put('kyber', { avatar: DATA_URL });
    const res = await put('kyber', { avatar: null });
    expect(((await res.json()) as { profile: { picture: unknown } }).profile.picture).toBeNull();
    const agent = await tdb.getAgent('did:web:kyber.agent');
    expect(agent?.avatarData).toBeNull();
    expect((agent?.wellKnownA2aCard as { iconUrl?: string }).iconUrl).toBeUndefined();
  });

  it('a re-provision (key rotation) keeps the picture and accent', async () => {
    await put('kyber', { avatar: DATA_URL, accent: '#22d3ee' });
    await exportPrivateKey({ tenantDb: tdb, agentDid: 'did:web:kyber.agent', sealKey: SEAL });
    const res = await reprovision(new Request('http://t.local/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), params('kyber'));
    expect(res.status).toBe(200);
    const agent = await tdb.getAgent('did:web:kyber.agent');
    expect(agent?.avatarData).toBe(PNG_1PX);
    expect(agent?.accent).toBe('#22d3ee');
    expect((agent?.wellKnownA2aCard as { iconUrl?: string }).iconUrl).toBe('https://kyber.agent.arp.run/avatar.png');
  });

  it('404 for a name the account does not hold, 401 without a session', async () => {
    expect((await get('nobody')).status).toBe(404);
    noSession = true;
    expect((await put('kyber', { name: 'x' })).status).toBe(401);
  });
});
