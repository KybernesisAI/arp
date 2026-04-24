import type * as React from 'react';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import { Badge, Code, Link, PlateHead } from '@/components/ui';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { RevokeConfirmForm } from './RevokeConfirmForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /connections/[id]/revoke — confirmation screen (slice 10b).
 *
 * Shown only when the connection is active. If the tenant hits this URL
 * after the connection is already revoked, we bounce them back to the
 * detail page so the revoked banner renders.
 */
export default async function RevokeConfirmPage(props: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id: rawId } = await props.params;
  const id = decodeURIComponent(rawId);
  let conn: Awaited<ReturnType<typeof loadConn>>;
  try {
    conn = await loadConn(id);
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  if (!conn) notFound();
  if (conn.status === 'revoked') {
    redirect(`/connections/${encodeURIComponent(id)}`);
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
        plateNum="C.04"
        kicker="// REVOKE · OWNER-INITIATED TEARDOWN"
        title="Revoke connection"
      />

      <div className="max-w-2xl space-y-6">
        <div className="border border-signal-red bg-paper p-5">
          <Badge tone="red" className="mb-2">IRREVERSIBLE</Badge>
          <p className="text-body">
            You are about to revoke the connection to{' '}
            <Code>{conn.peerDid}</Code>.
          </p>
          <ul className="mt-3 text-body-sm text-ink-2 list-disc ml-6">
            <li>Your agent will stop accepting messages from this peer.</li>
            <li>
              Outbound attempts to this peer will be refused by the local
              policy check.
            </li>
            <li>Historical audit entries remain queryable.</li>
            <li>
              You cannot undo a revocation — a new pairing invitation creates
              a distinct connection id.
            </li>
          </ul>
        </div>

        <RevokeConfirmForm connectionId={id} peerDid={conn.peerDid} />

        <div className="pt-4 border-t border-rule">
          <Link
            href={`/connections/${encodeURIComponent(id)}`}
            variant="mono"
          >
            ← CANCEL, RETURN TO CONNECTION
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

async function loadConn(id: string) {
  const { tenantDb } = await requireTenantDb();
  const row = await tenantDb.getConnection(id);
  if (!row) return null;
  return { peerDid: row.peerDid, status: row.status };
}
