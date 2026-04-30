import type * as React from 'react';
import { redirect } from 'next/navigation';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { PLAN_LIMITS, monthlyBillCents, currentUsagePeriod } from '@/lib/billing';
import BillingButtons from './BillingButtons';
import { AppShell } from '@/components/app/AppShell';
import { Badge, Card, CardMatrix, PlateHead } from '@/components/ui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function BillingPage(): Promise<React.JSX.Element> {
  let view: Awaited<ReturnType<typeof loadBilling>>;
  try {
    view = await loadBilling();
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  const free = PLAN_LIMITS.free;
  const pro = PLAN_LIMITS.pro;
  const isPro = view.plan === 'pro';

  return (
    <AppShell>
      <PlateHead
        plateNum="B.00"
        kicker={`// BILLING · ${view.plan.toUpperCase()} · ${view.status.toUpperCase()}`}
        title="Billing"
      />

      {/* ------------------------- usage panel ------------------------- */}
      <CardMatrix className="grid-cols-1 md:grid-cols-3 mb-12">
        <UsageCard
          label="Inbound msgs / month"
          used={view.inboundThisMonth}
          cap={view.inboundCap}
        />
        <UsageCard
          label="Active agents"
          used={view.agentCount}
          cap={view.agentCap}
        />
        <Card tone="paper" className="min-h-[140px] gap-2">
          <div className="font-mono text-kicker uppercase text-muted">CURRENT BILL</div>
          <div className="font-display font-medium text-[2.5rem] leading-none tracking-[-0.02em]">
            ${(view.monthlyBillCents / 100).toFixed(2)}
            <span className="ml-2 font-mono text-body-sm text-muted">/ mo</span>
          </div>
          <div className="text-body-sm text-ink-2">
            {isPro
              ? `${view.agentCount} agent${view.agentCount === 1 ? '' : 's'} × $${pro.perAgentPriceCents / 100}/mo`
              : 'Free tier'}
          </div>
        </Card>
      </CardMatrix>

      {/* ------------------------- plan cards -------------------------- */}
      <CardMatrix className="grid-cols-1 md:grid-cols-2">
        <Card
          tone={view.plan === 'free' ? 'blue' : 'paper'}
          className="min-h-[260px] gap-3"
        >
          <div
            className={`font-mono text-kicker uppercase ${
              view.plan === 'free' ? 'text-white/85' : 'text-muted'
            }`}
          >
            TIER · FREE
          </div>
          <h3 className="font-display font-medium text-[2rem] leading-none">Free</h3>
          <div className="font-display font-medium text-[2.5rem] leading-none tracking-[-0.02em]">
            $0
          </div>
          <ul
            className={`list-none p-0 m-0 text-body-sm ${
              view.plan === 'free' ? 'text-white/90' : 'text-ink-2'
            }`}
          >
            <li className="flex items-baseline gap-2 py-1">
              <span className={view.plan === 'free' ? 'text-white/70' : 'text-muted'}>›</span>
              {free.maxAgents} agent
            </li>
            <li className="flex items-baseline gap-2 py-1">
              <span className={view.plan === 'free' ? 'text-white/70' : 'text-muted'}>›</span>
              {free.maxInboundMessagesPerMonth?.toLocaleString()} inbound msgs / mo
            </li>
          </ul>
          {view.plan === 'free' && (
            <div className="mt-auto">
              <Badge tone="yellow" className="text-[9px] px-2 py-0.5">
                CURRENT PLAN
              </Badge>
            </div>
          )}
        </Card>

        <Card
          tone={view.plan === 'pro' ? 'blue' : 'paper'}
          className="min-h-[260px] gap-3"
        >
          <div
            className={`font-mono text-kicker uppercase ${
              view.plan === 'pro' ? 'text-white/85' : 'text-muted'
            }`}
          >
            TIER · PRO
          </div>
          <h3 className="font-display font-medium text-[2rem] leading-none">Pro</h3>
          <div className="font-display font-medium text-[2.5rem] leading-none tracking-[-0.02em]">
            ${pro.perAgentPriceCents / 100}
            <span
              className={`ml-2 font-mono text-body-sm ${
                view.plan === 'pro' ? 'text-white/85' : 'text-muted'
              }`}
            >
              / agent / mo
            </span>
          </div>
          <ul
            className={`list-none p-0 m-0 text-body-sm ${
              view.plan === 'pro' ? 'text-white/90' : 'text-ink-2'
            }`}
          >
            <li className="flex items-baseline gap-2 py-1">
              <span className={view.plan === 'pro' ? 'text-white/70' : 'text-muted'}>›</span>
              Unlimited agents — billed per agent
            </li>
            <li className="flex items-baseline gap-2 py-1">
              <span className={view.plan === 'pro' ? 'text-white/70' : 'text-muted'}>›</span>
              {pro.maxInboundMessagesPerMonth?.toLocaleString()} inbound msgs / mo (shared)
            </li>
          </ul>
          {view.plan === 'pro' && (
            <div className="mt-auto">
              <Badge tone="yellow" className="text-[9px] px-2 py-0.5">
                CURRENT PLAN
              </Badge>
            </div>
          )}
        </Card>
      </CardMatrix>

      <BillingButtons
        currentPlan={view.plan}
        canManage={view.canManage}
        agentCount={view.agentCount}
      />
    </AppShell>
  );
}

function UsageCard({
  label,
  used,
  cap,
}: {
  label: string;
  used: number;
  cap: number | null;
}): React.JSX.Element {
  const pct = cap === null ? 0 : Math.min(100, Math.round((used / cap) * 100));
  const tone =
    cap === null ? 'paper' : pct >= 100 ? 'yellow' : pct >= 80 ? 'yellow' : 'paper';
  return (
    <Card tone={tone} className="min-h-[140px] gap-2">
      <div className="font-mono text-kicker uppercase text-muted">{label}</div>
      <div className="font-display font-medium text-[2.5rem] leading-none tracking-[-0.02em]">
        {used.toLocaleString()}
        <span className="ml-2 font-mono text-body-sm text-muted">
          / {cap === null ? '∞' : cap.toLocaleString()}
        </span>
      </div>
      {cap !== null && (
        <div className="mt-2 w-full bg-paper/30 h-1">
          <div className="h-1 bg-ink" style={{ width: `${pct}%` }} />
        </div>
      )}
    </Card>
  );
}

async function loadBilling() {
  const { tenantDb } = await requireTenantDb();
  const tenant = await tenantDb.getTenant();
  if (!tenant) throw new AuthError(404, 'no_tenant');
  const period = currentUsagePeriod();
  const [usage, agents] = await Promise.all([
    tenantDb.getUsage(period),
    tenantDb.listAgents(),
  ]);
  const limits = PLAN_LIMITS[tenant.plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free;
  const agentCap =
    tenant.plan === 'free' ? PLAN_LIMITS.free.maxAgents : null;
  return {
    plan: (tenant.plan === 'pro' ? 'pro' : 'free') as 'free' | 'pro',
    status: tenant.status,
    inboundThisMonth: usage?.inboundMessages ?? 0,
    inboundCap: limits.maxInboundMessagesPerMonth,
    agentCount: agents.length,
    agentCap,
    monthlyBillCents: monthlyBillCents(tenant.plan, tenant.subscriptionQuantity ?? 1),
    canManage: tenant.plan !== 'free' && Boolean(tenant.stripeCustomerId),
  };
}
