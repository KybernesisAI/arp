/** AgentID: give a name to someone else — create link → preview → claim by another account. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { agentLinks, createPgliteDb, domainRegistrations, nameGifts, registrarBindings, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient, TenantDb } from '@kybernesis/arp-cloud-db';
import { mintIdentity } from '../lib/key-custody';

process.env['ARP_CLOUD_SESSION_SECRET'] = process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';
let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
const GIVER = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
const TAKER = 'did:key:z6MkrJVnaZkeFzdQyMZu1cgjg7k1pZZ6pvBQ7XJPt4swbTQ2';
let giverId = '';
let takerId = '';
// The mocked session flips between the two accounts per call.
let who: { principalDid: string; tenantId: string } = { principalDid: GIVER, tenantId: '' };
let noSession = false;

vi.mock('@/lib/db', async () => ({ getDb: async () => { if (!currentDb) throw new Error('no db'); return currentDb.db; }, resetDbForTests: async () => undefined }));
vi.mock('@/lib/session', async () => ({ getSession: async () => (noSession ? null : who), SESSION_COOKIE: 'arp_cloud_session' }));

const giftRoute = await import('../app/api/names/[sld]/gift/route');
const { POST: preview } = await import('../app/api/gifts/preview/route');
const { POST: claim } = await import('../app/api/gifts/claim/route');
const SEAL = Uint8Array.from(Buffer.from('a'.repeat(64), 'hex'));

const asGiver = () => { who = { principalDid: GIVER, tenantId: giverId }; };
const asTaker = () => { who = { principalDid: TAKER, tenantId: takerId }; };
const json = (body: unknown, headers: Record<string, string> = {}) => new Request('http://cloud.test/x', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const params = (sld: string) => ({ params: Promise.resolve({ sld }) });
const tokenOf = (url: string) => url.split('#')[1]!;

describe('gift a name', () => {
  let giverDb: TenantDb;
  let takerDb: TenantDb;
  beforeEach(async () => {
    process.env['ARP_CLOUD_KEY_ENCRYPTION_KEY'] = Buffer.from(SEAL).toString('hex');
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    giverId = (await currentDb.db.insert(tenants).values({ principalDid: GIVER, displayName: 'Ian' }).returning({ id: tenants.id }))[0]!.id;
    takerId = (await currentDb.db.insert(tenants).values({ principalDid: TAKER }).returning({ id: tenants.id }))[0]!.id;
    giverDb = withTenant(currentDb.db, toTenantId(giverId));
    takerDb = withTenant(currentDb.db, toTenantId(takerId));
    const reg = await giverDb.createRegistration({ sld: 'lilly', years: 1, priceCents: 2900 });
    await giverDb.updateRegistration(reg.id, { status: 'active', ownerLabel: 'ian' });
    await currentDb.db.insert(registrarBindings).values({ tenantId: giverId, domain: 'lilly.agent', ownerLabel: 'ian', registrar: 'test', principalDid: GIVER, publicKeyMultibase: 'z6Mk', representationJwt: 'x' });
    await mintIdentity({ tenantDb: giverDb, domain: 'lilly.agent', principalDid: GIVER, agentName: 'Lilly', agentDescription: 'A gift', custody: 'cloud', runtimeKind: 'none', domainRegistrationId: reg.id, wellKnownOrigin: 'https://lilly.agent.arp.run', mirrorOrigin: 'https://lilly.agent.arp.run', sealKey: SEAL });
    await giverDb.createLink({ agentDid: 'did:web:lilly.agent', kind: 'runtime', value: 'https://old.example', challenge: 'c' });
    asGiver();
  });
  afterEach(async () => { if (currentDb) await currentDb.close(); currentDb = null; });

  it('refuses to gift a name the account does not hold', async () => {
    const res = await giftRoute.POST(json({}), params('nobody'));
    expect(res.status).toBe(403);
  });

  it('creates a link with the token in the fragment, reports it pending, and can cancel it', async () => {
    const res = await giftRoute.POST(json({ message: '  Yours now.  ' }, { 'x-forwarded-host': 'cloud.arp.run', 'x-forwarded-proto': 'https' }), params('lilly'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; domain: string };
    expect(body.domain).toBe('lilly.agent');
    expect(body.url).toMatch(/^https:\/\/cloud\.arp\.run\/gift#[A-Za-z0-9_-]{20,}$/);
    const stored = await currentDb!.db.select().from(nameGifts);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.tokenHash).not.toContain(tokenOf(body.url));
    expect(stored[0]!.message).toBe('Yours now.');

    const pending = (await (await giftRoute.GET(new Request('http://cloud.test/x'), params('lilly'))).json()) as { pending: { message: string } | null };
    expect(pending.pending?.message).toBe('Yours now.');

    const cancel = (await (await giftRoute.DELETE(new Request('http://cloud.test/x', { method: 'DELETE' }), params('lilly'))).json()) as { cancelled: boolean };
    expect(cancel.cancelled).toBe(true);
    const after = (await (await preview(json({ token: tokenOf(body.url) }))).json()) as { state: string };
    expect(after.state).toBe('cancelled');
  });

  it('a new link supersedes the old one', async () => {
    const first = (await (await giftRoute.POST(json({}), params('lilly'))).json()) as { url: string };
    const second = (await (await giftRoute.POST(json({}), params('lilly'))).json()) as { url: string };
    expect((await (await preview(json({ token: tokenOf(first.url) }))).json()).state).toBe('cancelled');
    expect((await (await preview(json({ token: tokenOf(second.url) }))).json()).state).toBe('pending');
  });

  it('previews publicly with only the name, note and sender', async () => {
    const { url } = (await (await giftRoute.POST(json({ message: 'hi' }), params('lilly'))).json()) as { url: string };
    who = { principalDid: 'did:key:nobody', tenantId: '' };
    const p = (await (await preview(json({ token: tokenOf(url) }))).json()) as Record<string, unknown>;
    expect(p).toMatchObject({ state: 'pending', domain: 'lilly.agent', sld: 'lilly', message: 'hi', from: 'Ian' });
    expect(Object.keys(p).sort()).toEqual(['domain', 'expiresAt', 'from', 'message', 'sld', 'state']);
    expect((await (await preview(json({ token: 'not-a-real-token-at-all' }))).json()).state).toBe('invalid');
  });

  it('moves the name to the recipient with a fresh identity and retires the giver\'s', async () => {
    const { url } = (await (await giftRoute.POST(json({}), params('lilly'))).json()) as { url: string };
    const before = await giverDb.getAgent('did:web:lilly.agent');
    asTaker();
    const res = await claim(json({ token: tokenOf(url) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, domain: 'lilly.agent', sld: 'lilly', identity: 'ready' });

    // Registration is the recipient's now; the giver's owner proof is gone.
    const regs = await currentDb!.db.select().from(domainRegistrations).where(eq(domainRegistrations.domain, 'lilly.agent'));
    expect(regs).toHaveLength(1);
    expect(regs[0]!.tenantId).toBe(takerId);
    expect(regs[0]!.ownerLabel).toBeNull();
    expect(await currentDb!.db.select().from(registrarBindings).where(eq(registrarBindings.domain, 'lilly.agent'))).toHaveLength(0);
    expect(await currentDb!.db.select().from(agentLinks).where(eq(agentLinks.agentDid, 'did:web:lilly.agent'))).toHaveLength(0);

    // Giver lost the identity; recipient has a new key under their own principal, name carried over.
    expect(await giverDb.getAgent('did:web:lilly.agent')).toBeNull();
    const mine = await takerDb.getAgent('did:web:lilly.agent');
    expect(mine?.keyCustody).toBe('cloud');
    expect(mine?.principalDid).toBe(TAKER);
    expect(mine?.agentName).toBe('Lilly');
    expect(mine?.publicKeyMultibase).not.toBe(before?.publicKeyMultibase);
    expect(await takerDb.getRegistrationByDomain('lilly.agent')).not.toBeNull();
    expect(await giverDb.getRegistrationByDomain('lilly.agent')).toBeNull();

    // Single use.
    expect((await claim(json({ token: tokenOf(url) }))).status).toBe(409);
    expect((await (await preview(json({ token: tokenOf(url) }))).json()).state).toBe('claimed');
  });

  it('will not let the giver accept their own gift', async () => {
    const { url } = (await (await giftRoute.POST(json({}), params('lilly'))).json()) as { url: string };
    const res = await claim(json({ token: tokenOf(url) }));
    expect(res.status).toBe(400);
    expect(await takerDb.getRegistrationByDomain('lilly.agent')).toBeNull();
  });

  it('rejects an expired link', async () => {
    const { url } = (await (await giftRoute.POST(json({}), params('lilly'))).json()) as { url: string };
    await currentDb!.db.update(nameGifts).set({ expiresAt: new Date(Date.now() - 1000) });
    asTaker();
    expect((await claim(json({ token: tokenOf(url) }))).status).toBe(410);
    expect((await (await preview(json({ token: tokenOf(url) }))).json()).state).toBe('expired');
  });

  it('requires a session to claim', async () => {
    const { url } = (await (await giftRoute.POST(json({}), params('lilly'))).json()) as { url: string };
    noSession = true;
    try {
      const res = await claim(json({ token: tokenOf(url) }));
      expect(res.status).toBe(401);
    } finally {
      noSession = false;
    }
  });
});
