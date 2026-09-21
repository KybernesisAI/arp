/** AgentID S6d: /api/account + email sign-in routes. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, tenants } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';
import { installCookieMock, installHeadersMock } from './helpers/cookies';

process.env['ARP_CLOUD_SESSION_SECRET'] = process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';
let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
vi.mock('@/lib/db', async () => ({ getDb: async () => { if (!currentDb) throw new Error('no db'); return currentDb.db; }, resetDbForTests: async () => undefined }));
// Capture outbound mail instead of calling Resend.
const sent: Array<{ to: string; subject: string }> = [];
vi.mock('@/lib/email', async () => {
  const real = await vi.importActual<typeof import('../lib/email')>('../lib/email');
  return { ...real, sendEmail: async (msg: { to: string; subject: string }) => { sent.push({ to: msg.to, subject: msg.subject }); return { id: 'em', delivered: true }; } };
});

const cookieStore = installCookieMock();
installHeadersMock();
const { setSession, clearSession } = await import('../lib/session');
const { GET: accountGet, PATCH: accountPatch } = await import('../app/api/account/route');
const { POST: emailStart } = await import('../app/api/account/email/start/route');
const { POST: emailConfirm } = await import('../app/api/account/email/confirm/route');
const { POST: signInStart } = await import('../app/api/auth/email/start/route');
const { POST: signInVerify } = await import('../app/api/auth/email/verify/route');

const PRINCIPAL = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
const post = (fn: (r: Request) => Promise<Response>, body: unknown) => fn(new Request('http://t.local/x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify(body) }));
const codeFrom = (subject: string) => /(\d{6})/.exec(subject)![1]!;

describe('owner account', () => {
  let tenantId = '';
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    tenantId = (await currentDb.db.insert(tenants).values({ principalDid: PRINCIPAL, displayName: null }).returning({ id: tenants.id }))[0]!.id;
    await setSession(PRINCIPAL, tenantId, 'n1');
    sent.length = 0;
  });
  afterEach(async () => { if (currentDb) await currentDb.close(); currentDb = null; cookieStore.clear(); });

  it('GET/PATCH /api/account', async () => {
    let res = await accountGet();
    expect(res.status).toBe(200);
    let body = (await res.json()) as { account: { name: string | null; email: string | null; email_verified: boolean; passkeys: unknown[] } };
    expect(body.account).toMatchObject({ name: null, email: null, email_verified: false, passkeys: [] });
    res = await accountPatch(new Request('http://t.local/x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '  Ian  ' }) }));
    expect(res.status).toBe(200);
    body = (await (await accountGet()).json()) as typeof body;
    expect(body.account.name).toBe('Ian');
    expect((await accountPatch(new Request('http://t.local/x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '' }) }))).status).toBe(400);
    await clearSession();
    expect((await accountGet()).status).toBe(401);
  });

  it('adds an email with a code, then signs in with it from a cold session', async () => {
    // 1. start
    let res = await post(emailStart, { email: 'Ian@Example.com' });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('ian@example.com');
    const code = codeFrom(sent[0]!.subject);
    // 2. wrong code, then right code
    expect((await post(emailConfirm, { email: 'ian@example.com', code: '000000' })).status).toBe(401);
    res = await post(emailConfirm, { email: 'ian@example.com', code });
    expect(res.status).toBe(200);
    const row = (await currentDb!.db.select().from(tenants).where(eq(tenants.id, tenantId)))[0]!;
    expect(row.email).toBe('ian@example.com');
    expect(row.emailVerifiedAt).not.toBeNull();
    expect((await (await accountGet()).json() as { account: { email_verified: boolean } }).account.email_verified).toBe(true);

    // 3. new device: no session. Ask for a sign-in code.
    await clearSession();
    expect((await accountGet()).status).toBe(401);
    sent.length = 0;
    res = await post(signInStart, { email: 'ian@example.com' });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    const signInCode = codeFrom(sent[0]!.subject);
    expect((await post(signInVerify, { email: 'ian@example.com', code: '123' })).status).toBe(400);
    expect((await post(signInVerify, { email: 'ian@example.com', code: '000000' })).status).toBe(401);
    res = await post(signInVerify, { email: 'ian@example.com', code: signInCode });
    expect(res.status).toBe(200);
    // 4. the session now reaches the account
    res = await accountGet();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { account: { email: string } }).account.email).toBe('ian@example.com');
  });

  it('sign-in start never reveals whether an address exists, and sends nothing for strangers', async () => {
    const res = await post(signInStart, { email: 'stranger@example.com' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { message: string }).message).toMatch(/if that address has an account/i);
    expect(sent).toHaveLength(0);
    expect((await post(signInStart, { email: 'not-an-email' })).status).toBe(400);
  });

  it('an address on another account cannot be claimed', async () => {
    await currentDb!.db.insert(tenants).values({ principalDid: 'did:key:z6MkOther', email: 'taken@example.com', emailVerifiedAt: new Date() });
    const res = await post(emailStart, { email: 'taken@example.com' });
    expect(res.status).toBe(409);
    expect(sent).toHaveLength(0);
  });

  it('a verify code issued to one account cannot confirm on another', async () => {
    await post(emailStart, { email: 'mine@example.com' });
    const code = codeFrom(sent[0]!.subject);
    const other = (await currentDb!.db.insert(tenants).values({ principalDid: 'did:key:z6MkOther2' }).returning({ id: tenants.id }))[0]!.id;
    await setSession('did:key:z6MkOther2', other, 'n2');
    expect((await post(emailConfirm, { email: 'mine@example.com', code })).status).toBe(401);
  });
});
