/** Lander billing model: renewals, reminders and billing notifications. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, domainRegistrations, emailLog, tenants } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
vi.mock('@/lib/db', async () => ({ getDb: async () => { if (!currentDb) throw new Error('no db'); return currentDb.db; } }));
const sent: Array<{ to: string; subject: string }> = [];
vi.mock('@/lib/email', async () => {
  const real = await vi.importActual<typeof import('../lib/email')>('../lib/email');
  return { ...real, sendEmail: async (msg: { to: string; subject: string }) => { sent.push({ to: msg.to, subject: msg.subject }); return { id: 'em', delivered: true }; } };
});

const { recordNameRenewalPaid, applyNameSubscriptionChange, sendRenewalReminders, notifyPaymentFailed, notifyConnectChanged } = await import('../lib/renewals');
const { canPair } = await import('../lib/billing');

const DAY = 24 * 60 * 60 * 1000;
const deps = { opsEmail: 'ops@example.com' };

describe('renewals', () => {
  let tenantId = '';
  let regId = '';
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    tenantId = (await currentDb.db.insert(tenants).values({ principalDid: 'did:key:z6MkRenewals', email: 'owner@example.com' }).returning({ id: tenants.id }))[0]!.id;
    regId = (await currentDb.db.insert(domainRegistrations).values({ tenantId, domain: 'samantha.agent', sld: 'samantha', status: 'registered', years: 1, priceCents: 2900, stripeSubscriptionId: 'sub_1', autoRenew: true, expiryAt: new Date(Date.now() + 20 * DAY), currentPeriodEnd: new Date(Date.now() + 20 * DAY) }).returning({ id: domainRegistrations.id }))[0]!.id;
    sent.length = 0;
  });
  afterEach(async () => { if (currentDb) await currentDb.close(); currentDb = null; });

  it('a paid renewal extends the period, thanks the owner once, and tells ops once', async () => {
    const periodEnd = new Date(Date.now() + 385 * DAY);
    expect(await recordNameRenewalPaid(currentDb!.db, { subscriptionId: 'sub_1', tenantId, periodEnd, invoiceId: 'in_1' }, deps)).toBe('ok');
    const row = (await currentDb!.db.select().from(domainRegistrations))[0]!;
    expect(row.id).toBe(regId);
    expect(row.currentPeriodEnd?.toISOString()).toBe(periodEnd.toISOString());
    expect(row.upstreamRenewalStatus).toBe('pending');
    expect(row.lastReminderDays).toBeNull();
    expect(sent.map((s) => s.to).sort()).toEqual(['ops@example.com', 'owner@example.com']);
    expect(sent.find((s) => s.to === 'owner@example.com')!.subject).toContain('renewed');
    // Replay of the same invoice sends nothing more.
    await recordNameRenewalPaid(currentDb!.db, { subscriptionId: 'sub_1', tenantId, periodEnd, invoiceId: 'in_1' }, deps);
    expect(sent).toHaveLength(2);
    expect(await recordNameRenewalPaid(currentDb!.db, { subscriptionId: 'sub_nope', tenantId, periodEnd, invoiceId: 'in_2' }, deps)).toBe('unknown_subscription');
  });

  it('subscription changes mirror auto-renew and the period end', async () => {
    const end = new Date(Date.now() + 300 * DAY);
    expect(await applyNameSubscriptionChange(currentDb!.db, { subscriptionId: 'sub_1', tenantId, autoRenew: false, periodEnd: end })).toBe('ok');
    const row = (await currentDb!.db.select().from(domainRegistrations))[0]!;
    expect(row.autoRenew).toBe(false);
    expect(row.currentPeriodEnd?.toISOString()).toBe(end.toISOString());
  });

  it('reminders go out at 30, 7 and 1 days, once each, and say the right thing', async () => {
    const t0 = Date.now();
    const at = (daysBefore: number) => ({ ...deps, now: () => new Date(t0 + (20 - daysBefore) * DAY) });
    // 20 days out: 30-day reminder due.
    let r = await sendRenewalReminders(currentDb!.db, at(20));
    expect(r.sent).toBe(1);
    expect(sent[0]!.subject).toMatch(/renews in 20 days/);
    // Same day again: nothing.
    r = await sendRenewalReminders(currentDb!.db, at(20));
    expect(r.sent).toBe(0);
    // 10 days out: still inside the 30 window, 7 not yet.
    r = await sendRenewalReminders(currentDb!.db, at(10));
    expect(r.sent).toBe(0);
    // 5 days out: the 7-day reminder.
    r = await sendRenewalReminders(currentDb!.db, at(5));
    expect(r.sent).toBe(1);
    // 1 day out.
    r = await sendRenewalReminders(currentDb!.db, at(1));
    expect(r.sent).toBe(1);
    expect(sent[2]!.subject).toMatch(/renews tomorrow/);
    expect((await currentDb!.db.select().from(emailLog)).length).toBe(3);
  });

  it('with renewal off, reminders warn about expiry instead', async () => {
    await currentDb!.db.update(domainRegistrations).set({ autoRenew: false });
    const r = await sendRenewalReminders(currentDb!.db, { ...deps, now: () => new Date(Date.now() + 19 * DAY) });
    expect(r.sent).toBe(1);
    expect(sent[0]!.subject).toMatch(/expires tomorrow/);
  });

  it('payment failed and Connect changes are told once a day', async () => {
    const day = { ...deps, now: () => new Date('2026-10-01T10:00:00Z') };
    await notifyPaymentFailed(currentDb!.db, { tenantId, subscriptionId: 'sub_1', kind: 'agentid_name' }, day);
    await notifyPaymentFailed(currentDb!.db, { tenantId, subscriptionId: 'sub_1', kind: 'agentid_name' }, day);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toContain('samantha.agent');
    await notifyConnectChanged(currentDb!.db, { tenantId, active: true }, day);
    await notifyConnectChanged(currentDb!.db, { tenantId, active: true }, day);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.subject).toBe('Connect is on');
  });

  it('canPair: Connect or internal', () => {
    expect(canPair({ plan: 'free', connectStatus: 'none' })).toBe(false);
    expect(canPair({ plan: 'free', connectStatus: 'active' })).toBe(true);
    expect(canPair({ plan: 'free', connectStatus: 'past_due' })).toBe(true);
    expect(canPair({ plan: 'free', connectStatus: 'canceled' })).toBe(false);
    expect(canPair({ plan: 'internal', connectStatus: 'none' })).toBe(true);
  });
});
