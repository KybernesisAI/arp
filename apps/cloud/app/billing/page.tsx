import type * as React from 'react';
import { redirect } from 'next/navigation';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { PLAN_LIMITS } from '@kybernesis/arp-cloud-db';
import BillingButtons from './BillingButtons';

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
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.75rem', marginBottom: '1rem' }}>Billing</h1>
      <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
        Current plan: <strong>{tenant.plan}</strong> · status: {tenant.status}
      </p>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {(['free', 'pro', 'team'] as const).map((plan) => {
          const limits = PLAN_LIMITS[plan];
          const isCurrent = tenant.plan === plan;
          return (
            <div
              key={plan}
              style={{
                padding: '1.5rem',
                backgroundColor: isCurrent ? '#1e40af' : '#1e293b',
                borderRadius: '0.5rem',
                border: '1px solid #334155',
              }}
            >
              <h2 style={{ marginTop: 0, textTransform: 'capitalize' }}>{plan}</h2>
              <p style={{ fontSize: '1.25rem', margin: '0.5rem 0' }}>
                {limits.monthlyPriceCents === 0 ? 'Free' : `$${limits.monthlyPriceCents / 100}/mo`}
              </p>
              <ul style={{ color: '#cbd5e1', fontSize: '0.875rem', paddingLeft: '1.25rem' }}>
                <li>{limits.maxAgents ?? '∞'} agents</li>
                <li>{limits.maxInboundMessagesPerMonth?.toLocaleString() ?? '∞'} inbound msgs/month</li>
              </ul>
              {isCurrent && <p style={{ color: '#93c5fd', marginTop: '0.75rem' }}>Current</p>}
            </div>
          );
        })}
      </div>
      <BillingButtons currentPlan={tenant.plan} />
    </main>
  );
}

async function loadTenant() {
  const { tenantDb } = await requireTenantDb();
  const tenant = await tenantDb.getTenant();
  if (!tenant) throw new AuthError(404, 'no_tenant');
  return { plan: tenant.plan, status: tenant.status };
}
