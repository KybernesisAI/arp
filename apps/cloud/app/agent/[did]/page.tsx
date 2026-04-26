import type * as React from 'react';
import { redirect } from 'next/navigation';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { AppShell } from '@/components/app/AppShell';
import {
  Badge,
  Card,
  Code,
  Dot,
  Link,
  PlateHead,
} from '@/components/ui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AgentPage(props: {
  params: Promise<{ did: string }>;
}): Promise<React.JSX.Element> {
  const { did: rawDid } = await props.params;
  const did = decodeURIComponent(rawDid);
  let state: Awaited<ReturnType<typeof loadState>>;
  try {
    state = await loadState(did);
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  if (!state) {
    return (
      <AppShell>
        <PlateHead
          plateNum="A.00"
          kicker="// AGENT · NOT FOUND"
          title="Agent not found."
        />
        <p className="text-body text-ink-2">
          <Link href="/dashboard">← Back to dashboard</Link>
        </p>
      </AppShell>
    );
  }
  const { agent, connections } = state;
  return (
    <AppShell>
      <div className="mb-6 font-mono text-kicker uppercase text-muted">
        <Link href="/dashboard" variant="mono">
          ← DASHBOARD
        </Link>
      </div>
      <PlateHead
        plateNum="A.00"
        kicker={`// AGENT · ${agent.name.toUpperCase()}`}
        title={agent.name}
      />
      <p className="mb-10">
        <Code className="break-all">{agent.did}</Code>
      </p>

      <section>
        <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
          <h2 className="font-display font-medium text-h3">
            Connections{' '}
            <span className="text-muted font-mono text-body-sm ml-2">
              {connections.length}
            </span>
          </h2>
          <div className="flex items-center gap-4">
            <span className="font-mono text-kicker uppercase text-muted hidden md:inline">
              // C · CONNECTIONS
            </span>
            <Link
              href={`/connections?agentDid=${encodeURIComponent(agent.did)}`}
              variant="mono"
            >
              See all →
            </Link>
            <Badge
              tone={connections.length > 0 ? 'blue' : 'muted'}
              className="text-[9px] px-2 py-0.5"
            >
              {connections.length > 0 ? 'ACTIVE' : 'IDLE'}
            </Badge>
          </div>
        </header>
        {connections.length === 0 ? (
          <Card tone="paper-2" padded>
            <p className="text-body text-ink-2">No active connections.</p>
          </Card>
        ) : (
          <Card tone="paper-2" padded={false} className="border border-rule">
            <ul className="list-none p-0 m-0">
              {connections.map((c, i) => (
                <li
                  key={c.connectionId}
                  className={
                    'grid grid-cols-12 gap-4 px-5 py-4 items-baseline ' +
                    (i === connections.length - 1 ? '' : 'border-b border-rule')
                  }
                >
                  <div className="col-span-12 md:col-span-3 font-mono text-kicker uppercase text-ink">
                    {c.connectionId}
                  </div>
                  <div className="col-span-12 md:col-span-5 text-body-sm text-ink-2 break-all">
                    → <Code>{c.peerDid}</Code>
                  </div>
                  <div className="col-span-6 md:col-span-2 font-mono text-kicker uppercase inline-flex items-center gap-2">
                    <Dot tone={c.status === 'active' ? 'green' : 'yellow'} />
                    {c.status.toUpperCase()}
                  </div>
                  <div className="col-span-6 md:col-span-2 md:text-right font-mono text-kicker uppercase text-muted">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </AppShell>
  );
}

async function loadState(did: string) {
  const { tenantDb } = await requireTenantDb();
  const agent = await tenantDb.getAgent(did);
  if (!agent) return null;
  const connections = await tenantDb.listConnections({ agentDid: did });
  return {
    agent: { did: agent.did, name: agent.agentName },
    connections: connections.map((c) => ({
      connectionId: c.connectionId,
      peerDid: c.peerDid,
      purpose: c.purpose,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}
