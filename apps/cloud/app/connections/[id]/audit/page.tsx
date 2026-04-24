import type * as React from 'react';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import { Link, PlateHead } from '@/components/ui';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { AuditViewer, type AuditEntry } from './AuditViewer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

/**
 * /connections/[id]/audit — paginated audit log viewer (slice 10b).
 *
 * Server loader seeds the first page so the screen renders immediately
 * after login; the client `AuditViewer` handles filter changes and
 * "Load more" pagination via /api/connections/:id/audit.
 */
export default async function ConnectionAuditPage(props: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id: rawId } = await props.params;
  const id = decodeURIComponent(rawId);
  let state: Awaited<ReturnType<typeof loadState>>;
  try {
    state = await loadState(id);
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  if (!state) notFound();
  const { initialEntries, initialCursor, peerDid, agentDid, status } = state;

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
        plateNum="C.03"
        kicker="// AUDIT LOG · CHAINED HASH CHAIN"
        title="Audit log"
      />

      <div className="mb-8 max-w-2xl text-body text-ink-2">
        <p>
          Every policy decision for this connection, newest first. Each entry
          is hash-chained to the previous so tampering after the fact is
          detectable.
        </p>
      </div>

      <AuditViewer
        connectionId={id}
        initialEntries={initialEntries}
        initialCursor={initialCursor}
        agentDid={agentDid}
        peerDid={peerDid}
        connectionStatus={status}
        pageSize={PAGE_SIZE}
      />
    </AppShell>
  );
}

async function loadState(id: string): Promise<
  | null
  | {
      initialEntries: AuditEntry[];
      initialCursor: string | null;
      peerDid: string;
      agentDid: string;
      status: string;
    }
> {
  const { tenantDb } = await requireTenantDb();
  const conn = await tenantDb.getConnection(id);
  if (!conn) return null;
  // Prefer the API-shape path by reusing the route's logic — but that forces
  // an internal fetch round-trip. Inline the query here with the same
  // tenant-scoping TenantDb enforces: list the first PAGE_SIZE+1 entries and
  // reuse the same cursor shape the route emits so the client can continue.
  const rows = await tenantDb.listAudit(conn.agentDid, id, { limit: PAGE_SIZE + 1 });
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = page[page.length - 1];
  const initialCursor =
    hasMore && last
      ? Buffer.from(
          JSON.stringify({ s: last.seq, i: String(last.id) }),
          'utf8',
        ).toString('base64url')
      : null;
  return {
    agentDid: conn.agentDid,
    peerDid: conn.peerDid,
    status: conn.status,
    initialEntries: page.map((r) => ({
      id: String(r.id),
      seq: r.seq,
      msgId: r.msgId,
      direction: 'system',
      decision: r.decision,
      reason: r.reason ?? null,
      obligations: Array.isArray(r.obligations) ? (r.obligations as unknown[]) : [],
      policiesFired: Array.isArray(r.policiesFired) ? (r.policiesFired as string[]) : [],
      timestamp: r.timestamp.toISOString(),
      peerDid: conn.peerDid,
      spendDeltaCents: r.spendDeltaCents,
    })),
    initialCursor,
  };
}
