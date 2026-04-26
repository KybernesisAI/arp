import type * as React from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import {
  Badge,
  Card,
  Code,
  Dot,
  Link,
  PlateHead,
} from '@/components/ui';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { ConnectionsList, type ConnectionRow } from './ConnectionsList';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

/**
 * /connections — cloud connection list page (slice 10b).
 *
 * Server component: seeds the first page of connections from the DB plus the
 * tenant's agent list (for the filter dropdown). The client-side
 * `ConnectionsList` owns status-tab switching + "Load more" pagination via
 * GET /api/connections.
 *
 * Tenant isolation: `listConnections` is scoped to the caller's tenant via
 * TenantDb; the first page is fetched here so a logged-out user never sees
 * a flash of unauthenticated content before redirect.
 */
export default async function ConnectionsPage(props: {
  searchParams: Promise<{ agentDid?: string; status?: string }>;
}): Promise<React.JSX.Element> {
  const search = await props.searchParams;
  let state: Awaited<ReturnType<typeof loadState>>;
  try {
    state = await loadState(search);
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  const { agents, initialRows, initialCursor, selectedStatus, selectedAgent } = state;

  return (
    <AppShell>
      <PlateHead
        plateNum="C.01"
        kicker="// CONNECTIONS · ALL AGENTS"
        title="Connections"
      />

      <div className="mb-8 max-w-2xl text-body text-ink-2">
        <p>
          Every active tokenised link between one of your agents and a peer.
          Click a row for the full consent token, the scope breakdown, and
          the per-connection audit log.
        </p>
      </div>

      {agents.length === 0 ? (
        <Card tone="yellow" padded className="border border-rule max-w-2xl">
          <Badge tone="yellow" className="mb-3 text-[9px] px-2 py-0.5">NO AGENTS</Badge>
          <p className="text-body">
            Provision an agent first, then come back to pair with a peer.
          </p>
          <p className="mt-4 text-body-sm">
            <Link href="/onboarding" variant="accent">Go to onboarding →</Link>
          </p>
        </Card>
      ) : initialRows.length === 0 && selectedStatus === 'active' && !selectedAgent ? (
        <Card tone="paper-2" padded className="border border-rule max-w-2xl">
          <Badge tone="muted" className="mb-3 text-[9px] px-2 py-0.5">NO CONNECTIONS YET</Badge>
          <p className="text-body">
            Nothing paired yet. Generate an invitation and share it with the
            peer you want to connect to.
          </p>
          <p className="mt-4 text-body-sm">
            <Link href="/pair" variant="accent">→ Pair with another agent</Link>
          </p>
          <div className="mt-6 border-t border-rule pt-4 text-body-sm text-ink-2">
            <span className="font-mono text-kicker uppercase text-muted">
              // TIP
            </span>
            <br />
            Pairing signs a consent token locally in your browser. The peer
            never sees your principal key, only the scopes + obligations you
            granted.
          </div>
        </Card>
      ) : (
        <ConnectionsList
          agents={agents}
          initialRows={initialRows}
          initialCursor={initialCursor}
          selectedAgent={selectedAgent}
          selectedStatus={selectedStatus}
          pageSize={PAGE_SIZE}
        />
      )}
    </AppShell>
  );
}

async function loadState(search: { agentDid?: string; status?: string }) {
  const { tenantDb } = await requireTenantDb();
  const agents = await tenantDb.listAgents();

  const agentDidFilter = search.agentDid?.trim() || undefined;
  const statusFilter = search.status?.trim() || 'active';
  const rows = await tenantDb.listConnections({
    ...(agentDidFilter ? { agentDid: agentDidFilter } : {}),
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
  });
  const trimmed = rows.slice(0, PAGE_SIZE);
  const mapped: ConnectionRow[] = trimmed.map((r) => {
    const cedar = Array.isArray(r.cedarPolicies) ? (r.cedarPolicies as unknown[]) : [];
    const obligations = Array.isArray(r.obligations) ? (r.obligations as unknown[]) : [];
    return {
      connectionId: r.connectionId,
      agentDid: r.agentDid,
      peerDid: r.peerDid,
      purpose: r.purpose ?? null,
      status: r.status,
      scopesCount: cedar.length,
      obligationsCount: obligations.length,
      createdAt: r.createdAt.toISOString(),
      lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
    };
  });
  // If the server-side page is full, derive the cursor client-side style so
  // ConnectionsList can continue from where we left off.
  const last = trimmed[trimmed.length - 1];
  const nextCursor =
    rows.length > PAGE_SIZE && last
      ? Buffer.from(
          JSON.stringify({ t: last.createdAt.toISOString(), c: last.connectionId }),
          'utf8',
        ).toString('base64url')
      : null;

  return {
    agents: agents.map((a) => ({ did: a.did, name: a.agentName })),
    initialRows: mapped,
    initialCursor: nextCursor,
    selectedAgent: agentDidFilter ?? null,
    selectedStatus: statusFilter,
  };
}

// Silence tree-shake warnings on imports kept for co-located typing.
void Code;
void Dot;
