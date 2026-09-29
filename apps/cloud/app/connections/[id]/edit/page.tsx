import type * as React from 'react';
import { notFound, redirect } from 'next/navigation';
import { ConsoleShell } from '@/components/app/ConsoleShell';
import { ConsoleHead } from '@/components/app/ConsoleHead';
import { Card, Code, Link } from '@/components/ui';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { BUNDLES } from '@kybernesis/arp-scope-catalog';
import { getScopeCatalog } from '@/lib/catalog';
import type { ScopeTemplate } from '@kybernesis/arp-spec';
import { EditConnectionForm } from './EditConnectionForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /connections/[id]/edit — Phase 4 Task 7 re-countersign flow.
 *
 * Server component: loads the existing connection's purpose +
 * scope_selections from `tokenJson`, plus the catalog/bundles/agents
 * the EditConnectionForm needs to render. The form mints a NEW
 * pairing proposal client-side with `replaces=<old_connection_id>`,
 * posts it to /api/pairing/invitations, and surfaces the share URL.
 *
 * The existing connection stays active until the peer countersigns;
 * /api/pairing/accept atomically supersedes it on both tenant sides.
 */
export default async function ConnectionEditPage(props: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id: rawId } = await props.params;
  const id = decodeURIComponent(rawId);
  let detail: Awaited<ReturnType<typeof loadDetail>>;
  try {
    detail = await loadDetail(id);
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  if (!detail) notFound();
  const {
    connection,
    agentName,
    principalDid,
    agents,
    catalog,
    bundles,
    initialSelected,
    initialParams,
  } = detail;

  if (connection.status === 'revoked') {
    return (
      <ConsoleShell active="connections">
        <ConsoleHead
          plateNum="C.05"
          kicker="Change permissions"
          title="Cannot edit a revoked connection"
        />
        <Card tone="paper-2" padded>
          <p className="text-body">
            <Code>{id}</Code> has been revoked. Revocation is permanent —
            generate a fresh pairing invitation instead.
          </p>
          <p className="mt-3 text-body-sm">
            <Link href="/pair" variant="accent">→ Generate a new pairing invitation</Link>
          </p>
        </Card>
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell active="connections">
      <div className="mb-6 font-mono text-kicker uppercase text-muted">
        <Link
          href={`/connections/${encodeURIComponent(id)}`}
          variant="mono"
        >
          ← CONNECTION
        </Link>
      </div>
      <ConsoleHead
        plateNum="C.05"
        kicker={`Change permissions · ${agentName}`}
        title="Change what the other agent may do."
      />

      <Card tone="paper-2" padded className="mb-8 border border-rule max-w-3xl">
        <p className="text-body">
          Tick what the other agent may ask yours for, then generate an updated invitation and send it to the other owner. The current permissions stay in force until they approve the new ones, so nothing is ever left open in between. If both agents are yours, you can approve it yourself from the dashboard.
        </p>
      </Card>

      <EditConnectionForm
        connectionId={id}
        principalDid={principalDid}
        currentAgentDid={connection.agentDid}
        currentPeerDid={connection.peerDid}
        currentPurpose={connection.purpose ?? 'Edited connection'}
        agents={agents}
        catalog={catalog}
        bundles={bundles}
        initialSelected={initialSelected}
        initialParams={initialParams}
      />
    </ConsoleShell>
  );
}

interface DetailState {
  connection: {
    connectionId: string;
    agentDid: string;
    peerDid: string;
    purpose: string | null;
    status: string;
  };
  agentName: string;
  principalDid: string;
  agents: Array<{ did: string; name: string }>;
  catalog: ScopeTemplate[];
  bundles: Array<{
    id: string;
    label: string;
    description: string;
    scopes: Array<{ id: string; params?: Record<string, unknown> }>;
    needsParams: boolean;
  }>;
  initialSelected: string[];
  initialParams: Record<string, Record<string, unknown>>;
}

async function loadDetail(id: string): Promise<DetailState | null> {
  const { tenantDb, session } = await requireTenantDb();
  const row = await tenantDb.getConnection(id);
  if (!row) return null;
  const agent = await tenantDb.getAgent(row.agentDid);
  const allAgents = await tenantDb.listAgents();

  // Recover the original per-scope selections so the editor pre-fills
  // with whatever was previously approved. They were persisted into
  // `metadata.scopeSelections` at accept-time. Pre-Phase-4-Task-7
  // connections won't have that, so we just render an empty picker —
  // the user re-picks from scratch in that case.
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const rawSelections = Array.isArray(meta['scopeSelections'])
    ? (meta['scopeSelections'] as Array<{ id: string; params?: Record<string, unknown> }>)
    : [];
  const initialSelected = rawSelections.map((s) => s.id);
  const initialParams: Record<string, Record<string, unknown>> = {};
  for (const s of rawSelections) {
    if (s.params && Object.keys(s.params).length > 0) {
      initialParams[s.id] = s.params;
    }
  }

  return {
    connection: {
      connectionId: row.connectionId,
      agentDid: row.agentDid,
      peerDid: row.peerDid,
      purpose: row.purpose,
      status: row.status,
    },
    agentName: agent?.agentName ?? row.agentDid,
    principalDid: session.principalDid,
    agents: allAgents.map((a) => ({ did: a.did, name: a.agentName })),
    catalog: getScopeCatalog().slice(),
    bundles: BUNDLES.map((b) => ({
      id: b.id,
      label: b.label,
      description: b.description,
      scopes: b.scopes.map((s) => ({
        id: s.id,
        params: (s.params ?? {}) as Record<string, unknown>,
      })),
      needsParams: b.scopes.some(
        (s) =>
          s.params !== null &&
          s.params !== undefined &&
          Object.values(s.params).some((v) => v === '<user-picks>'),
      ),
    })),
    initialSelected,
    initialParams,
  };
}
