import type * as React from 'react';
import { redirect } from 'next/navigation';
import { ConsoleShell } from '@/components/app/ConsoleShell';
import { ConsoleHead } from '@/components/app/ConsoleHead';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { buildConnectionView } from '@/lib/connection-view';
import { ConnectionsList, type ConnectionCardData } from './ConnectionsList';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/**
 * /connections — every pairing between one of your agents and another agent,
 * as cards: which two agents, what each may do, in the catalog's words.
 */
export default async function ConnectionsPage(props: { searchParams: Promise<{ agentDid?: string; status?: string }> }): Promise<React.JSX.Element> {
  const search = await props.searchParams;
  let state: Awaited<ReturnType<typeof loadState>>;
  try {
    state = await loadState(search);
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  const { agents, rows, selectedStatus, selectedAgent, activeCount } = state;
  return (
    <ConsoleShell active="connections">
      <ConsoleHead
        kicker="Connections"
        title={activeCount === 0 ? 'No connections yet.' : activeCount === 1 ? 'One connection.' : `${activeCount} connections.`}
        actions={<a href="/pair" className="rounded-full bg-black px-5 py-2.5 text-[14px] font-medium text-white hover:bg-zinc-800">Pair two agents</a>}
      />
      <p className="-mt-6 mb-8 max-w-[60ch] text-[16px] text-zinc-600">
        A connection is two agents allowed to talk, with what each may do written down. Open one to see the full permissions, pause or end it, or read its message log.
      </p>
      {agents.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-[15px] text-zinc-600">You need an agent first. <a href="/dashboard#claim" className="underline underline-offset-4">Claim a name</a>.</div>
      ) : (
        <ConnectionsList rows={rows} agents={agents} selectedAgent={selectedAgent} selectedStatus={selectedStatus} />
      )}
    </ConsoleShell>
  );
}

async function loadState(search: { agentDid?: string; status?: string }) {
  const { tenantDb } = await requireTenantDb();
  const agentRows = await tenantDb.listAgents();
  const names = new Map(agentRows.map((a) => [a.did, a.did.replace(/^did:web:/, '')]));
  const agentDidFilter = search.agentDid?.trim() || undefined;
  const statusFilter = search.status?.trim() || 'active';
  const [rows, active] = await Promise.all([
    tenantDb.listConnections({ ...(agentDidFilter ? { agentDid: agentDidFilter } : {}), ...(statusFilter !== 'all' ? { status: statusFilter } : {}) }),
    tenantDb.listConnections({ status: 'active' }),
  ]);
  const now = Date.now();
  // A row past its lifetime is not a connection any more, whatever its status column says.
  const live = (r: (typeof rows)[number]) => r.status !== 'active' || !r.expiresAt || r.expiresAt.getTime() > now;
  const cards: ConnectionCardData[] = rows
    .filter((r) => (statusFilter === 'active' ? live(r) : true))
    .slice(0, PAGE_SIZE)
    .map((r) => {
      const v = buildConnectionView({ ...r, purpose: r.purpose ?? null, revokeReason: r.revokeReason ?? null }, names);
      return {
        connectionId: v.connectionId,
        mineName: v.mine.name,
        peerName: v.peer.name,
        purpose: v.purpose,
        status: v.status,
        grants: v.grants.map((g) => ({ actorName: g.actorName, may: g.may })),
        expiresAt: v.expiresAt,
        lastMessageAt: v.lastMessageAt,
      };
    });
  return {
    agents: agentRows.map((a) => ({ did: a.did, name: a.did.replace(/^did:web:/, '') })),
    rows: cards,
    selectedAgent: agentDidFilter ?? null,
    selectedStatus: statusFilter,
    activeCount: active.filter(live).length,
  };
}
