import type * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { PLAN_LIMITS } from '@kybernesis/arp-cloud-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DashboardPage(): Promise<React.JSX.Element> {
  let state: Awaited<ReturnType<typeof loadState>>;
  try {
    state = await loadState();
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  const { tenant, agents } = state;
  const limits = PLAN_LIMITS[tenant.plan as keyof typeof PLAN_LIMITS];

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>Dashboard</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
            {tenant.principalDid} · plan: <strong>{tenant.plan}</strong> · status: {tenant.status}
          </p>
        </div>
        <Link href="/billing" style={linkStyle}>
          Billing
        </Link>
      </header>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Agents ({agents.length})</h2>
        {agents.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>
            No agents yet.{' '}
            <Link href="/onboarding" style={linkStyle}>
              Provision one
            </Link>
            .
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {agents.map((a) => (
              <li key={a.did} style={{ padding: '0.75rem 0', borderTop: '1px solid #334155' }}>
                <Link href={`/agent/${encodeURIComponent(a.did)}`} style={linkStyle}>
                  {a.name}
                </Link>{' '}
                — <code>{a.did}</code>
                <div style={{ color: '#94a3b8', fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                  last seen: {a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleString() : 'never'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ ...cardStyle, marginTop: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Plan quotas</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
          Agents: {agents.length} / {limits.maxAgents ?? '∞'} · inbound msgs/month cap:{' '}
          {limits.maxInboundMessagesPerMonth?.toLocaleString() ?? '∞'}
        </p>
      </section>
    </main>
  );
}

async function loadState() {
  const { tenantDb } = await requireTenantDb();
  const tenant = await tenantDb.getTenant();
  if (!tenant) throw new AuthError(404, 'no_tenant');
  const agents = await tenantDb.listAgents();
  return {
    tenant,
    agents: agents.map((a) => ({
      did: a.did,
      name: a.agentName,
      lastSeenAt: a.lastSeenAt ? a.lastSeenAt.toISOString() : null,
    })),
  };
}

const cardStyle = {
  padding: '1.5rem',
  backgroundColor: '#1e293b',
  borderRadius: '0.5rem',
  border: '1px solid #334155',
};
const linkStyle = { color: '#60a5fa', textDecoration: 'none' };
