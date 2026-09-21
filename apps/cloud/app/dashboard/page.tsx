import type * as React from 'react';
import { redirect } from 'next/navigation';
import { and, asc, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { PLAN_LIMITS, agentLinks, agents, pairingInvitations, registrarBindings } from '@kybernesis/arp-cloud-db';
import { monthlyBillCents, currentUsagePeriod } from '@/lib/billing';
import { listCredentialsForTenant } from '@/lib/webauthn';
import { env } from '@/lib/env';
import { mirrorOriginFor } from '@/lib/key-custody';
import { agentLiveness, type Liveness } from '@/lib/agent-liveness';
import { ConsoleShell } from '@/components/app/ConsoleShell';
import { MigrateToPasskeyBanner } from '@/components/app/MigrateToPasskeyBanner';
import { Card, Kicker, StateChip, Tag } from '@/app/lander/ui';
import { ClaimName } from './ClaimName';
import { OutgoingRequestActions, IncomingRequestActions } from './PairingRequestActions';
import { CreateIdentityButton } from './CreateIdentityButton';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The dashboard: every agent this account holds, one card each.
 *
 * One card merges what used to be three lists (agents, purchased names, owner
 * bindings): a name you bought here, an identity minted for it, and the owner
 * proof are three facts about the same agent, so they show together. Cards
 * open the name's page (`/names/<sld>`), where everything can be changed.
 */
export default async function DashboardPage(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }): Promise<React.JSX.Element> {
  const sp = (await props.searchParams) ?? {};
  const claimParam = typeof sp['claim'] === 'string' ? sp['claim'] : undefined;
  let state: Awaited<ReturnType<typeof loadState>>;
  try {
    state = await loadState();
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  const { tenant, identities, hasPasskey, outgoingInvitations, incomingInvitations, recentActivity, totalActiveConnections, usage } = state;
  const limits = PLAN_LIMITS[tenant.plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free;
  const needsAttention = identities.filter((i) => i.attention).length;
  const nameByDid = new Map(identities.map((i) => [i.did, i.domain]));

  return (
    <ConsoleShell active="agents">
      {/* HEADER */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <Kicker>Your agents</Kicker>
          <h1 className="mt-2 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-zinc-950 sm:text-[44px]">
            {identities.length === 0 ? 'No agents yet.' : identities.length === 1 ? 'One agent.' : `${identities.length} agents.`}
          </h1>
          <p className="mt-3 max-w-[56ch] text-[16px] text-zinc-600">
            {identities.length === 0
              ? 'Claim a name below and give your agent an identity it can keep.'
              : `${totalActiveConnections} active ${totalActiveConnections === 1 ? 'connection' : 'connections'}${needsAttention ? ` · ${needsAttention} ${needsAttention === 1 ? 'agent needs' : 'agents need'} a step from you` : ''}.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#claim" className="rounded-full bg-black px-5 py-2.5 text-[14px] font-medium text-white hover:bg-zinc-800">Claim a name</a>
          <a href="/pair" className="rounded-full border border-zinc-300 px-5 py-2.5 text-[14px] font-medium text-zinc-900 hover:border-zinc-900">Pair two agents</a>
        </div>
      </div>

      {!hasPasskey && <div className="mt-8"><MigrateToPasskeyBanner /></div>}

      {/* NEEDS YOU: pairing requests */}
      {(incomingInvitations.length > 0 || outgoingInvitations.length > 0) && (
        <section className="mt-10">
          <Kicker>Pairing requests</Kicker>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {incomingInvitations.map((inv) => (
              <Card key={inv.id} glow="emerald">
                <div className="flex items-center justify-between gap-3">
                  <Tag tone="emerald">Wants to connect</Tag>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">expires {mdy(inv.expiresAt)}</span>
                </div>
                <p className="mt-4 text-[17px] font-medium tracking-[-0.01em] text-zinc-900">
                  {nice(inv.issuerAgentDid)} <span className="text-zinc-400">→</span> {nameByDid.get(inv.audienceDid) ?? nice(inv.audienceDid)}
                </p>
                <p className="mt-1 text-[14px] text-zinc-600">Review what they ask for, choose what you grant back, then approve.</p>
                <div className="mt-5"><IncomingRequestActions invitationId={inv.id} acceptHref={inv.acceptHref} /></div>
              </Card>
            ))}
            {outgoingInvitations.map((inv) => (
              <Card key={inv.id}>
                <div className="flex items-center justify-between gap-3">
                  <Tag>Waiting for them</Tag>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">expires {mdy(inv.expiresAt)}</span>
                </div>
                <p className="mt-4 text-[17px] font-medium tracking-[-0.01em] text-zinc-900">
                  {nameByDid.get(inv.issuerAgentDid) ?? nice(inv.issuerAgentDid)} <span className="text-zinc-400">→</span> {nice(inv.audienceDid)}
                </p>
                <p className="mt-1 text-[14px] text-zinc-600">{inv.approveHref ? 'Both agents are yours, so you can approve it right here.' : 'Share the link with the other owner; the connection opens when they approve.'}</p>
                <div className="mt-5"><OutgoingRequestActions invitationId={inv.id} invitationUrl={inv.invitationUrl} approveHref={inv.approveHref} /></div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* AGENTS */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <Kicker>Agents</Kicker>
          <a href="/connections" className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-900">All connections →</a>
        </div>
        {identities.length === 0 ? (
          <Card className="mt-4"><p className="m-0 text-[15px] text-zinc-600">Nothing here yet. Claim a name below.</p></Card>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {identities.map((a) => <AgentCard key={a.domain} a={a} />)}
          </div>
        )}
      </section>

      {/* CLAIM */}
      <section id="claim" className="mt-10 scroll-mt-24">
        <Kicker>Claim a name</Kicker>
        <Card className="mt-4">
          <p className="mb-5 max-w-[60ch] text-[15px] text-zinc-600">A permanent .agent name for a new agent. Registered to this account, renews on your terms, yours to give away.</p>
          <ClaimName initialQuery={claimParam} />
        </Card>
      </section>

      {/* ACTIVITY + PLAN */}
      <section className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <Kicker>Recent activity</Kicker>
            <a href="/connections" className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-900">Browse →</a>
          </div>
          {recentActivity.length === 0 ? (
            <p className="mt-4 text-[15px] text-zinc-600">No messages yet. Pair two agents and it fills in here.</p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-200">
              {recentActivity.map((e) => (
                <li key={e.id} className="grid grid-cols-12 items-center gap-3 py-2.5">
                  <div className="col-span-3 sm:col-span-2 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400">{e.ago}</div>
                  <div className="col-span-4 sm:col-span-3 text-[14px] text-zinc-900">{nameByDid.get(e.agentDid) ?? nice(e.agentDid)}</div>
                  <div className="col-span-5 sm:col-span-5 truncate font-mono text-[12px] text-zinc-500">{e.msgType}</div>
                  <div className="col-span-12 sm:col-span-2 flex justify-end">
                    <a href={e.auditHref} className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] hover:underline">
                      <span className={`h-1.5 w-1.5 rounded-full ${e.decision === 'allow' ? 'bg-emerald-500' : e.decision === 'deny' ? 'bg-amber-500' : e.decision === 'revoke' ? 'bg-zinc-900' : 'bg-zinc-300'}`} />
                      <span className={e.decision === 'allow' ? 'text-emerald-700' : e.decision === 'deny' ? 'text-amber-700' : 'text-zinc-600'}>{e.decision === 'other' ? e.decisionRaw : e.decision}</span>
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card glow="cyan">
          <div className="flex items-baseline justify-between">
            <Kicker>Plan</Kicker>
            <a href="/billing" className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-900">Billing →</a>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[24px] font-medium tracking-[-0.02em] capitalize">
            {tenant.plan}
            <span className={`ml-1 h-2 w-2 rounded-full ${tenant.status === 'active' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          </div>
          <dl className="mt-5 space-y-3 text-[14px]">
            <Row k="Messages this month" v={limits.maxInboundMessagesPerMonth ? `${usage.inboundMessages} / ${limits.maxInboundMessagesPerMonth}` : String(usage.inboundMessages)} />
            <Row k="Agents" v={limits.maxAgents ? `${identities.length} / ${limits.maxAgents}` : String(identities.length)} />
            <Row k="This month" v={`$${(usage.monthlyBillCents / 100).toFixed(2)}`} />
          </dl>
        </Card>
      </section>
    </ConsoleShell>
  );
}

function Row({ k, v }: { k: string; v: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-zinc-600">{k}</dt>
      <dd className="m-0 font-mono text-[13px] text-zinc-900">{v}</dd>
    </div>
  );
}

/** `2027-09-18T…` → `09-18-2027`. */
export function mdy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}-${d}-${y}`;
}

/** `did:web:kyber.agent` → `kyber.agent`; anything else untouched. */
function nice(did: string): string {
  return did.replace(/^did:web:/, '');
}

/* ------------------------------------------------------------------ agent card */

type IdentityState =
  | 'online' // runtime attached and answering
  | 'offline' // runtime attached, not answering
  | 'identity_only' // identity exists, no runtime yet
  | 'setup' // name registered here, identity not created yet
  | 'bound_only'; // owner proof exists, no identity yet

export interface DashboardIdentity {
  domain: string;
  sld: string;
  did: string;
  name: string;
  description: string;
  picture: string | null;
  accent: string | null;
  state: IdentityState;
  ownerLabel: string | null;
  ownerVerified: boolean;
  hasIdentity: boolean;
  activeConnections: number;
  verifiedLinks: number;
  expiryAt: string | null;
  registrationStatus: string | null;
  registrationError: string | null;
  keyCustody: 'cloud' | 'exported' | null;
  registrar: string | null;
  /** Something the owner still has to do (verify owner, set up, fix). */
  attention: string | null;
}

const STATE_LABEL: Record<IdentityState, string> = {
  online: 'Online',
  offline: 'Offline',
  identity_only: 'Not connected',
  setup: 'Set up needed',
  bound_only: 'Identity not created',
};

function AgentCard({ a }: { a: DashboardIdentity }): React.JSX.Element {
  const href = a.state === 'bound_only' ? null : `/names/${a.sld}`;
  const dot = a.state === 'online' ? 'bg-emerald-500' : a.state === 'offline' ? 'bg-amber-400' : 'bg-zinc-300';
  return (
    <Card glow={a.state === 'online' ? 'emerald' : undefined} className="flex flex-col">
      <div className="flex items-start gap-4">
        <span
          className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-[20px] font-medium text-zinc-500"
          style={a.accent ? { boxShadow: `0 0 0 2px ${a.accent}` } : undefined}
        >
          {a.picture ? <img src={a.picture} alt="" className="h-full w-full object-cover" /> : a.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          {href ? (
            <a href={href} className="block truncate text-[18px] font-medium tracking-[-0.01em] text-zinc-950 hover:underline">
              {a.sld}<span className="text-zinc-400">.agent</span>
            </a>
          ) : (
            <span className="block truncate text-[18px] font-medium tracking-[-0.01em] text-zinc-950">{a.sld}<span className="text-zinc-400">.agent</span></span>
          )}
          <div className="mt-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            <span className="relative flex h-1.5 w-1.5">
              {a.state === 'online' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dot}`} />
            </span>
            {STATE_LABEL[a.state]}
          </div>
        </div>
      </div>
      {a.description && <p className="mt-4 line-clamp-2 text-[14px] leading-relaxed text-zinc-600">{a.description}</p>}
      <dl className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
        <div><dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">Owner</dt><dd className="m-0 mt-1"><StateChip state={a.ownerVerified ? 'verified' : 'pending'} /></dd></div>
        <div><dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">Connections</dt><dd className="m-0 mt-1 font-mono text-[13px] text-zinc-900">{a.activeConnections}</dd></div>
        <div><dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">Links</dt><dd className="m-0 mt-1 font-mono text-[13px] text-zinc-900">{a.verifiedLinks}</dd></div>
      </dl>
      {a.attention && (
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800">{a.attention}</p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
        {href ? (
          <>
            <a href={href} className="rounded-full bg-black px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800">Open</a>
            {a.hasIdentity && <a href={`${env().AGENTID_PROFILE_BASE}/${a.sld}`} className="rounded-full border border-zinc-300 px-4 py-2 text-[13px] font-medium text-zinc-900 hover:border-zinc-900">Public page</a>}
            {a.hasIdentity && <a href={`/pair?from=${encodeURIComponent(a.did)}`} className="rounded-full border border-zinc-300 px-4 py-2 text-[13px] font-medium text-zinc-900 hover:border-zinc-900">Pair</a>}
          </>
        ) : (
          <CreateIdentityButton sld={a.sld} />
        )}
      </div>
      {/* Own line under the buttons; cards in a row stretch to equal height, so it sits at the same spot on each. */}
      <div className="mt-4 text-right font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">{a.expiryAt ? `renews ${mdy(a.expiryAt)}` : '\u00a0'}</div>
    </Card>
  );
}

/* ------------------------------------------------------------------ data */

interface ActivityEntry {
  id: string;
  agentDid: string;
  msgType: string;
  decision: 'allow' | 'deny' | 'revoke' | 'other';
  decisionRaw: string;
  ago: string;
  auditHref: string;
}

async function loadState(): Promise<{
  tenant: { plan: string; status: string };
  identities: DashboardIdentity[];
  hasPasskey: boolean;
  outgoingInvitations: Array<{ id: string; issuerAgentDid: string; audienceDid: string; expiresAt: string; invitationUrl: string; approveHref: string | null }>;
  incomingInvitations: Array<{ id: string; issuerAgentDid: string; audienceDid: string; expiresAt: string; acceptHref: string }>;
  recentActivity: ActivityEntry[];
  totalActiveConnections: number;
  usage: { period: string; inboundMessages: number; monthlyBillCents: number };
}> {
  const { tenantDb } = await requireTenantDb();
  const tenant = await tenantDb.getTenant();
  if (!tenant) throw new AuthError(404, 'no_tenant');
  const period = currentUsagePeriod();
  const now = new Date();
  const db = tenantDb.raw;

  const [agentRows, summary, passkeys, recent, bindingRows, usageRow, registrationRows, linkCounts] = await Promise.all([
    // Only what the card needs — never the picture bytes.
    db
      .select({
        did: agents.did,
        agentName: agents.agentName,
        agentDescription: agents.agentDescription,
        runtimeKind: agents.runtimeKind,
        pushKind: agents.pushKind,
        pushUrl: agents.pushUrl,
        lastSeenAt: agents.lastSeenAt,
        keyCustody: agents.keyCustody,
        accent: agents.accent,
        hasAvatar: sql<boolean>`${agents.avatarData} is not null`,
        profileUpdatedAt: agents.profileUpdatedAt,
        createdAt: agents.createdAt,
      })
      .from(agents)
      .where(eq(agents.tenantId, tenantDb.tenantId))
      .orderBy(asc(agents.createdAt)),
    tenantDb.getAgentActivitySummary(),
    listCredentialsForTenant(tenantDb.tenantId),
    tenantDb.listRecentActivity(8),
    db
      .select({ domain: registrarBindings.domain, ownerLabel: registrarBindings.ownerLabel, registrar: registrarBindings.registrar, createdAt: registrarBindings.createdAt })
      .from(registrarBindings)
      .where(eq(registrarBindings.tenantId, tenantDb.tenantId))
      .orderBy(desc(registrarBindings.createdAt)),
    tenantDb.getUsage(period),
    tenantDb.listRegistrations(),
    db
      .select({ agentDid: agentLinks.agentDid, n: sql<number>`count(*)::int` })
      .from(agentLinks)
      .where(and(eq(agentLinks.tenantId, tenantDb.tenantId), eq(agentLinks.status, 'verified')))
      .groupBy(agentLinks.agentDid),
  ]);

  const summaryByDid = new Map(summary.map((s) => [s.agentDid, s]));
  const linksByDid = new Map(linkCounts.map((l) => [l.agentDid, l.n]));
  const bindingByDomain = new Map<string, (typeof bindingRows)[number]>();
  for (const b of bindingRows) if (!bindingByDomain.has(b.domain.toLowerCase())) bindingByDomain.set(b.domain.toLowerCase(), b);
  const registrationByDomain = new Map(registrationRows.map((r) => [r.domain.toLowerCase(), r]));
  const agentByDomain = new Map(agentRows.map((a) => [a.did.replace(/^did:web:/, '').toLowerCase(), a]));

  // Every domain this account touches, from any of the three tables.
  const domains = new Set<string>([...agentByDomain.keys(), ...registrationByDomain.keys(), ...bindingByDomain.keys()]);
  const suffix = env().AGENTID_MIRROR_SUFFIX;

  const identities = await Promise.all(
    [...domains].map(async (domain): Promise<DashboardIdentity> => {
      const sld = domain.replace(/\.agent$/, '');
      const did = `did:web:${domain}`;
      const agent = agentByDomain.get(domain) ?? null;
      const reg = registrationByDomain.get(domain) ?? null;
      const binding = bindingByDomain.get(domain) ?? null;
      const s = agent ? summaryByDid.get(agent.did) : undefined;
      const mirror = mirrorOriginFor(domain, suffix);

      let state: IdentityState;
      let liveness: Liveness | null = null;
      if (agent) {
        liveness = await agentLiveness({ runtimeKind: agent.runtimeKind, pushKind: agent.pushKind, pushUrl: agent.pushUrl, lastSeenAt: agent.lastSeenAt }, { timeoutMs: 1_500 });
        state = liveness;
      } else if (reg) {
        state = 'setup';
      } else {
        state = 'bound_only';
      }

      let attention: string | null = null;
      if (reg?.status === 'failed') attention = reg.error ?? 'Registration failed. Contact support.';
      else if (reg && (reg.status === 'pending_payment' || reg.status === 'registering')) attention = reg.status === 'pending_payment' ? 'Payment not completed yet.' : 'Registering the name…';
      else if (state === 'setup' || state === 'bound_only') attention = 'Create the identity for this name.';
      else if (!binding && agent) attention = 'Verify you own this name.';
      else if (state === 'identity_only') attention = 'Connect your agent so it can be reached.';

      return {
        domain,
        sld,
        did,
        name: agent?.agentName ?? sld,
        description: agent?.agentDescription ?? '',
        picture: agent?.hasAvatar ? `${mirror}/avatar.png?v=${encodeURIComponent(agent.profileUpdatedAt?.toISOString() ?? '')}` : null,
        accent: agent?.accent ?? null,
        state,
        ownerLabel: binding?.ownerLabel ?? reg?.ownerLabel ?? null,
        ownerVerified: binding !== null,
        hasIdentity: agent !== null,
        activeConnections: s?.activeConnections ?? 0,
        verifiedLinks: agent ? (linksByDid.get(agent.did) ?? 0) : 0,
        expiryAt: reg?.expiryAt?.toISOString() ?? null,
        registrationStatus: reg?.status ?? null,
        registrationError: reg?.error ?? null,
        keyCustody: agent?.keyCustody ?? null,
        registrar: binding?.registrar ?? null,
        attention,
      };
    }),
  );
  // Online first, then the ones needing attention, then alphabetical.
  identities.sort((x, y) => {
    const rank = (i: DashboardIdentity) => (i.state === 'online' ? 0 : i.attention ? 1 : 2);
    return rank(x) - rank(y) || x.sld.localeCompare(y.sld);
  });

  const totalActiveConnections = identities.reduce((n, i) => n + i.activeConnections, 0);

  // Pairing inbox (migration 0007). Empty lists if the table is behind.
  const myAgentDids = agentRows.map((a) => a.did);
  let outgoingRows: Array<{ id: string; issuerAgentDid: string; audienceDid: string; payload: string; shortToken?: string | null; expiresAt: Date }> = [];
  let incomingRows: typeof outgoingRows = [];
  try {
    outgoingRows = await db
      .select({ id: pairingInvitations.id, issuerAgentDid: pairingInvitations.issuerAgentDid, audienceDid: pairingInvitations.audienceDid, payload: pairingInvitations.payload, shortToken: pairingInvitations.shortToken, expiresAt: pairingInvitations.expiresAt })
      .from(pairingInvitations)
      .where(and(eq(pairingInvitations.tenantId, tenantDb.tenantId), isNull(pairingInvitations.cancelledAt), isNull(pairingInvitations.consumedAt), gt(pairingInvitations.expiresAt, now)))
      .orderBy(asc(pairingInvitations.expiresAt));
    if (myAgentDids.length > 0) {
      incomingRows = await db
        .select({ id: pairingInvitations.id, issuerAgentDid: pairingInvitations.issuerAgentDid, audienceDid: pairingInvitations.audienceDid, payload: pairingInvitations.payload, expiresAt: pairingInvitations.expiresAt })
        .from(pairingInvitations)
        .where(and(inArray(pairingInvitations.audienceDid, myAgentDids), ne(pairingInvitations.tenantId, tenantDb.tenantId), isNull(pairingInvitations.cancelledAt), isNull(pairingInvitations.consumedAt), gt(pairingInvitations.expiresAt, now)))
        .orderBy(asc(pairingInvitations.expiresAt));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[dashboard] pairing-inbox query failed — has migration 0007 run?', err);
  }
  const baseUrl = (process.env['CLOUD_BASE_URL'] ?? '').replace(/\/+$/, '');

  const recentActivity: ActivityEntry[] = recent.map((r) => ({
    id: String(r.id),
    agentDid: r.agentDid,
    msgType: r.reason ?? (r.decision ? `audit:${r.decision}` : 'audit'),
    decision: normalizeDecision(r.decision),
    decisionRaw: r.decision,
    ago: formatAgo(now, r.timestamp),
    auditHref: `/connections/${encodeURIComponent(r.connectionId)}/audit?highlight=${encodeURIComponent(r.msgId)}`,
  }));

  return {
    tenant: { plan: tenant.plan, status: tenant.status },
    identities,
    hasPasskey: passkeys.length > 0,
    // When the other agent is also this account's, the owner can approve here (same signed payload).
    outgoingInvitations: outgoingRows.map((r) => ({ id: r.id, issuerAgentDid: r.issuerAgentDid, audienceDid: r.audienceDid, expiresAt: r.expiresAt.toISOString(), invitationUrl: r.shortToken ? `${baseUrl}/i#${r.shortToken}` : `${baseUrl}/pair/accept#${r.payload}`, approveHref: myAgentDids.includes(r.audienceDid) ? `/pair/accept#${r.payload}` : null })),
    incomingInvitations: incomingRows.map((r) => ({ id: r.id, issuerAgentDid: r.issuerAgentDid, audienceDid: r.audienceDid, expiresAt: r.expiresAt.toISOString(), acceptHref: `/pair/accept#${r.payload}` })),
    recentActivity,
    totalActiveConnections,
    usage: { period, inboundMessages: usageRow?.inboundMessages ?? 0, monthlyBillCents: monthlyBillCents(tenant.plan, tenant.subscriptionQuantity ?? 1) },
  };
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
