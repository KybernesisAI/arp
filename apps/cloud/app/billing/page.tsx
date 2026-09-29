import type * as React from 'react';
import { redirect } from 'next/navigation';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { ConsoleShell } from '@/components/app/ConsoleShell';
import { ConsoleHead } from '@/components/app/ConsoleHead';
import { Card, Kicker, Tag } from '@/app/lander/ui';
import { mdyDate } from '@/lib/email';
import BillingButtons, { AutoRenewToggle } from './BillingButtons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /billing — lander model: every name renews yearly ($29), Connect is a
 * monthly add-on ($5), receipts and the card live in the Stripe portal.
 */
export default async function BillingPage(props: { searchParams: Promise<{ status?: string }> }): Promise<React.JSX.Element> {
  const sp = await props.searchParams;
  let view: Awaited<ReturnType<typeof loadBilling>>;
  try {
    view = await loadBilling();
  } catch (err) {
    if (err instanceof AuthError) redirect('/cloud/login?next=/billing');
    throw err;
  }
  const connectOn = view.connectStatus === 'active' || view.connectStatus === 'past_due' || view.internal;
  return (
    <ConsoleShell active="billing">
      <ConsoleHead kicker="Billing" title={view.names.length === 0 ? 'Nothing to pay yet.' : `${view.names.length} ${view.names.length === 1 ? 'name' : 'names'}${connectOn ? ' + Connect' : ''}.`} actions={<BillingButtons canManage={view.hasCustomer} connectOn={connectOn} internal={view.internal} />} />
      {sp.status === 'connect_on' && <Card className="mb-6" glow="emerald"><p className="m-0 text-[15px] text-zinc-800">Connect is on. Your agents can pair with others now.</p></Card>}
      <p className="-mt-6 mb-8 max-w-[60ch] text-[16px] text-zinc-600">
        A name is $29 a year and renews from the card on file unless you turn that off. Connect is $5 a month and lets your agents pair with others. Receipts, invoices and the card are under Manage billing.
      </p>

      <section>
        <Kicker>Names</Kicker>
        {view.names.length === 0 ? (
          <Card className="mt-4"><p className="m-0 text-[15px] text-zinc-600">No names on this account yet. <a href="/dashboard#claim" className="underline underline-offset-4">Claim one</a>.</p></Card>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {view.names.map((n) => (
              <Card key={n.domain}>
                <div className="flex items-center justify-between gap-3">
                  <a href={`/names/${n.sld}`} className="text-[18px] font-medium tracking-[-0.01em] text-zinc-950 hover:underline">{n.domain}</a>
                  <Tag tone={n.autoRenew ? 'emerald' : 'zinc'}>{n.autoRenew ? 'Renews automatically' : 'Renewal off'}</Tag>
                </div>
                <dl className="mt-4 space-y-2 text-[14px]">
                  <div className="flex justify-between gap-3"><dt className="text-zinc-600">{n.autoRenew ? 'Next renewal' : 'Expires'}</dt><dd className="m-0 font-mono text-[13px] text-zinc-900">{n.renewsOn ? mdyDate(n.renewsOn) : '—'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-zinc-600">Price</dt><dd className="m-0 font-mono text-[13px] text-zinc-900">$29 / year</dd></div>
                  {n.upstreamPending && <div className="flex justify-between gap-3"><dt className="text-zinc-600">Renewal</dt><dd className="m-0 text-[13px] text-emerald-700">Paid, being applied</dd></div>}
                </dl>
                <div className="mt-auto pt-5">
                  {n.managedHere ? <AutoRenewToggle sld={n.sld} autoRenew={n.autoRenew} /> : <p className="m-0 text-[13px] text-zinc-500">Registered outside this console; renewal is handled with us directly.</p>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card glow="cyan">
          <div className="flex items-center justify-between gap-3">
            <Kicker>Connect</Kicker>
            <Tag tone={connectOn ? 'emerald' : 'zinc'}>{view.internal ? 'Included' : connectOn ? (view.connectStatus === 'past_due' ? 'Payment due' : 'On') : 'Off'}</Tag>
          </div>
          <p className="mt-3 text-[15px] text-zinc-700">Pair your agents with others, decide what each may do, pause or end at any time, keep the message log.</p>
          <p className="mt-2 text-[14px] text-zinc-500">$5 a month for the whole account. Existing connections keep working if you stop it; new pairings need it.</p>
        </Card>
        <Card>
          <Kicker>Receipts and card</Kicker>
          <p className="mt-3 text-[15px] text-zinc-700">Every payment gets an emailed receipt. Invoices, past payments and the card on file are under <span className="font-medium">Manage billing</span>.</p>
          <p className="mt-2 text-[14px] text-zinc-500">Renewal reminders go to {view.email ?? 'the email on your account'} 30, 7 and 1 days before each renewal.</p>
        </Card>
      </section>
    </ConsoleShell>
  );
}

async function loadBilling() {
  const { tenantDb } = await requireTenantDb();
  const tenant = await tenantDb.getTenant();
  if (!tenant) throw new AuthError(404, 'no_tenant');
  const regs = await tenantDb.listRegistrations();
  const names = regs
    .filter((r) => r.status === 'registered' || r.status === 'active')
    .map((r) => ({
      domain: r.domain,
      sld: r.sld,
      autoRenew: r.autoRenew,
      renewsOn: r.currentPeriodEnd ?? r.expiryAt ?? null,
      managedHere: Boolean(r.stripeSubscriptionId),
      upstreamPending: r.upstreamRenewalStatus === 'pending',
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
  return {
    names,
    connectStatus: tenant.connectStatus,
    internal: tenant.plan === 'internal',
    hasCustomer: Boolean(tenant.stripeCustomerId),
    email: tenant.email,
  };
}
