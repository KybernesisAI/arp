import type * as React from 'react';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import {
  Badge,
  Code,
  Link,
  PlateHead,
} from '@/components/ui';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /connections/[id] — connection detail (slice 10b).
 *
 * Tenant-scoped via TenantDb.getConnection: a row that belongs to another
 * tenant returns the same 404 as a missing id, never revealing to the
 * caller that the connection id exists in someone else's account.
 */
export default async function ConnectionDetailPage(props: {
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
  const { connection, agentName } = detail;

  const statusTone =
    connection.status === 'active'
      ? 'blue'
      : connection.status === 'revoked'
        ? 'red'
        : 'yellow';

  return (
    <AppShell>
      <div className="mb-6 font-mono text-kicker uppercase text-muted">
        <Link href="/connections" variant="mono">
          ← CONNECTIONS
        </Link>
      </div>
      <PlateHead
        plateNum="C.02"
        kicker={`// CONNECTION · ${agentName.toUpperCase()} → PEER`}
        title={connection.purpose ?? connection.connectionId}
      />

      {connection.status === 'revoked' && (
        <div className="mb-8 border border-signal-red bg-paper p-5">
          <Badge tone="red" className="mb-2">REVOKED</Badge>
          <p className="text-body">
            This connection has been revoked
            {connection.revokeReason ? (
              <>
                {' '}— <Code>{connection.revokeReason}</Code>
              </>
            ) : null}
            . Historical audit remains available below.
          </p>
        </div>
      )}

      <section className="mb-10 border border-rule bg-paper p-6">
        <header className="grid grid-cols-12 gap-4 items-baseline pb-3 border-b border-rule">
          <div className="col-span-12 md:col-span-8">
            <div className="font-mono text-kicker uppercase text-muted">
              CONNECTION ID
            </div>
            <div className="text-body-sm break-all">
              <Code>{connection.connectionId}</Code>
            </div>
          </div>
          <div className="col-span-12 md:col-span-4 md:text-right">
            <Badge tone={statusTone}>{connection.status.toUpperCase()}</Badge>
          </div>
        </header>

        <dl className="grid grid-cols-12 gap-4 pt-4">
          <div className="col-span-12 md:col-span-6">
            <dt className="font-mono text-kicker uppercase text-muted">
              YOUR AGENT
            </dt>
            <dd className="text-body-sm break-all">
              <Code>{connection.agentDid}</Code>
            </dd>
          </div>
          <div className="col-span-12 md:col-span-6">
            <dt className="font-mono text-kicker uppercase text-muted">
              PEER AGENT
            </dt>
            <dd className="text-body-sm break-all">
              <Code>{connection.peerDid}</Code>
            </dd>
          </div>
          <div className="col-span-12 md:col-span-6">
            <dt className="font-mono text-kicker uppercase text-muted">
              ISSUED BY (PRINCIPAL)
            </dt>
            <dd className="text-body-sm break-all">
              <Code>{connection.token.issuer ?? '—'}</Code>
            </dd>
          </div>
          <div className="col-span-12 md:col-span-6">
            <dt className="font-mono text-kicker uppercase text-muted">
              AUDIENCE
            </dt>
            <dd className="text-body-sm break-all">
              <Code>{connection.token.audience ?? '—'}</Code>
            </dd>
          </div>
          <div className="col-span-12 md:col-span-6">
            <dt className="font-mono text-kicker uppercase text-muted">
              CREATED
            </dt>
            <dd className="text-body-sm">
              {new Date(connection.createdAt).toLocaleString()}
            </dd>
          </div>
          <div className="col-span-12 md:col-span-6">
            <dt className="font-mono text-kicker uppercase text-muted">
              EXPIRES
            </dt>
            <dd className="text-body-sm">
              {connection.expiresAt
                ? new Date(connection.expiresAt).toLocaleString()
                : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mb-10">
        <h3 className="font-display font-medium text-h4 mb-3 pb-2 border-b border-rule">
          Granted scopes{' '}
          <span className="text-muted font-mono text-body-sm ml-2">
            {connection.cedarPolicies.length}
          </span>
        </h3>
        {connection.cedarPolicies.length === 0 ? (
          <p className="text-body text-ink-2">None.</p>
        ) : (
          <ul className="space-y-3">
            {connection.cedarPolicies.map((policy, i) => (
              <li
                key={i}
                className="border border-rule bg-paper-2 p-3 font-mono text-xs whitespace-pre-wrap break-all"
              >
                {policy}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <h3 className="font-display font-medium text-h4 mb-3 pb-2 border-b border-rule">
          Obligations in effect{' '}
          <span className="text-muted font-mono text-body-sm ml-2">
            {connection.obligations.length}
          </span>
        </h3>
        {connection.obligations.length === 0 ? (
          <p className="text-body text-ink-2">No obligations attached.</p>
        ) : (
          <ul className="space-y-2">
            {connection.obligations.map((ob, i) => (
              <li key={i} className="border border-rule bg-paper p-3">
                <div className="font-mono text-kicker uppercase text-ink">
                  {(ob as { type?: string }).type ?? 'obligation'}
                </div>
                <pre className="mt-1 text-body-sm text-ink-2 whitespace-pre-wrap break-all">
                  {JSON.stringify((ob as { params?: unknown }).params ?? {}, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/connections/${encodeURIComponent(connection.connectionId)}/audit`}
          variant="mono"
        >
          View audit log →
        </Link>
        {connection.status === 'active' && (
          <Link
            href={`/connections/${encodeURIComponent(connection.connectionId)}/revoke`}
            variant="mono"
            className="text-signal-red border-signal-red"
          >
            Revoke →
          </Link>
        )}
      </div>
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
    cedarPolicies: string[];
    obligations: unknown[];
    revokeReason: string | null;
    createdAt: string;
    expiresAt: string | null;
    token: {
      issuer: string | null;
      audience: string | null;
    };
  };
  agentName: string;
}

async function loadDetail(id: string): Promise<DetailState | null> {
  const { tenantDb } = await requireTenantDb();
  const row = await tenantDb.getConnection(id);
  if (!row) return null;
  const agent = await tenantDb.getAgent(row.agentDid);
  const token = (row.tokenJson ?? {}) as Record<string, unknown>;
  const cedar = Array.isArray(row.cedarPolicies) ? (row.cedarPolicies as string[]) : [];
  const obligations = Array.isArray(row.obligations) ? (row.obligations as unknown[]) : [];
  return {
    agentName: agent?.agentName ?? row.agentDid,
    connection: {
      connectionId: row.connectionId,
      agentDid: row.agentDid,
      peerDid: row.peerDid,
      purpose: row.purpose ?? null,
      status: row.status,
      cedarPolicies: cedar,
      obligations,
      revokeReason: row.revokeReason ?? null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      token: {
        issuer: typeof token['issuer'] === 'string' ? (token['issuer'] as string) : null,
        audience:
          typeof token['audience'] === 'string' ? (token['audience'] as string) : null,
      },
    },
  };
}
