import type * as React from 'react';
import { redirect } from 'next/navigation';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { PLAN_LIMITS, pairingInvitations, registrarBindings } from '@kybernesis/arp-cloud-db';
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

const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;
const IDLE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

type HealthBucket = 'active' | 'idle' | 'inactive';

export default async function DashboardPage(): Promise<React.JSX.Element> {
  let state: Awaited<ReturnType<typeof loadState>>;
  try {
    state = await loadState();
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  const {
    tenant,
    agents,
    hasPasskey,
    pendingInvitations,
    recentActivity,
    totalActiveConnections,
    domains,
  } = state;
  const limits = PLAN_LIMITS[tenant.plan as keyof typeof PLAN_LIMITS];
  const pendingCount = pendingInvitations.length;
  const pendingTone: 'yellow' | 'muted' = pendingCount > 0 ? 'yellow' : 'muted';

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
          <h2 className="font-display font-medium text-h3 flex items-center gap-3">
            Incoming pairing requests
            <Badge tone={pendingTone}>Pending · {pendingCount}</Badge>
          </h2>
          <Link href="/pair" variant="mono">
            New connection →
          </Link>
        </header>
        {pendingCount === 0 ? (
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
          <div className="flex items-center gap-4">
            <Link href="/connections" variant="mono">
              See all connections ({totalActiveConnections}) →
            </Link>
            <Link href="/onboarding" variant="mono">
              Provision agent →
            </Link>
          </div>
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
              <AgentRow key={a.did} agent={a} />
            ))}
          </ul>
        )}
      </section>

      {domains.length > 0 && (
        <section className="mb-10">
          <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
            <h2 className="font-display font-medium text-h3">
              .agent domains{' '}
              <span className="text-muted font-mono text-body-sm ml-2">{domains.length}</span>
            </h2>
            <span className="font-mono text-kicker uppercase text-muted">
              REGISTRAR-BOUND
            </span>
          </header>
          <ul className="list-none p-0 m-0 border-t border-rule">
            {domains.map((d) => (
              <DomainRow key={`${d.domain}-${d.ownerLabel}`} domain={d} />
            ))}
          </ul>
        </section>
      )}

      <section className="mb-10">
        <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
          <h2 className="font-display font-medium text-h3">
            Recent activity
            <span className="text-muted font-mono text-body-sm ml-2">
              last {recentActivity.length}
            </span>
          </h2>
          <Link href="/connections" variant="mono">
            Browse connections →
          </Link>
        </header>
        {recentActivity.length === 0 ? (
          <Card tone="paper-2" padded>
            <p className="text-body text-ink-2">
              No activity yet. Pair an agent to get started.
            </p>
          </Card>
        ) : (
          <ul className="list-none p-0 m-0 border-t border-rule">
            {recentActivity.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
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

function AgentRow({
  agent,
}: {
  agent: DashboardAgent;
}): React.JSX.Element {
  const bucket = agent.healthBucket;
  const toneMap: Record<HealthBucket, 'green' | 'yellow' | 'ink'> = {
    active: 'green',
    idle: 'yellow',
    inactive: 'ink',
  };
  const labelMap: Record<HealthBucket, string> = {
    active: 'ACTIVE',
    idle: 'IDLE',
    inactive: 'INACTIVE',
  };
  return (
    <li className="grid grid-cols-12 gap-4 py-4 border-b border-rule items-baseline">
      <div className="col-span-12 md:col-span-3 flex items-baseline gap-3">
        <Dot tone={toneMap[bucket]} />
        <Link href={`/agent/${encodeURIComponent(agent.did)}`} variant="plain">
          <span className="font-display font-medium text-h5">{agent.name}</span>
        </Link>
      </div>
      <div className="col-span-6 md:col-span-4 text-body-sm text-ink-2 break-all">
        <Code>{agent.did}</Code>
      </div>
      <div className="col-span-3 md:col-span-2 font-mono text-kicker uppercase text-muted">
        {agent.activeConnections} CONN
      </div>
      <div className="col-span-3 md:col-span-3 md:text-right font-mono text-kicker uppercase text-muted">
        {labelMap[bucket]}
        {agent.lastAuditAgo && (
          <>
            <span className="mx-1 text-rule">·</span>
            {agent.lastAuditAgo}
          </>
        )}
      </div>
    </li>
  );
}

function DomainRow({ domain }: { domain: DashboardDomain }): React.JSX.Element {
  const ownerHost = `${domain.ownerLabel}.${domain.domain}`;
  return (
    <li className="grid grid-cols-12 gap-4 py-4 border-b border-rule items-baseline">
      <div className="col-span-12 md:col-span-3 flex items-baseline gap-3">
        <Dot tone="green" />
        <span className="font-display font-medium text-h5">{domain.domain}</span>
      </div>
      <div className="col-span-6 md:col-span-5 text-body-sm text-ink-2 break-all">
        <span className="font-mono text-kicker uppercase text-muted">OWNER · </span>
        <Code>{ownerHost}</Code>
      </div>
      <div className="col-span-3 md:col-span-2 font-mono text-kicker uppercase text-muted">
        VIA {domain.registrar.toUpperCase()}
      </div>
      <div className="col-span-3 md:col-span-2 md:text-right font-mono text-kicker uppercase text-muted">
        BOUND {domain.createdAgo}
      </div>
    </li>
  );
}

function ActivityRow({
  entry,
}: {
  entry: ActivityEntry;
}): React.JSX.Element {
  const toneMap: Record<ActivityEntry['decision'], 'ink' | 'red' | 'yellow' | 'muted'> = {
    allow: 'ink',
    deny: 'red',
    revoke: 'yellow',
    other: 'muted',
  };
  const labelMap: Record<ActivityEntry['decision'], string> = {
    allow: 'ALLOW',
    deny: 'DENY',
    revoke: 'REVOKE',
    other: entry.decisionRaw.toUpperCase(),
  };
  const auditHref = `/connections/${encodeURIComponent(entry.connectionId)}/audit?highlight=${encodeURIComponent(entry.msgId)}`;
  return (
    <li className="grid grid-cols-12 gap-4 py-3 border-b border-rule items-baseline">
      <div className="col-span-4 md:col-span-2 font-mono text-kicker uppercase text-muted">
        {entry.ago}
      </div>
      <div className="col-span-4 md:col-span-2">
        <Badge tone={toneMap[entry.decision]}>{labelMap[entry.decision]}</Badge>
      </div>
      <div className="col-span-12 md:col-span-4 text-body-sm text-ink-2 break-all">
        <Code>{entry.peerDid ?? entry.agentDid}</Code>
      </div>
      <div className="col-span-8 md:col-span-3 font-mono text-kicker uppercase text-muted">
        {entry.msgType}
      </div>
      <div className="col-span-4 md:col-span-1 md:text-right">
        <Link href={auditHref} variant="mono">
          View →
        </Link>
      </div>
    </li>
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

interface DashboardAgent {
  did: string;
  name: string;
  activeConnections: number;
  healthBucket: HealthBucket;
  lastAuditAgo: string | null;
}

interface DashboardDomain {
  domain: string;
  ownerLabel: string;
  registrar: string;
  principalDid: string;
  createdAgo: string;
}

interface ActivityEntry {
  id: string;
  connectionId: string;
  agentDid: string;
  peerDid: string | null;
  msgId: string;
  msgType: string;
  decision: 'allow' | 'deny' | 'revoke' | 'other';
  decisionRaw: string;
  ago: string;
}

async function loadState(): Promise<{
  tenant: { plan: string; status: string; principalDid: string };
  agents: DashboardAgent[];
  hasPasskey: boolean;
  pendingInvitations: Array<{
    id: string;
    issuerAgentDid: string;
    proposalId: string;
    expiresAt: string;
  }>;
  recentActivity: ActivityEntry[];
  totalActiveConnections: number;
  domains: DashboardDomain[];
}> {
  const { tenantDb } = await requireTenantDb();
  const tenant = await tenantDb.getTenant();
  if (!tenant) throw new AuthError(404, 'no_tenant');
  const [agentRows, summary, passkeys, recent, bindingRows] = await Promise.all([
    tenantDb.listAgents(),
    tenantDb.getAgentActivitySummary(),
    listCredentialsForTenant(tenantDb.tenantId),
    tenantDb.listRecentActivity(10),
    // .agent-domain registrar bindings (v2.1) — published when a TLD
    // registrar (Headless et al) finishes the bind-principal callback
    // for one of this tenant's owner subdomains.
    tenantDb.raw
      .select({
        domain: registrarBindings.domain,
        ownerLabel: registrarBindings.ownerLabel,
        registrar: registrarBindings.registrar,
        principalDid: registrarBindings.principalDid,
        createdAt: registrarBindings.createdAt,
      })
      .from(registrarBindings)
      .where(eq(registrarBindings.tenantId, tenantDb.tenantId))
      .orderBy(asc(registrarBindings.createdAt)),
  ]);

  const now = new Date();
  const summaryByDid = new Map(summary.map((s) => [s.agentDid, s]));
  const agents: DashboardAgent[] = agentRows.map((a) => {
    const s = summaryByDid.get(a.did);
    const lastAt = s?.lastAuditAt ?? a.lastSeenAt ?? null;
    return {
      did: a.did,
      name: a.agentName,
      activeConnections: s?.activeConnections ?? 0,
      healthBucket: computeHealth(now, lastAt),
      lastAuditAgo: lastAt ? formatAgo(now, lastAt) : null,
    };
  });

  const totalActiveConnections = agents.reduce(
    (sum, a) => sum + a.activeConnections,
    0,
  );

  // Pending invitations issued by this tenant (same query as 10a widget).
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

  const recentActivity: ActivityEntry[] = recent.map((r) => ({
    id: String(r.id),
    connectionId: r.connectionId,
    agentDid: r.agentDid,
    peerDid: null,
    msgId: r.msgId,
    msgType: r.reason ?? inferMsgType(r.decision),
    decision: normalizeDecision(r.decision),
    decisionRaw: r.decision,
    ago: formatAgo(now, r.timestamp),
  }));

  const domains: DashboardDomain[] = bindingRows.map((r) => ({
    domain: r.domain,
    ownerLabel: r.ownerLabel,
    registrar: r.registrar,
    principalDid: r.principalDid,
    createdAgo: formatAgo(now, r.createdAt),
  }));

  return {
    tenant: {
      plan: tenant.plan,
      status: tenant.status,
      principalDid: tenant.principalDid,
    },
    agents,
    hasPasskey: passkeys.length > 0,
    pendingInvitations: invitationRows.map((r) => ({
      id: r.id,
      issuerAgentDid: r.issuerAgentDid,
      proposalId: r.challenge,
      expiresAt: r.expiresAt.toISOString(),
    })),
    recentActivity,
    totalActiveConnections,
    domains,
  };
}

function computeHealth(now: Date, last: Date | null): HealthBucket {
  if (!last) return 'inactive';
  const delta = now.getTime() - last.getTime();
  if (delta <= ACTIVE_THRESHOLD_MS) return 'active';
  if (delta <= IDLE_THRESHOLD_MS) return 'idle';
  return 'inactive';
}

export function formatAgo(now: Date, then: Date): string {
  const delta = Math.max(0, now.getTime() - then.getTime());
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function normalizeDecision(raw: string): ActivityEntry['decision'] {
  const v = raw.toLowerCase();
  if (v === 'allow') return 'allow';
  if (v === 'deny') return 'deny';
  if (v === 'revoke' || v === 'revoked') return 'revoke';
  return 'other';
}

function inferMsgType(decision: string): string {
  return decision ? `audit:${decision}` : 'audit';
}
