/** S6d: device link — the key travels sealed from a device that has it to one that does not. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, deviceLinks, tenants } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { installCookieMock, installHeadersMock } from './helpers/cookies';

process.env['ARP_CLOUD_SESSION_SECRET'] = process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';
let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
vi.mock('@/lib/db', async () => ({ getDb: async () => { if (!currentDb) throw new Error('no db'); return currentDb.db; }, resetDbForTests: async () => undefined }));
const cookieStore = installCookieMock();
installHeadersMock();

const { setSession } = await import('../lib/session');
const { claimLink, deliverLink, pollLink, startLink, MAX_CLAIM_ATTEMPTS } = await import('../lib/device-link');
const { createReceiver, openFromSender, sealForReceiver } = await import('../lib/device-link-crypto');
const { POST: start } = await import('../app/api/account/device-link/route');
const { POST: claim } = await import('../app/api/account/device-link/claim/route');
const { POST: deliver } = await import('../app/api/account/device-link/deliver/route');
const { GET: poll } = await import('../app/api/account/device-link/[id]/route');

const PRINCIPAL = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
const PAYLOAD = { privateKeyHex: 'ab'.repeat(32), publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK', did: PRINCIPAL, version: 'v1' as const, phrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' };
const post = (fn: (r: Request) => Promise<Response>, body: unknown) => fn(new Request('http://t.local/x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify(body) }));

describe('device link crypto (WebCrypto only)', () => {
  it('round-trips a payload and refuses tampering', async () => {
    const r = await createReceiver();
    const sealed = await sealForReceiver(r.pub, PAYLOAD);
    expect(sealed.ciphertext).not.toContain(PAYLOAD.privateKeyHex);
    expect(await openFromSender(r.privateKey, r.pub, sealed)).toEqual(PAYLOAD);
    const other = await createReceiver();
    await expect(openFromSender(other.privateKey, other.pub, sealed)).rejects.toThrow();
    await expect(openFromSender(r.privateKey, r.pub, { ...sealed, ciphertext: sealed.ciphertext.slice(0, -2) + 'AA' })).rejects.toThrow();
  });
});

describe('device link ledger + routes', () => {
  let tenantId = '';
  let otherTenant = '';
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    tenantId = (await currentDb.db.insert(tenants).values({ principalDid: PRINCIPAL }).returning({ id: tenants.id }))[0]!.id;
    otherTenant = (await currentDb.db.insert(tenants).values({ principalDid: 'did:key:z6MkOther' }).returning({ id: tenants.id }))[0]!.id;
    await setSession(PRINCIPAL, tenantId, 'n1');
  });
  afterEach(async () => { if (currentDb) await currentDb.close(); currentDb = null; cookieStore.clear(); });

  it('full trip: new device starts → old device claims + delivers → new device polls once', async () => {
    const receiver = await createReceiver();
    let res = await post(start, { receiver_pub: receiver.pub });
    expect(res.status).toBe(200);
    const { id, code } = (await res.json()) as { id: string; code: string };
    expect(code).toMatch(/^\d{6}$/);
    // Nothing yet.
    res = await poll(new Request('http://t.local/x'), { params: Promise.resolve({ id }) });
    expect(((await res.json()) as { status: string }).status).toBe('waiting');
    // Wrong code, then right code.
    expect((await post(claim, { code: '000000' })).status).toBe(404);
    res = await post(claim, { code });
    expect(res.status).toBe(200);
    const cb = (await res.json()) as { id: string; receiver_pub: string };
    expect(cb.receiver_pub).toBe(receiver.pub);
    const sealed = await sealForReceiver(cb.receiver_pub, PAYLOAD);
    res = await post(deliver, { id: cb.id, ciphertext: sealed.ciphertext, iv: sealed.iv, sender_pub: sealed.senderPub });
    expect(res.status).toBe(200);
    // Delivered once; the server drops the ciphertext after handing it out.
    res = await poll(new Request('http://t.local/x'), { params: Promise.resolve({ id }) });
    const body = (await res.json()) as { status: string; ciphertext: string; iv: string; sender_pub: string };
    expect(body.status).toBe('delivered');
    expect(await openFromSender(receiver.privateKey, receiver.pub, { ciphertext: body.ciphertext, iv: body.iv, senderPub: body.sender_pub })).toEqual(PAYLOAD);
    res = await poll(new Request('http://t.local/x'), { params: Promise.resolve({ id }) });
    expect(((await res.json()) as { status: string }).status).toBe('expired');
    const row = (await currentDb!.db.select().from(deviceLinks))[0]!;
    expect(row.ciphertext).toBeNull();
    expect(row.consumedAt).not.toBeNull();
    // A delivered link cannot be delivered again.
    expect((await post(deliver, { id: cb.id, ciphertext: sealed.ciphertext, iv: sealed.iv, sender_pub: sealed.senderPub })).status).toBe(409);
  });

  it('another account cannot claim or read the link', async () => {
    const r = await createReceiver();
    const { id, code } = await startLink(currentDb!.db, tenantId, r.pub);
    expect(await claimLink(currentDb!.db, otherTenant, code)).toEqual({ ok: false, reason: 'invalid' });
    expect(await pollLink(currentDb!.db, otherTenant, id)).toEqual({ status: 'expired' });
    expect(await deliverLink(currentDb!.db, otherTenant, id, { ciphertext: 'x', iv: 'y', senderPub: 'z' })).toBe(false);
  });

  it('expires, and locks after too many wrong codes', async () => {
    const r = await createReceiver();
    const { id, code } = await startLink(currentDb!.db, tenantId, r.pub, '123456');
    for (let i = 1; i < MAX_CLAIM_ATTEMPTS; i++) expect(await claimLink(currentDb!.db, tenantId, '999999')).toEqual({ ok: false, reason: 'invalid' });
    expect(await claimLink(currentDb!.db, tenantId, '999999')).toEqual({ ok: false, reason: 'locked' });
    expect(await claimLink(currentDb!.db, tenantId, code)).toEqual({ ok: false, reason: 'locked' });
    await currentDb!.db.update(deviceLinks).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await pollLink(currentDb!.db, tenantId, id)).toEqual({ status: 'expired' });
    expect(await claimLink(currentDb!.db, tenantId, code)).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects malformed input and unauthenticated calls', async () => {
    expect((await post(start, { receiver_pub: 'short' })).status).toBe(400);
    expect((await post(deliver, { id: 'nope', ciphertext: 'x', iv: 'y', sender_pub: 'z' })).status).toBe(400);
    cookieStore.clear();
    expect((await post(start, { receiver_pub: 'A'.repeat(88) })).status).toBe(401);
  });
});
