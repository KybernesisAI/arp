import type * as React from 'react';
import { redirect } from 'next/navigation';
import { and, asc, eq, gt, inArray, isNull, ne } from 'drizzle-orm';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { PLAN_LIMITS, pairingInvitations, registrarBindings } from '@kybernesis/arp-cloud-db';
import { monthlyBillCents, currentUsagePeriod } from '@/lib/billing';
import { listCredentialsForTenant } from '@/lib/webauthn';
import {
  Badge,
  ButtonLink,
  Card,
  CardMatrix,
  Code,
  Dot,
  Link,
  PlateHead,
} from '@/components/ui';
import { AppShell } from '@/components/app/AppShell';
import { ProvisionAgentButton } from './ProvisionAgentButton';
import { SelfTestConnectionButton } from './SelfTestConnectionButton';
import { OutgoingActions, IncomingActions } from './PairingInboxActions';
import { SKILL_TEMPLATES, listSkillNames } from '@kybernesis/arp/skill-templates';
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
    outgoingInvitations,
    incomingInvitations,
    recentActivity,
    totalActiveConnections,
    domains,
    usage,
  } = state;
  const limits = PLAN_LIMITS[tenant.plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free;
  const outgoingCount = outgoingInvitations.length;
  const incomingCount = incomingInvitations.length;

  return (
    <AppShell>
      <PlateHead
        plateNum="D.00"
        kicker={`// TENANT · ${tenant.plan.toUpperCase()} · ${tenant.status.toUpperCase()}`}
        title="Dashboard"
      />

      {!hasPasskey && <MigrateToPasskeyBanner />}

      {incomingCount > 0 && (
        <section className="mb-10">
          <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
            <h2 className="font-display font-medium text-h3 flex items-center gap-3">
              Incoming pairing requests
              <Badge tone="yellow">Pending · {incomingCount}</Badge>
            </h2>
            <span className="font-mono text-kicker uppercase text-muted">
              // I · INBOX
            </span>
          </header>
          <Card tone="yellow" padded={false} className="border border-rule">
            <ul className="list-none p-0 m-0">
              {incomingInvitations.map((inv, i) => (
                <li
                  key={inv.id}
                  className={'px-5 py-4 ' + (i === incomingInvitations.length - 1 ? '' : 'border-b border-ink/15')}
                >
                  <div className="grid grid-cols-12 gap-4 items-baseline mb-3">
                    <div className="col-span-12 md:col-span-5">
                      <span className="font-mono text-kicker uppercase text-muted block">
                        FROM
                      </span>
                      <Code className="text-body-sm break-all">{inv.issuerAgentDid}</Code>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <span className="font-mono text-kicker uppercase text-muted block">
                        TO YOUR AGENT
                      </span>
                      <Code className="text-body-sm break-all">{inv.audienceDid}</Code>
                    </div>
                    <div className="col-span-12 md:col-span-3 md:text-right font-mono text-kicker uppercase">
                      EXPIRES · {new Date(inv.expiresAt).toLocaleString()}
                    </div>
                  </div>
                  <IncomingActions
                    invitationId={inv.id}
                    acceptHref={inv.acceptHref}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {outgoingCount > 0 && (
        <section className="mb-10">
          <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
            <h2 className="font-display font-medium text-h3 flex items-center gap-3">
              Outgoing pairing requests
              <Badge tone="muted">Awaiting peer · {outgoingCount}</Badge>
            </h2>
            <span className="font-mono text-kicker uppercase text-muted">
              // O · SENT
            </span>
          </header>
          <Card tone="paper-2" padded={false} className="border border-rule">
            <ul className="list-none p-0 m-0">
              {outgoingInvitations.map((inv, i) => (
                <li
                  key={inv.id}
                  className={'px-5 py-4 ' + (i === outgoingInvitations.length - 1 ? '' : 'border-b border-rule')}
                >
                  <div className="grid grid-cols-12 gap-4 items-baseline mb-3">
                    <div className="col-span-12 md:col-span-5">
                      <span className="font-mono text-kicker uppercase text-muted block">
                        FROM YOUR AGENT
                      </span>
                      <Code className="text-body-sm break-all">{inv.issuerAgentDid}</Code>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <span className="font-mono text-kicker uppercase text-muted block">
                        TO
                      </span>
                      <Code className="text-body-sm break-all">{inv.audienceDid}</Code>
                    </div>
                    <div className="col-span-12 md:col-span-3 md:text-right font-mono text-kicker uppercase">
                      EXPIRES · {new Date(inv.expiresAt).toLocaleString()}
                    </div>
                  </div>
                  <OutgoingActions
                    invitationId={inv.id}
                    invitationUrl={inv.invitationUrl}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

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
            <span className="font-mono text-kicker uppercase text-muted hidden md:inline">
              // A · LIVE
            </span>
            <Link href="/connections" variant="mono">
              All connections ({totalActiveConnections}) →
            </Link>
            <Link href="/onboarding" variant="mono">
              Provision →
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
          <Card tone="paper-2" padded={false} className="border border-rule">
            <ul className="list-none p-0 m-0">
              {agents.map((a, i) => (
                <AgentRow key={a.did} agent={a} isLast={i === agents.length - 1} />
              ))}
            </ul>
          </Card>
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
              // D · REGISTRAR-BOUND
            </span>
          </header>
          <Card tone="paper-2" padded={false} className="border border-rule">
            <ul className="list-none p-0 m-0">
              {domains.map((d, i) => (
                <DomainRow
                  key={`${d.domain}-${d.ownerLabel}`}
                  domain={d}
                  isLast={i === domains.length - 1}
                />
              ))}
            </ul>
          </Card>
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
          <div className="flex items-center gap-4">
            <span className="font-mono text-kicker uppercase text-muted hidden md:inline">
              // R · LEDGER
            </span>
            <Link href="/connections" variant="mono">
              Browse connections →
            </Link>
          </div>
        </header>
        {recentActivity.length === 0 ? (
          <Card tone="paper-2" padded>
            <p className="text-body text-ink-2">
              No activity yet. Pair an agent to get started.
            </p>
          </Card>
        ) : (
          <Card tone="paper-2" padded={false} className="border border-rule">
            <ul className="list-none p-0 m-0">
              {recentActivity.map((entry, i) => (
                <ActivityRow key={entry.id} entry={entry} isLast={i === recentActivity.length - 1} />
              ))}
            </ul>
          </Card>
        )}
      </section>

      <SkillsSection />

      <section>
        <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
          <h2 className="font-display font-medium text-h3">Usage this month</h2>
          <div className="flex items-center gap-3">
            <span className="font-mono text-kicker uppercase text-muted">
              // {usage.period} · {tenant.plan.toUpperCase()}
            </span>
            <Link href="/billing" variant="mono">
              Billing →
            </Link>
          </div>
        </header>
        <CardMatrix className="grid-cols-1 md:grid-cols-4">
          <UsageQuotaCell
            label="INBOUND MSGS"
            used={usage.inboundMessages}
            cap={limits.maxInboundMessagesPerMonth}
          />
          <UsageQuotaCell
            label="AGENTS"
            used={agents.length}
            cap={tenant.plan === 'free' ? PLAN_LIMITS.free.maxAgents : null}
          />
          <QuotaCell
            tone="paper-2"
            label="MONTHLY BILL"
            value={`$${(usage.monthlyBillCents / 100).toFixed(2)}`}
          />
          <QuotaCell
            tone={tenant.status === 'active' ? 'blue' : 'yellow'}
            label="STATUS"
            value={
              <span className="inline-flex items-center gap-2">
                <Dot tone={tenant.status === 'active' ? 'green' : 'yellow'} />
                {tenant.status.toUpperCase()}
              </span>
            }
          />
        </CardMatrix>
      </section>
    </AppShell>
  );
}

function AgentRow({
  agent,
  isLast,
}: {
  agent: DashboardAgent;
  isLast?: boolean;
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
    <li className={'grid grid-cols-12 gap-4 px-5 py-4 items-baseline ' + (isLast ? '' : 'border-b border-rule')}>
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
      <div className="col-span-12 mt-2 flex flex-wrap gap-2">
        <SelfTestConnectionButton agentDid={agent.did} />
        <ButtonLink
          href={`/pair?from=${encodeURIComponent(agent.did)}`}
          variant="default"
          size="sm"
          arrow
        >
          Pair with another agent
        </ButtonLink>
      </div>
    </li>
  );
}

function DomainRow({
  domain,
  isLast,
}: {
  domain: DashboardDomain;
  isLast?: boolean;
}): React.JSX.Element {
  const ownerHost = `${domain.ownerLabel}.${domain.domain}`;
  return (
    <li className={'p-5 ' + (isLast ? '' : 'border-b border-rule')}>
      <div className="grid grid-cols-12 gap-4 items-baseline">
        <div className="col-span-12 md:col-span-3 flex items-baseline gap-3">
          <Dot tone={domain.provisioned ? 'green' : 'yellow'} />
          <div>
            <span className="font-display font-medium text-h5 block">
              {domain.domain}
            </span>
            {domain.provisioned && domain.provisionedAgentName && (
              <span className="font-mono text-kicker uppercase text-muted">
                AGENT · {domain.provisionedAgentName}
              </span>
            )}
          </div>
        </div>
        <div className="col-span-6 md:col-span-3 text-body-sm text-ink-2 break-all">
          <span className="font-mono text-kicker uppercase text-muted">OWNER · </span>
          <Code>{ownerHost}</Code>
        </div>
        <div className="col-span-3 md:col-span-2 font-mono text-kicker uppercase text-muted">
          VIA {domain.registrar.toUpperCase()}
        </div>
        <div className="col-span-3 md:col-span-2 md:text-center">
          {domain.provisioned ? (
            <Badge tone="blue" className="text-[9px] px-2 py-0.5">PROVISIONED</Badge>
          ) : (
            <Badge tone="yellow" className="text-[9px] px-2 py-0.5">PENDING</Badge>
          )}
        </div>
        {/* ProvisionAgentButton is a Fragment that contributes the
            small md:col-span-2 trigger cell + (when expanded) a
            full-width col-span-12 panel cell below. */}
        <ProvisionAgentButton
          domain={domain.domain}
          alreadyProvisioned={domain.provisioned}
        />
      </div>
    </li>
  );
}

function ActivityRow({
  entry,
  isLast,
}: {
  entry: ActivityEntry;
  isLast?: boolean;
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
    <li className={'grid grid-cols-12 gap-4 px-5 py-3 items-baseline ' + (isLast ? '' : 'border-b border-rule')}>
      <div className="col-span-4 md:col-span-2 font-mono text-kicker uppercase text-muted">
        {entry.ago}
      </div>
      <div className="col-span-4 md:col-span-2">
        <Badge tone={toneMap[entry.decision]} className="text-[9px] px-2 py-0.5">
          {labelMap[entry.decision]}
        </Badge>
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
  tone = 'paper',
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'paper' | 'paper-2' | 'blue' | 'yellow';
}): React.JSX.Element {
  const onAccent = tone === 'blue';
  return (
    <Card tone={tone}>
      <div
        className={
          'font-mono text-kicker uppercase ' +
          (onAccent ? 'text-white/80' : 'text-muted')
        }
      >
        {label}
      </div>
      <div className="mt-2 font-display font-medium text-h3">{value}</div>
    </Card>
  );
}

function UsageQuotaCell({
  label,
  used,
  cap,
}: {
  label: string;
  used: number;
  cap: number | null;
}): React.JSX.Element {
  const pct = cap === null ? 0 : Math.min(100, Math.round((used / cap) * 100));
  const tone = cap !== null && pct >= 80 ? 'yellow' : 'paper';
  return (
    <Card tone={tone}>
      <div className="font-mono text-kicker uppercase text-muted">{label}</div>
      <div className="mt-2 font-display font-medium text-h3">
        {used.toLocaleString()}
        <span className="ml-1 font-mono text-body-sm text-muted">
          / {cap === null ? '∞' : cap.toLocaleString()}
        </span>
      </div>
      {cap !== null && (
        <div className="mt-2 w-full bg-paper/30 h-1">
          <div className="h-1 bg-ink" style={{ width: `${pct}%` }} />
        </div>
      )}
    </Card>
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
  /** True when an agent row exists for `did:web:<domain>` under this tenant. */
  provisioned: boolean;
  /** Friendly name from the provisioned agent (when present) — shown as a sub-label. */
  provisionedAgentName: string | null;
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
  outgoingInvitations: Array<{
    id: string;
    issuerAgentDid: string;
    audienceDid: string;
    proposalId: string;
    expiresAt: string;
    invitationUrl: string;
  }>;
  incomingInvitations: Array<{
    id: string;
    issuerAgentDid: string;
    audienceDid: string;
    proposalId: string;
    expiresAt: string;
    acceptHref: string;
  }>;
  recentActivity: ActivityEntry[];
  totalActiveConnections: number;
  domains: DashboardDomain[];
  usage: {
    period: string;
    inboundMessages: number;
    monthlyBillCents: number;
  };
}> {
  const { tenantDb } = await requireTenantDb();
  const tenant = await tenantDb.getTenant();
  if (!tenant) throw new AuthError(404, 'no_tenant');
  const period = currentUsagePeriod();
  const [agentRows, summary, passkeys, recent, bindingRows, usageRow] = await Promise.all([
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
    tenantDb.getUsage(period),
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

  // Outgoing: pending invitations this tenant issued.
  // Incoming: cross-tenant invitations where the audience DID is one of
  // *our* agents. Both depend on the `audience_did` column added in
  // migration 0007. If the migration hasn't run yet (deploy-then-migrate
  // ordering), we fall back to empty lists so the dashboard still
  // renders. Logged so the operator notices and runs the migration.
  const myAgentDids = agentRows.map((a) => a.did);
  let outgoingRows: Array<{
    id: string;
    issuerAgentDid: string;
    audienceDid: string;
    challenge: string;
    payload: string;
    expiresAt: Date;
  }> = [];
  let incomingRows: typeof outgoingRows = [];
  try {
    outgoingRows = await tenantDb.raw
      .select({
        id: pairingInvitations.id,
        issuerAgentDid: pairingInvitations.issuerAgentDid,
        audienceDid: pairingInvitations.audienceDid,
        challenge: pairingInvitations.challenge,
        payload: pairingInvitations.payload,
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

    if (myAgentDids.length > 0) {
      incomingRows = await tenantDb.raw
        .select({
          id: pairingInvitations.id,
          issuerAgentDid: pairingInvitations.issuerAgentDid,
          audienceDid: pairingInvitations.audienceDid,
          challenge: pairingInvitations.challenge,
          payload: pairingInvitations.payload,
          expiresAt: pairingInvitations.expiresAt,
        })
        .from(pairingInvitations)
        .where(
          and(
            inArray(pairingInvitations.audienceDid, myAgentDids),
            ne(pairingInvitations.tenantId, tenantDb.tenantId),
            isNull(pairingInvitations.cancelledAt),
            isNull(pairingInvitations.consumedAt),
            gt(pairingInvitations.expiresAt, now),
          ),
        )
        .orderBy(asc(pairingInvitations.expiresAt));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[dashboard] pairing-inbox query failed — has migration 0007 run?', err);
  }

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

  // Map did:web:<domain> → agent row so each .agent domain knows whether
  // it's already been provisioned. Cloud-managed agents always live at
  // the domain's apex DID — registrar bindings without a matching agent
  // row are still in the "registered, not provisioned" state.
  const agentByDid = new Map(agentRows.map((a) => [a.did, a]));
  const domains: DashboardDomain[] = bindingRows.map((r) => {
    const agentDid = `did:web:${r.domain.toLowerCase()}`;
    const agent = agentByDid.get(agentDid) ?? null;
    return {
      domain: r.domain,
      ownerLabel: r.ownerLabel,
      registrar: r.registrar,
      principalDid: r.principalDid,
      createdAgo: formatAgo(now, r.createdAt),
      provisioned: agent !== null,
      provisionedAgentName: agent?.agentName ?? null,
    };
  });

  // Build the share URL the same shape POST /api/pairing/invitations
  // returns. We don't have x-forwarded-host here so fall back to env;
  // for local dev the relative `/pair/accept#…` form still works.
  const baseUrl = process.env['CLOUD_BASE_URL'] ?? '';
  const buildInvitationUrl = (payload: string) =>
    `${baseUrl.replace(/\/+$/, '')}/pair/accept#${payload}`;

  return {
    tenant: {
      plan: tenant.plan,
      status: tenant.status,
      principalDid: tenant.principalDid,
    },
    agents,
    hasPasskey: passkeys.length > 0,
    outgoingInvitations: outgoingRows.map((r) => ({
      id: r.id,
      issuerAgentDid: r.issuerAgentDid,
      audienceDid: r.audienceDid,
      proposalId: r.challenge,
      expiresAt: r.expiresAt.toISOString(),
      invitationUrl: buildInvitationUrl(r.payload),
    })),
    incomingInvitations: incomingRows.map((r) => ({
      id: r.id,
      issuerAgentDid: r.issuerAgentDid,
      audienceDid: r.audienceDid,
      proposalId: r.challenge,
      expiresAt: r.expiresAt.toISOString(),
      acceptHref: `/pair/accept#${r.payload}`,
    })),
    recentActivity,
    totalActiveConnections,
    domains,
    usage: {
      period,
      inboundMessages: usageRow?.inboundMessages ?? 0,
      monthlyBillCents: monthlyBillCents(tenant.plan, tenant.subscriptionQuantity ?? 1),
    },
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

/**
 * Skills section — editorial card matrix matching the landing page's
 * FeatureCard treatment. Each available skill becomes a tone'd card
 * with idx + category + title + body + a Download SKILL.md button +
 * the CLI alternative. Tones cycle (paper → blue → yellow → paper)
 * for visual rhythm.
 */
function SkillsSection(): React.JSX.Element {
  const names = listSkillNames();
  const toneCycle: Array<'paper' | 'blue' | 'yellow' | 'paper-2'> = [
    'paper',
    'blue',
    'yellow',
    'paper-2',
  ];
  return (
    <section className="mb-10">
      <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
        <h2 className="font-display font-medium text-h3">
          Agent skills
          <span className="text-muted font-mono text-body-sm ml-2">
            {names.length} available
          </span>
        </h2>
        <span className="font-mono text-kicker uppercase text-muted">
          // S · CAPABILITIES
        </span>
      </header>
      <p className="text-body text-ink-2 mb-4 max-w-3xl">
        Drop these into your agent folder so its LLM picks up new
        capabilities. Same SKILL.md works in KyberBot (
        <Code>./skills/&lt;name&gt;/SKILL.md</Code>) and Claude Code (
        <Code>.claude/skills/&lt;name&gt;/SKILL.md</Code>) — only the
        install path differs.
      </p>
      <CardMatrix
        className={
          names.length <= 1
            ? 'grid-cols-1'
            : names.length === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        }
      >
        {names.map((n, i) => {
          const tpl = SKILL_TEMPLATES[n]!;
          const desc =
            tpl.status === 'preview'
              ? extractPreviewBlurb(tpl.content)
              : extractSkillDescription(tpl.content);
          const tone = tpl.brandTone ?? toneCycle[i % toneCycle.length]!;
          return (
            <SkillCard
              key={n}
              idx={`S.${String(i + 1).padStart(2, '0')}`}
              name={n}
              description={desc}
              tone={tone}
              category={tpl.category}
              framework={tpl.framework}
              status={tpl.status}
              filename={tpl.filename}
            />
          );
        })}
      </CardMatrix>
    </section>
  );
}

function SkillCard({
  idx,
  name,
  description,
  tone,
  category,
  framework,
  status,
  filename,
}: {
  idx: string;
  name: string;
  description: string;
  tone: 'paper' | 'paper-2' | 'blue' | 'yellow' | 'red';
  category: string;
  framework: 'kyberbot-claude' | 'openclaw' | 'hermes';
  status: 'available' | 'preview';
  filename: string;
}): React.JSX.Element {
  // blue + red use white-on-color; yellow + paper use ink-on-paper.
  const onAccent = tone === 'blue' || tone === 'red';
  const isPreview = status === 'preview';
  return (
    <Card
      tone={tone}
      className={
        'min-h-[320px] gap-3 justify-between ' +
        (isPreview ? 'opacity-70' : '')
      }
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={
            'font-mono text-kicker uppercase ' +
            (onAccent ? 'text-white/90' : 'text-muted')
          }
        >
          {idx}
        </span>
        <span
          className={
            'font-mono text-kicker uppercase text-right ' +
            (onAccent ? 'text-white' : 'text-ink')
          }
        >
          {category}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <h3 className="text-h3 font-display font-medium max-w-[18ch]">{name}</h3>
        {isPreview && (
          <Badge tone={onAccent ? 'paper' : 'yellow'} className="text-[9px] px-2 py-0.5">
            PREVIEW
          </Badge>
        )}
      </div>
      <p
        className={
          'text-body-sm flex-1 max-w-[44ch] ' +
          (onAccent ? 'text-white/90' : 'text-ink-2')
        }
      >
        {description}
      </p>
      <div className="flex flex-col gap-2 mt-3">
        {isPreview ? (
          <span
            className={
              'inline-flex items-center gap-2 font-mono text-kicker uppercase border border-current/30 px-3 py-2 ' +
              (onAccent ? 'text-white/80' : 'text-muted')
            }
          >
            ▢ ADAPTER COMING SOON
          </span>
        ) : (
          <ButtonLink
            href={`/api/skills/${encodeURIComponent(name)}`}
            variant={onAccent ? 'default' : 'primary'}
            size="sm"
            arrow
          >
            Download {filename}
          </ButtonLink>
        )}
        <details
          className={
            'text-body-sm ' + (onAccent ? 'text-white/90' : 'text-ink-2')
          }
        >
          <summary
            className={
              'cursor-pointer font-mono text-kicker uppercase ' +
              (onAccent ? 'text-white/80' : 'text-muted')
            }
          >
            ▸ {framework === 'kyberbot-claude' ? 'INSTALL VIA CLI' : 'PREVIEW THE FORMAT'}
          </summary>
          <pre className="mt-2 text-xs leading-snug whitespace-pre-wrap">
{framework === 'kyberbot-claude'
  ? `# kyberbot (default)
arpc skill install ${name}

# claude-code (project-scoped)
arpc skill install ${name} --target claude-code

# claude-code (user-wide)
arpc skill install ${name} --target claude-code-global`
  : framework === 'openclaw'
    ? `# Once the OpenClaw adapter ships, you'll drop this file at:
#   <openclaw-project>/skills/contact.py
# OpenClaw uses Python decorator + Skill subclass — not SKILL.md.
# Preview the file via: curl https://cloud.arp.run/api/skills/${name}`
    : `# Once the Hermes adapter ships, you'll drop this file at:
#   <hermes-agent>/src/skills/contact.ts
# Hermes uses a @tool decorator on Agent methods — not SKILL.md.
# Preview the file via: curl https://cloud.arp.run/api/skills/${name}`}
          </pre>
        </details>
      </div>
    </Card>
  );
}

/** Strip the leading line(s) of placeholder Python/TS to summarise it for the card. */
function extractPreviewBlurb(content: string): string {
  // First useful comment paragraph from a # or // header.
  const lines = content.split('\n');
  const para: string[] = [];
  let started = false;
  for (const line of lines) {
    const t = line.trim();
    if (!started && (t.startsWith('# ') || t.startsWith('// '))) {
      started = true;
      para.push(t.replace(/^(#|\/\/) ?/, ''));
      continue;
    }
    if (started) {
      if (t.startsWith('#') || t.startsWith('//')) {
        const stripped = t.replace(/^(#|\/\/) ?/, '');
        if (stripped === '') break;
        para.push(stripped);
      } else {
        break;
      }
    }
  }
  return para.join(' ').trim() || 'Preview — adapter pending.';
}

/** Pull the `description: "…"` line from a skill's frontmatter for display. */
function extractSkillDescription(skillMd: string): string {
  const m = skillMd.match(/^description:\s*"([^"]+)"\s*$/m);
  return m ? m[1]! : '(see skill body)';
}
