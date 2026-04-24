import type * as React from 'react';
import { redirect } from 'next/navigation';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { PLAN_LIMITS, pairingInvitations } from '@kybernesis/arp-cloud-db';
import { listCredentialsForTenant } from '@/lib/webauthn';
import {
  Badge,
  ButtonLink,
  Card,
  Code,
  Dot,
  Link,
  PlateHead,
} from '@/components/ui';
import { AppShell } from '@/components/app/AppShell';
import { MigrateToPasskeyBanner } from '@/components/app/MigrateToPasskeyBanner';

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
  const { tenant, agents, hasPasskey, pendingInvitations } = state;
  const limits = PLAN_LIMITS[tenant.plan as keyof typeof PLAN_LIMITS];

  return (
    <AppShell>
      <PlateHead
        plateNum="D.00"
        kicker={`// TENANT · ${tenant.plan.toUpperCase()} · ${tenant.status.toUpperCase()}`}
        title="Dashboard"
      />

      {!hasPasskey && <MigrateToPasskeyBanner />}

      <section className="mb-10">
        <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
          <h2 className="font-display font-medium text-h3">
            Incoming pairing requests{' '}
            <span className="text-muted font-mono text-body-sm ml-2">
              {pendingInvitations.length}
            </span>
          </h2>
          <Link href="/pair" variant="mono">
            New connection →
          </Link>
        </header>
        {pendingInvitations.length === 0 ? (
          <Card tone="paper-2" padded>
            <p className="text-body text-ink-2">
              No pending invitations. Start a new pairing from{' '}
              <Link href="/pair">/pair</Link>.
            </p>
          </Card>
        ) : (
          <ul className="list-none p-0 m-0 border-t border-rule">
            {pendingInvitations.map((inv) => (
              <li
                key={inv.id}
                className="grid grid-cols-12 gap-4 py-4 border-b border-rule items-baseline"
              >
                <div className="col-span-12 md:col-span-4 font-display font-medium text-h5 break-all">
                  <Code>{inv.issuerAgentDid}</Code>
                </div>
                <div className="col-span-12 md:col-span-4 text-body-sm text-ink-2">
                  PROPOSAL · <Code>{inv.proposalId}</Code>
                </div>
                <div className="col-span-12 md:col-span-4 md:text-right font-mono text-kicker uppercase text-muted">
                  EXPIRES · {new Date(inv.expiresAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-12 gap-4 mb-10">
        <div className="col-span-12 md:col-span-8">
          <div className="font-mono text-kicker uppercase text-muted">// PRINCIPAL</div>
          <Code className="mt-2 text-[13px] break-all">{tenant.principalDid}</Code>
        </div>
        <div className="col-span-12 md:col-span-4 md:text-right">
          <ButtonLink href="/billing" variant="default" size="sm" arrow>
            Billing
          </ButtonLink>
        </div>
      </div>

      <section className="mb-10">
        <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
          <h2 className="font-display font-medium text-h3">
            Agents <span className="text-muted font-mono text-body-sm ml-2">{agents.length}</span>
          </h2>
          <Link href="/onboarding" variant="mono">
            Provision agent →
          </Link>
        </header>
        {agents.length === 0 ? (
          <Card tone="paper-2" padded>
            <p className="text-body text-ink-2">
              No agents yet. <Link href="/onboarding">Provision one</Link> to get started.
            </p>
          </Card>
        ) : (
          <ul className="list-none p-0 m-0 border-t border-rule">
            {agents.map((a) => (
              <li
                key={a.did}
                className="grid grid-cols-12 gap-4 py-4 border-b border-rule items-baseline"
              >
                <div className="col-span-12 md:col-span-3">
                  <Link href={`/agent/${encodeURIComponent(a.did)}`} variant="plain">
                    <span className="font-display font-medium text-h5">{a.name}</span>
                  </Link>
                </div>
                <div className="col-span-12 md:col-span-6 text-body-sm text-ink-2 break-all">
                  <Code>{a.did}</Code>
                </div>
                <div className="col-span-12 md:col-span-3 md:text-right font-mono text-kicker uppercase text-muted">
                  LAST SEEN · {a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleString() : 'NEVER'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
          <h2 className="font-display font-medium text-h3">Plan quotas</h2>
          <Badge tone="blue">{tenant.plan.toUpperCase()}</Badge>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
          <QuotaCell
            label="AGENTS"
            value={`${agents.length} / ${limits.maxAgents ?? '∞'}`}
          />
          <QuotaCell
            label="INBOUND MSGS / MONTH"
            value={limits.maxInboundMessagesPerMonth?.toLocaleString() ?? '∞'}
          />
          <QuotaCell
            label="STATUS"
            value={
              <span className="inline-flex items-center gap-2">
                <Dot tone={tenant.status === 'active' ? 'green' : 'yellow'} />
                {tenant.status.toUpperCase()}
              </span>
            }
          />
        </div>
      </section>
    </AppShell>
  );
}

function QuotaCell({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="bg-paper p-6">
      <div className="font-mono text-kicker uppercase text-muted">{label}</div>
      <div className="mt-2 font-display font-medium text-h3">{value}</div>
    </div>
  );
}

async function loadState() {
  const { tenantDb } = await requireTenantDb();
  const tenant = await tenantDb.getTenant();
  if (!tenant) throw new AuthError(404, 'no_tenant');
  const agents = await tenantDb.listAgents();
  const passkeys = await listCredentialsForTenant(tenantDb.tenantId);
  const now = new Date();
  // Phase-10a incoming-pairing widget: list the tenant's own issued
  // invitations that are still pending (not cancelled, not consumed, not
  // expired). The slice brief notes the widget may start empty for 10a —
  // the cross-tenant inbound-pairing-via-DIDComm path is 10b+.
  const invitationRows = await tenantDb.raw
    .select({
      id: pairingInvitations.id,
      issuerAgentDid: pairingInvitations.issuerAgentDid,
      challenge: pairingInvitations.challenge,
      expiresAt: pairingInvitations.expiresAt,
    })
    .from(pairingInvitations)
    .where(
      and(
        eq(pairingInvitations.tenantId, tenantDb.tenantId),
        isNull(pairingInvitations.cancelledAt),
        isNull(pairingInvitations.consumedAt),
        gt(pairingInvitations.expiresAt, now),
      ),
    )
    .orderBy(asc(pairingInvitations.expiresAt));
  return {
    tenant,
    agents: agents.map((a) => ({
      did: a.did,
      name: a.agentName,
      lastSeenAt: a.lastSeenAt ? a.lastSeenAt.toISOString() : null,
    })),
    hasPasskey: passkeys.length > 0,
    pendingInvitations: invitationRows.map((r) => ({
      id: r.id,
      issuerAgentDid: r.issuerAgentDid,
      proposalId: r.challenge,
      expiresAt: r.expiresAt.toISOString(),
    })),
  };
}
