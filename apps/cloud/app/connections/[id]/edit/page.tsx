import type * as React from 'react';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import { Card, Code, Link, PlateHead } from '@/components/ui';
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
      <AppShell>
        <PlateHead
          plateNum="C.05"
          kicker="// EDIT · CONNECTION RESCOPE"
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
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 font-mono text-kicker uppercase text-muted">
        <Link
          href={`/connections/${encodeURIComponent(id)}`}
          variant="mono"
        >
          ← CONNECTION
        </Link>
      </div>
      <PlateHead
        plateNum="C.05"
        kicker={`// EDIT · ${agentName.toUpperCase()} → PEER`}
        title="Edit scopes"
      />

      <Card tone="paper-2" padded className="mb-8 border border-rule max-w-3xl">
        <p className="text-body">
          Editing a connection mints a new pairing proposal that the peer
          must countersign. The existing connection stays active until
          they do — there's no permission gap. Your principal key signs
          the new proposal in this browser; the peer signs theirs in
          theirs.
        </p>
        <p className="mt-3 text-body-sm text-ink-2">
          <strong>Heads up:</strong> any change here — narrowing OR
          broadening scopes — needs the peer's countersignature. If
          they don't accept, the old policies stay in effect.
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
    </AppShell>
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
