/** AgentID S6d: one-time email codes — issue, redeem, expiry, lockout, unknown-address silence. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, loginCodes, tenants } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
vi.mock('@/lib/db', async () => ({ getDb: async () => { if (!currentDb) throw new Error('no db'); return currentDb.db; } }));

const { issueCode, redeemCode, normalizeEmail, tenantIdForEmail, MAX_ATTEMPTS } = await import('../lib/login-codes');
const { sendEmail, codeEmail } = await import('../lib/email');

const sent: Array<{ to: string; subject: string }> = [];
const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body)) as { to: string[]; subject: string };
  sent.push({ to: body.to[0]!, subject: body.subject });
  return new Response(JSON.stringify({ id: 'em_1' }), { status: 200, headers: { 'content-type': 'application/json' } });
}) as unknown as typeof fetch;

describe('login codes', () => {
  let tenantId = '';
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    tenantId = (await currentDb.db.insert(tenants).values({ principalDid: 'did:key:z6MkloginCodes', email: 'Ian@Example.com', emailVerifiedAt: new Date() }).returning({ id: tenants.id }))[0]!.id;
    sent.length = 0;
    process.env['RESEND_API_KEY'] = 're_test';
  });
  afterEach(async () => { if (currentDb) await currentDb.close(); currentDb = null; delete process.env['RESEND_API_KEY']; });

  it('normalises addresses and finds the tenant case-insensitively', async () => {
    expect(normalizeEmail('  Ian@Example.com ')).toBe('ian@example.com');
    expect(normalizeEmail('nope')).toBeNull();
    expect(await tenantIdForEmail(currentDb!.db, 'ian@example.com')).toBe(tenantId);
    expect(await tenantIdForEmail(currentDb!.db, 'other@example.com')).toBeNull();
  });

  it('sign_in: sends a code for a known address, stays silent for an unknown one', async () => {
    expect(await issueCode(currentDb!.db, { email: 'nobody@example.com', purpose: 'sign_in' }, { fetchImpl: fakeFetch })).toEqual({ sent: false });
    expect(sent).toHaveLength(0);
    expect(await issueCode(currentDb!.db, { email: 'ian@example.com', purpose: 'sign_in' }, { fetchImpl: fakeFetch, codeOverride: '123456' })).toEqual({ sent: true });
    expect(sent[0]!.to).toBe('ian@example.com');
    expect(sent[0]!.subject).toContain('123456');
    // The code is never stored in clear.
    const rows = await currentDb!.db.select().from(loginCodes);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.codeHash).not.toContain('123456');
    expect(rows[0]!.tenantId).toBe(tenantId);
  });

  it('redeems once, then the code is gone', async () => {
    await issueCode(currentDb!.db, { email: 'ian@example.com', purpose: 'sign_in' }, { fetchImpl: fakeFetch, codeOverride: '654321' });
    expect(await redeemCode(currentDb!.db, { email: 'ian@example.com', code: '654 321', purpose: 'sign_in' })).toEqual({ ok: true, tenantId });
    expect(await redeemCode(currentDb!.db, { email: 'ian@example.com', code: '654321', purpose: 'sign_in' })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('a new code retires the previous one', async () => {
    await issueCode(currentDb!.db, { email: 'ian@example.com', purpose: 'sign_in' }, { fetchImpl: fakeFetch, codeOverride: '111111' });
    await issueCode(currentDb!.db, { email: 'ian@example.com', purpose: 'sign_in' }, { fetchImpl: fakeFetch, codeOverride: '222222' });
    expect(await redeemCode(currentDb!.db, { email: 'ian@example.com', code: '111111', purpose: 'sign_in' })).toMatchObject({ ok: false });
    expect(await redeemCode(currentDb!.db, { email: 'ian@example.com', code: '222222', purpose: 'sign_in' })).toMatchObject({ ok: true });
  });

  it('locks after too many wrong tries', async () => {
    await issueCode(currentDb!.db, { email: 'ian@example.com', purpose: 'sign_in' }, { fetchImpl: fakeFetch, codeOverride: '999999' });
    for (let i = 1; i < MAX_ATTEMPTS; i++) expect(await redeemCode(currentDb!.db, { email: 'ian@example.com', code: '000000', purpose: 'sign_in' })).toEqual({ ok: false, reason: 'invalid' });
    expect(await redeemCode(currentDb!.db, { email: 'ian@example.com', code: '000000', purpose: 'sign_in' })).toEqual({ ok: false, reason: 'locked' });
    expect(await redeemCode(currentDb!.db, { email: 'ian@example.com', code: '999999', purpose: 'sign_in' })).toEqual({ ok: false, reason: 'locked' });
  });

  it('expired codes are refused', async () => {
    await issueCode(currentDb!.db, { email: 'ian@example.com', purpose: 'sign_in' }, { fetchImpl: fakeFetch, codeOverride: '424242' });
    await currentDb!.db.update(loginCodes).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await redeemCode(currentDb!.db, { email: 'ian@example.com', code: '424242', purpose: 'sign_in' })).toEqual({ ok: false, reason: 'expired' });
  });

  it('verify_email codes carry the tenant they were issued for, and purposes do not cross', async () => {
    await issueCode(currentDb!.db, { email: 'new@example.com', purpose: 'verify_email', tenantId }, { fetchImpl: fakeFetch, codeOverride: '777777' });
    expect(await redeemCode(currentDb!.db, { email: 'new@example.com', code: '777777', purpose: 'sign_in' })).toEqual({ ok: false, reason: 'invalid' });
    expect(await redeemCode(currentDb!.db, { email: 'new@example.com', code: '777777', purpose: 'verify_email' })).toEqual({ ok: true, tenantId });
  });

  it('email: no key → logged, not sent; message copy is plain', async () => {
    delete process.env['RESEND_API_KEY'];
    expect(await sendEmail({ to: 'x@example.com', subject: 's', text: 't' })).toEqual({ id: null, delivered: false });
    const m = codeEmail('123456', 'sign_in');
    expect(m.subject).toBe('123456 is your AgentID sign-in code');
    expect(m.text).toContain('10 minutes');
    expect(m.html).not.toMatch(/did:|headless|hns/i);
  });
});
