import type * as React from 'react';
import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { registrarBindings } from '@kybernesis/arp-cloud-db';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { env } from '@/lib/env';
import { mirrorOriginFor } from '@/lib/key-custody';
import { AppShell } from '@/components/app/AppShell';
import { Badge, Card, Code, Dot, Link, PlateHead, Pre } from '@/components/ui';
import { FinishSetupButton } from '@/app/dashboard/FinishSetupButton';
import { ExportKeyButton } from '@/app/dashboard/ExportKeyButton';
import { LinksPanel } from '@/app/names/LinksPanel';
import { AttachRuntimePanel } from '@/app/names/AttachRuntimePanel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLD_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Per-name records page (AgentID S2 / T13): `/names/<sld>` in the console.
 *
 * Everything the owner needs to know about one name in one place: lifecycle
 * + expiry, owner verification, the resolvable records (identity document,
 * agent card, owner proof, address, connect URL), runtime + key custody, and
 * the raw documents. Customer vocabulary only.
 */
export default async function NameRecordsPage(props: {
  params: Promise<{ sld: string }>;
}): Promise<React.JSX.Element> {
  const { sld: raw } = await props.params;
  const sld = decodeURIComponent(raw).toLowerCase().replace(/\.agent$/, '');
  let state: Awaited<ReturnType<typeof loadState>>;
  try {
    state = await loadState(sld);
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  if (!state) {
    return (
      <AppShell>
        <PlateHead plateNum="N.00" kicker="// NAME · NOT FOUND" title="Name not found." />
        <p className="text-body text-ink-2">
          <Link href="/dashboard">← Back to dashboard</Link>
        </p>
      </AppShell>
    );
  }
  const { domain, registration, agent, owner, mirror, tenantId } = state;
  const status = registration?.status ?? (agent ? 'active' : 'unknown');
  const needsOwner = !owner && (status === 'registered' || status === 'owner_pending' || (agent !== null && !registration));
  const badgeTone = status === 'active' ? 'blue' : status === 'failed' || status === 'expired' ? 'red' : 'yellow';

  const records: Array<{ kind: string; name: string; value: string; href?: string; state: 'live' | 'pending' }> = [
    { kind: 'ADDRESS', name: 'Reachable at', value: mirror.replace(/^https:\/\//, ''), href: mirror, state: agent ? 'live' : 'pending' },
    { kind: 'IDENTITY', name: 'Identity document', value: `${mirror}/.well-known/did.json`, href: `${mirror}/.well-known/did.json`, state: agent ? 'live' : 'pending' },
    { kind: 'CARD', name: 'Agent card', value: `${mirror}/.well-known/agent-card.json`, href: `${mirror}/.well-known/agent-card.json`, state: agent ? 'live' : 'pending' },
    { kind: 'OWNER', name: 'Owner proof', value: owner ? `${mirror}/representation.jwt` : 'not yet verified', href: owner ? `${mirror}/representation.jwt` : undefined, state: owner ? 'live' : 'pending' },
    { kind: 'PROFILE', name: 'Public profile', value: `${env().AGENTID_PROFILE_BASE}/${sld}`, href: `${env().AGENTID_PROFILE_BASE}/${sld}`, state: agent ? 'live' : 'pending' },
    { kind: 'CONNECT', name: 'Connect link', value: `https://cloud.arp.run/pair?peer=did:web:${domain}`, href: `https://cloud.arp.run/pair?peer=did:web:${domain}`, state: agent ? 'live' : 'pending' },
  ];

  return (
    <AppShell>
      <div className="mb-6 font-mono text-kicker uppercase text-muted">
        <Link href="/dashboard" variant="mono">
          ← DASHBOARD
        </Link>
      </div>
      <PlateHead plateNum="N.00" kicker={`// NAME · ${status.toUpperCase().replace('_', ' ')}`} title={domain} />

      <section className="mb-10">
        <Card tone="paper-2" padded={false} className="border border-rule">
          <div className="grid grid-cols-12 gap-4 p-5 items-center">
            <div className="col-span-12 md:col-span-3">
              <div className="font-mono text-kicker uppercase text-muted mb-1">STATUS</div>
              <Badge tone={badgeTone} className="text-[9px] px-2 py-0.5">{status.toUpperCase().replace('_', ' ')}</Badge>
            </div>
            <div className="col-span-6 md:col-span-3">
              <div className="font-mono text-kicker uppercase text-muted mb-1">EXPIRES</div>
              <span className="font-mono text-[12px]">{registration?.expiryAt ? registration.expiryAt.toISOString().slice(0, 10) : '—'}</span>
            </div>
            <div className="col-span-6 md:col-span-3">
              <div className="font-mono text-kicker uppercase text-muted mb-1">OWNER</div>
              <span className="font-mono text-[12px] inline-flex items-center gap-2">
                <Dot tone={owner ? 'green' : 'yellow'} /> {owner ? owner.ownerLabel : 'not verified'}
              </span>
            </div>
            <div className="col-span-12 md:col-span-3 flex justify-end gap-2">
              {needsOwner && <FinishSetupButton domain={domain} tenantId={tenantId} />}
              {agent && agent.keyCustody === 'cloud' && <ExportKeyButton agentDid={agent.did} domain={domain} />}
            </div>
            {registration?.error && <p className="col-span-12 text-body-sm text-signal-red m-0">{registration.error}</p>}
          </div>
        </Card>
      </section>

      <section className="mb-10">
        <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
          <h2 className="font-display font-medium text-h3">Records</h2>
          <span className="font-mono text-kicker uppercase text-muted">// R · WHAT THIS NAME RESOLVES TO</span>
        </header>
        <Card tone="paper-2" padded={false} className="border border-rule">
          <ul className="list-none p-0 m-0">
            {records.map((r, i) => (
              <li key={r.kind} className={'grid grid-cols-12 gap-3 px-5 py-3 items-center ' + (i < records.length - 1 ? 'border-b border-rule' : '')}>
                <div className="col-span-4 md:col-span-2 font-mono text-[10.5px] tracking-[0.12em] uppercase text-muted">{r.kind}</div>
                <div className="col-span-8 md:col-span-3 text-body-sm">{r.name}</div>
                <div className="col-span-10 md:col-span-6 font-mono text-[12px] break-all">
                  {r.href ? <a href={r.href} className="underline decoration-rule hover:decoration-ink">{r.value}</a> : r.value}
                </div>
                <div className="col-span-2 md:col-span-1 text-right">
                  <span className={`font-mono text-[10px] tracking-[0.14em] uppercase px-1.5 py-0.5 border ${r.state === 'live' ? 'border-signal-blue text-signal-blue' : 'border-rule text-muted'}`}>
                    {r.state}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {agent && (
        <section className="mb-10">
          <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
            <h2 className="font-display font-medium text-h3">Identities</h2>
            <span className="font-mono text-kicker uppercase text-muted">// I · LINKED &amp; VERIFIED</span>
          </header>
          <Card tone="paper-2" padded={false} className="border border-rule">
            <LinksPanel sld={domain.replace(/\.agent$/, '')} agentDid={agent.did} />
          </Card>
        </section>
      )}

      {agent && agent.keyCustody === 'cloud' && (
        <section className="mb-10">
          <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
            <h2 className="font-display font-medium text-h3">Runtime</h2>
            <span className="font-mono text-kicker uppercase text-muted">// R · WHERE MESSAGES ARE DELIVERED</span>
          </header>
          <Card tone="paper-2" padded={false} className="border border-rule">
            <AttachRuntimePanel agentDid={agent.did} attached={agent.runtimeKind === 'push'} pushKind={agent.pushKind} pushUrl={agent.pushUrl} />
          </Card>
        </section>
      )}

      <section className="mb-10">
        <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
          <h2 className="font-display font-medium text-h3">Agent</h2>
          <span className="font-mono text-kicker uppercase text-muted">// A · RUNTIME &amp; KEY</span>
        </header>
        {agent ? (
          <Card tone="paper-2" padded className="border border-rule">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-4">
                <div className="font-mono text-kicker uppercase text-muted mb-1">NAME</div>
                <span className="font-display font-medium text-h5">{agent.agentName}</span>
              </div>
              <div className="col-span-6 md:col-span-4">
                <div className="font-mono text-kicker uppercase text-muted mb-1">RUNTIME</div>
                <span className="font-mono text-[12px] inline-flex items-center gap-2">
                  <Dot tone={agent.runtimeKind === 'none' ? 'yellow' : agent.online ? 'green' : 'red'} />
                  {agent.runtimeKind === 'none' ? 'not attached' : agent.runtimeKind === 'bridge' ? (agent.online ? 'self-hosted · online' : 'self-hosted · offline') : 'hosted'}
                </span>
              </div>
              <div className="col-span-6 md:col-span-4">
                <div className="font-mono text-kicker uppercase text-muted mb-1">KEY</div>
                <span className="font-mono text-[12px]">{agent.keyCustody === 'cloud' ? 'held for you (exportable)' : 'exported to you'}</span>
              </div>
              <div className="col-span-12">
                <div className="font-mono text-kicker uppercase text-muted mb-1">ID</div>
                <Code className="break-all">{agent.did}</Code>
              </div>
              <div className="col-span-12 md:col-span-6">
                <div className="font-mono text-kicker uppercase text-muted mb-1">IDENTITY DOCUMENT</div>
                <Pre className="max-h-72 overflow-auto text-[11px]">{JSON.stringify(agent.wellKnownDid, null, 2)}</Pre>
              </div>
              <div className="col-span-12 md:col-span-6">
                <div className="font-mono text-kicker uppercase text-muted mb-1">AGENT CARD</div>
                <Pre className="max-h-72 overflow-auto text-[11px]">{JSON.stringify(agent.wellKnownAgentCard, null, 2)}</Pre>
              </div>
            </div>
          </Card>
        ) : (
          <Card tone="paper-2" padded>
            <p className="text-body text-ink-2 m-0">
              {status === 'pending_payment' || status === 'registering'
                ? 'Your identity is created as soon as payment completes.'
                : 'No identity has been created for this name yet.'}
            </p>
          </Card>
        )}
      </section>
    </AppShell>
  );
}

async function loadState(sld: string) {
  const { tenantDb } = await requireTenantDb();
  if (!SLD_REGEX.test(sld)) return null;
  const domain = `${sld}.agent`;
  const agentDid = `did:web:${domain}`;
  const [registration, agentRow, ownerRows] = await Promise.all([
    tenantDb.getRegistrationByDomain(domain),
    tenantDb.getAgent(agentDid),
    tenantDb.raw
      .select({ ownerLabel: registrarBindings.ownerLabel })
      .from(registrarBindings)
      .where(and(eq(registrarBindings.domain, domain), eq(registrarBindings.tenantId, tenantDb.tenantId)))
      .orderBy(desc(registrarBindings.createdAt))
      .limit(1),
  ]);
  if (!registration && !agentRow) return null;
  const now = Date.now();
  return {
    domain,
    tenantId: tenantDb.tenantId,
    mirror: mirrorOriginFor(domain, env().AGENTID_MIRROR_SUFFIX),
    registration,
    owner: ownerRows[0] ?? null,
    agent: agentRow
      ? {
          did: agentRow.did,
          agentName: agentRow.agentName,
          keyCustody: agentRow.keyCustody,
          runtimeKind: agentRow.runtimeKind,
          pushKind: agentRow.pushKind,
          pushUrl: agentRow.pushUrl,
          online: agentRow.lastSeenAt ? now - agentRow.lastSeenAt.getTime() <= 5 * 60 * 1000 : false,
          wellKnownDid: agentRow.wellKnownDid,
          wellKnownAgentCard: agentRow.wellKnownAgentCard,
        }
      : null,
  };
}
