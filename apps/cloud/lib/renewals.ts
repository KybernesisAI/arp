/**
 * Renewals + billing notifications (lander model, 2026-09-29).
 *
 * The customer side is Stripe: each name is a yearly subscription. When a
 * renewal invoice is paid we (1) extend the period on our row, (2) thank the
 * customer, (3) tell ops to renew the name at the supplier — the registrar
 * has no renewal API yet, so that step is a person until it does. The daily
 * cron sends reminders 30/7/1 days before the period ends, once each.
 */

import { and, eq, gt, inArray, lte } from 'drizzle-orm';
import { domainRegistrations, tenants, toTenantId, withTenant, type CloudDbClient } from '@kybernesis/arp-cloud-db';
import { connectChangedEmail, nameRenewedEmail, opsUpstreamRenewalEmail, paymentFailedEmail, renewalReminderEmail } from './email';
import { sendOnce } from './notify';
import { consoleUrl } from './origins';

export const REMINDER_DAYS = [30, 7, 1] as const;

export interface RenewalDeps { fetchImpl?: typeof fetch; opsEmail: string; now?: () => Date }

async function tenantEmail(db: CloudDbClient, tenantId: string): Promise<string | null> {
  const t = (await db.select({ email: tenants.email }).from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  return t?.email ?? null;
}

/** invoice.paid for a name's renewal cycle. */
export async function recordNameRenewalPaid(db: CloudDbClient, input: { subscriptionId: string; tenantId: string; periodEnd: Date | null; invoiceId: string }, deps: RenewalDeps): Promise<'ok' | 'unknown_subscription'> {
  const row = (await db.select().from(domainRegistrations).where(and(eq(domainRegistrations.stripeSubscriptionId, input.subscriptionId), eq(domainRegistrations.tenantId, input.tenantId))).limit(1))[0];
  if (!row) return 'unknown_subscription';
  await withTenant(db, toTenantId(input.tenantId)).updateRegistration(row.id, {
    currentPeriodEnd: input.periodEnd ?? row.currentPeriodEnd,
    upstreamRenewalStatus: 'pending',
    lastReminderDays: null,
    autoRenew: true,
  });
  const to = await tenantEmail(db, input.tenantId);
  await sendOnce(db, { kind: 'name_renewed', ref: `${row.id}:${input.invoiceId}`, to, tenantId: input.tenantId }, nameRenewedEmail({ domain: row.domain, renewsOn: input.periodEnd, billingUrl: consoleUrl('/billing') }), deps);
  await sendOnce(db, { kind: 'ops_upstream_renewal', ref: `${row.id}:${input.invoiceId}`, to: deps.opsEmail, tenantId: input.tenantId }, opsUpstreamRenewalEmail({ domain: row.domain, tenantId: input.tenantId, periodEnd: input.periodEnd }), deps);
  return 'ok';
}

/** customer.subscription.updated/deleted for a name: mirror auto-renew + period end. */
export async function applyNameSubscriptionChange(db: CloudDbClient, input: { subscriptionId: string; tenantId: string; autoRenew: boolean; periodEnd: Date | null }): Promise<'ok' | 'unknown_subscription'> {
  const row = (await db.select({ id: domainRegistrations.id }).from(domainRegistrations).where(and(eq(domainRegistrations.stripeSubscriptionId, input.subscriptionId), eq(domainRegistrations.tenantId, input.tenantId))).limit(1))[0];
  if (!row) return 'unknown_subscription';
  await withTenant(db, toTenantId(input.tenantId)).updateRegistration(row.id, { autoRenew: input.autoRenew, ...(input.periodEnd ? { currentPeriodEnd: input.periodEnd } : {}) });
  return 'ok';
}

export async function notifyPaymentFailed(db: CloudDbClient, input: { tenantId: string; subscriptionId: string | null; kind: string | null }, deps: RenewalDeps): Promise<void> {
  const to = await tenantEmail(db, input.tenantId);
  let what = 'your AgentID subscription';
  if (input.kind === 'agentid_connect') what = 'Connect';
  else if (input.subscriptionId) {
    const row = (await db.select({ domain: domainRegistrations.domain }).from(domainRegistrations).where(eq(domainRegistrations.stripeSubscriptionId, input.subscriptionId)).limit(1))[0];
    if (row) what = row.domain;
  }
  const day = (deps.now ?? (() => new Date()))().toISOString().slice(0, 10);
  await sendOnce(db, { kind: 'payment_failed', ref: `${input.tenantId}:${input.subscriptionId ?? input.kind ?? 'x'}:${day}`, to, tenantId: input.tenantId }, paymentFailedEmail({ what, billingUrl: consoleUrl('/billing') }), deps);
}

export async function notifyConnectChanged(db: CloudDbClient, input: { tenantId: string; active: boolean }, deps: RenewalDeps): Promise<void> {
  const to = await tenantEmail(db, input.tenantId);
  const day = (deps.now ?? (() => new Date()))().toISOString().slice(0, 10);
  await sendOnce(db, { kind: input.active ? 'connect_on' : 'connect_off', ref: `${input.tenantId}:${day}`, to, tenantId: input.tenantId }, connectChangedEmail({ active: input.active, billingUrl: consoleUrl('/billing'), pairUrl: consoleUrl('/pair') }), deps);
}

/**
 * Daily: for every active name whose period ends within 30/7/1 days, send
 * that reminder once. `last_reminder_days` moves 30 → 7 → 1 and resets when
 * a renewal is paid.
 */
export async function sendRenewalReminders(db: CloudDbClient, deps: RenewalDeps): Promise<{ sent: number; checked: number }> {
  const now = (deps.now ?? (() => new Date()))();
  const horizon = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(domainRegistrations)
    .where(and(inArray(domainRegistrations.status, ['registered', 'active']), lte(domainRegistrations.expiryAt, horizon), gt(domainRegistrations.expiryAt, now)));
  let sent = 0;
  for (const r of rows) {
    const end = r.currentPeriodEnd ?? r.expiryAt;
    if (!end) continue;
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const due = REMINDER_DAYS.find((d) => daysLeft <= d && (r.lastReminderDays === null || r.lastReminderDays > d));
    if (!due) continue;
    const to = await tenantEmail(db, r.tenantId);
    const periodKey = end.toISOString().slice(0, 10);
    const result = await sendOnce(db, { kind: `renew_reminder_${due}`, ref: `${r.id}:${periodKey}`, to, tenantId: r.tenantId }, renewalReminderEmail({ domain: r.domain, days: Math.max(1, daysLeft), renewsOn: end, autoRenew: r.autoRenew, billingUrl: consoleUrl('/billing') }), deps);
    await withTenant(db, toTenantId(r.tenantId)).updateRegistration(r.id, { lastReminderDays: due });
    if (result === 'sent') sent++;
  }
  return { sent, checked: rows.length };
}
