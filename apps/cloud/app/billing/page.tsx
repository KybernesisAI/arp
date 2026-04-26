import type * as React from 'react';
import { redirect } from 'next/navigation';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { PLAN_LIMITS } from '@kybernesis/arp-cloud-db';
import BillingButtons from './BillingButtons';
import { AppShell } from '@/components/app/AppShell';
import { Badge, Card, CardMatrix, PlateHead } from '@/components/ui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function BillingPage(): Promise<React.JSX.Element> {
  let tenant: Awaited<ReturnType<typeof loadTenant>>;
  try {
    tenant = await loadTenant();
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  return (
    <AppShell>
      <PlateHead
        plateNum="B.00"
        kicker={`// BILLING · ${tenant.plan.toUpperCase()} · ${tenant.status.toUpperCase()}`}
        title="Billing"
      />

      <CardMatrix className="grid-cols-1 md:grid-cols-3">
        {(['free', 'pro', 'team'] as const).map((plan) => {
          const limits = PLAN_LIMITS[plan];
          const isCurrent = tenant.plan === plan;
          const tone = isCurrent ? 'blue' : 'paper';
          const mutedCls = isCurrent ? 'text-white/85' : 'text-muted';
          return (
            <Card key={plan} tone={tone} className="min-h-[260px] gap-3">
              <div className={`font-mono text-kicker uppercase ${mutedCls}`}>
                TIER · {plan.toUpperCase()}
              </div>
              <h3 className="font-display font-medium text-[2rem] leading-none">
                {plan.charAt(0).toUpperCase() + plan.slice(1)}
              </h3>
              <div className="font-display font-medium text-[2.5rem] leading-none tracking-[-0.02em]">
                {limits.monthlyPriceCents === 0 ? 'Free' : `$${limits.monthlyPriceCents / 100}`}
                {limits.monthlyPriceCents > 0 && (
                  <span className={`ml-2 font-mono text-body-sm ${mutedCls}`}>/ mo</span>
                )}
              </div>
              <ul
                className={`list-none p-0 m-0 text-body-sm ${
                  isCurrent ? 'text-white/90' : 'text-ink-2'
                }`}
              >
                <li className="flex items-baseline gap-2 py-1">
                  <span className={isCurrent ? 'text-white/70' : 'text-muted'}>›</span>
                  {limits.maxAgents ?? '∞'} agents
                </li>
                <li className="flex items-baseline gap-2 py-1">
                  <span className={isCurrent ? 'text-white/70' : 'text-muted'}>›</span>
                  {limits.maxInboundMessagesPerMonth?.toLocaleString() ?? '∞'} inbound msgs / mo
                </li>
              </ul>
              {isCurrent && (
                <div className="mt-auto">
                  <Badge tone="yellow" className="text-[9px] px-2 py-0.5">
                    CURRENT PLAN
                  </Badge>
                </div>
              )}
            </Card>
          );
        })}
      </CardMatrix>
      <BillingButtons
        currentPlan={tenant.plan}
        canManage={tenant.canManage}
      />
    </AppShell>
  );
}

async function loadTenant() {
  const { tenantDb } = await requireTenantDb();
  const tenant = await tenantDb.getTenant();
  if (!tenant) throw new AuthError(404, 'no_tenant');
  return {
    plan: tenant.plan,
    status: tenant.status,
    // Only paid tenants with a Stripe customer id can open the portal.
    canManage: tenant.plan !== 'free' && Boolean(tenant.stripeCustomerId),
  };
}
