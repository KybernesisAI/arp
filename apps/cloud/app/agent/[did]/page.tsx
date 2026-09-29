import type * as React from 'react';
import { redirect } from 'next/navigation';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { ConsoleShell } from '@/components/app/ConsoleShell';
import { ConsoleHead } from '@/components/app/ConsoleHead';
import { Card, Tag } from '@/app/lander/ui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACK = 'font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-900';

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
      <ConsoleShell active="agents">
        <ConsoleHead kicker="Agent" title="Agent not found." />
        <p className="text-[16px] text-zinc-600">
          <a href="/dashboard" className={BACK}>← Back to your agents</a>
        </p>
      </ConsoleShell>
    );
  }
  const { agent, connections } = state;
  return (
    <ConsoleShell active="agents">
      <div className="mb-6">
        <a href="/dashboard" className={BACK}>← Agents</a>
      </div>
      <ConsoleHead kicker="Agent" title={agent.name} />
      <p className="-mt-6 mb-10 font-mono text-[14px] text-zinc-600">{nice(agent.did)}</p>

      <section>
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[22px] font-medium leading-[1.15] tracking-[-0.015em] text-zinc-950">
            Connections <span className="ml-2 font-mono text-[14px] text-zinc-500">{connections.length}</span>
          </h2>
          <div className="flex items-center gap-4">
            <a href={`/connections?agentDid=${encodeURIComponent(agent.did)}`} className={BACK}>See all →</a>
            <Tag tone={connections.length > 0 ? 'emerald' : 'zinc'}>{connections.length > 0 ? 'Active' : 'Idle'}</Tag>
          </div>
        </header>
        {connections.length === 0 ? (
          <Card>
            <p className="m-0 text-[15px] text-zinc-600">No connections yet. Pair this agent with another agent to start.</p>
          </Card>
        ) : (
          <Card className="!p-0">
            <ul className="m-0 list-none divide-y divide-zinc-200 p-0">
              {connections.map((c) => (
                <li key={c.connectionId} className="grid grid-cols-12 items-baseline gap-4 px-6 py-4">
                  <div className="col-span-12 text-[15px] text-zinc-950 md:col-span-6">
                    <a href={`/connections/${encodeURIComponent(c.connectionId)}`} className="hover:underline">{nice(c.peerDid)}</a>
                    {c.purpose && <div className="mt-1 text-[13px] text-zinc-500">{c.purpose}</div>}
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <Tag tone={c.status === 'active' ? 'emerald' : 'zinc'}>{c.status}</Tag>
                  </div>
                  <div className="col-span-6 font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500 md:col-span-3 md:text-right">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </ConsoleShell>
  );
}

/** `did:web:kyber.agent` → `kyber.agent`; anything else untouched (mirrors the dashboard). */
function nice(did: string): string {
  return did.replace(/^did:web:/, '');
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
