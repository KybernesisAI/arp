import type * as React from 'react';
import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { agentLinks, agents, domainRegistrations, registrarBindings } from '@kybernesis/arp-cloud-db';
import { and } from 'drizzle-orm';
import { npubFromHex } from '@/lib/links';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { mirrorOriginFor } from '@/lib/key-custody';
import { Badge, ButtonLink, Container, Dot, Emphasis, Grid12, PlateHead, Section } from '@/components/ui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLD_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const ACTIVE_MS = 5 * 60 * 1000;

/**
 * Public identity profile (AgentID S2 / T8): `agent.arp.run/<sld>`.
 *
 * Tier-0 surface: what the agent is, who stands behind it, whether it is
 * online, and how to reach it. Reads across tenants by name (identity is
 * public by definition). No auth, no supplier or key vocabulary.
 */
export default async function AgentProfilePage(props: {
  params: Promise<{ sld: string }>;
}): Promise<React.JSX.Element> {
  const { sld: raw } = await props.params;
  const sld = decodeURIComponent(raw).toLowerCase().replace(/\.agent$/, '');
  if (!SLD_REGEX.test(sld)) notFound();
  const domain = `${sld}.agent`;
  const agentDid = `did:web:${domain}`;

  const db = await getDb();
  const [agentRows, bindingRows, regRows, linkRows] = await Promise.all([
    db.select().from(agents).where(eq(agents.did, agentDid)).limit(1),
    db
      .select({ ownerLabel: registrarBindings.ownerLabel, createdAt: registrarBindings.createdAt })
      .from(registrarBindings)
      .where(eq(registrarBindings.domain, domain))
      .orderBy(desc(registrarBindings.createdAt))
      .limit(1),
    db
      .select({ status: domainRegistrations.status, registeredAt: domainRegistrations.registeredAt })
      .from(domainRegistrations)
      .where(eq(domainRegistrations.domain, domain))
      .orderBy(desc(domainRegistrations.createdAt))
      .limit(1),
    db
      .select({ kind: agentLinks.kind, value: agentLinks.value, label: agentLinks.label })
      .from(agentLinks)
      .where(and(eq(agentLinks.agentDid, agentDid), eq(agentLinks.status, 'verified')))
      .orderBy(desc(agentLinks.verifiedAt)),
  ]);
  const agent = agentRows[0];
  if (!agent) notFound();

  const owner = bindingRows[0] ?? null;
  const registration = regRows[0] ?? null;
  const now = Date.now();
  const online = agent.lastSeenAt ? now - agent.lastSeenAt.getTime() <= ACTIVE_MS : false;
  const hasRuntime = agent.runtimeKind !== 'none';
  const mirror = mirrorOriginFor(domain, env().AGENTID_MIRROR_SUFFIX);
  const since = (registration?.registeredAt ?? agent.createdAt).toISOString().slice(0, 10);

  const links: Array<{ kind: string; value: string; state: 'verified' | 'pending' }> = [
    {
      kind: 'OWNER',
      value: owner ? owner.ownerLabel : 'not yet verified',
      state: owner ? 'verified' : 'pending',
    },
    {
      kind: 'RUNTIME',
      value: hasRuntime ? (agent.runtimeKind === 'bridge' ? 'self-hosted' : 'hosted') : 'not attached',
      state: hasRuntime ? 'verified' : 'pending',
    },
    { kind: 'ADDRESS', value: mirror.replace(/^https:\/\//, ''), state: 'verified' },
    ...linkRows.map((l) => ({
      kind: l.kind === 'nostr' ? 'BUZZ' : l.kind === 'kybernesis' ? 'CONTROL PLANE' : l.kind === 'runtime' ? 'RUNTIME' : 'WEBSITE',
      value: l.kind === 'nostr' ? npubFromHex(l.value) : l.value.replace(/^https:\/\//, ''),
      state: 'verified' as const,
    })),
  ];

  return (
    <>
      <Section tone="paper" spacing="hero" rule={false} as="header">
        <Container>
          <div className="grid grid-cols-12 gap-6 pb-12">
            <div className="col-span-12 lg:col-span-7">
              <div className="font-mono text-kicker uppercase text-muted mb-5 flex items-center gap-3">
                <Dot tone={online ? 'green' : hasRuntime ? 'yellow' : 'red'} size={6} />
                {online ? 'ONLINE' : hasRuntime ? 'OFFLINE' : 'IDENTITY ONLY'} · SINCE {since}
              </div>
              <h1 className="font-display font-medium text-[clamp(44px,7vw,104px)] leading-[0.95] tracking-[-0.03em] m-0">
                {sld}
                <span className="text-signal-blue">.agent</span>
              </h1>
              <p className="mt-6 text-body-lg text-ink-2 max-w-[56ch]">
                {agent.agentDescription || `${agent.agentName} is an AI agent with a registered name.`}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink
                  href={`https://cloud.arp.run/pair?peer=${encodeURIComponent(agentDid)}`}
                  variant="primary"
                  size="lg"
                  arrow="up-right"
                >
                  Request to connect
                </ButtonLink>
                <ButtonLink href="/" variant="default" size="lg" arrow>
                  Get your own name
                </ButtonLink>
              </div>
            </div>
            <div className="col-span-12 lg:col-span-5">
              <div className="bg-paper-2 border border-rule">
                <div className="flex justify-between items-center px-3.5 py-2.5 border-b border-rule bg-paper font-mono text-kicker uppercase text-muted">
                  <span>
                    <b className="text-ink font-medium">RECORD</b> · {agent.agentName}
                  </span>
                  <Badge tone={owner ? 'blue' : 'yellow'} className="text-[9px] px-2 py-0.5">
                    {owner ? 'VERIFIED OWNER' : 'OWNER PENDING'}
                  </Badge>
                </div>
                <ul className="list-none p-0 m-0">
                  {links.map((l, i) => (
                    <li
                      key={l.kind}
                      className={`grid grid-cols-[110px_1fr_auto] gap-3 items-center px-5 py-3 ${
                        i < links.length - 1 ? 'border-b border-rule' : ''
                      }`}
                    >
                      <span className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-muted">{l.kind}</span>
                      <span className="font-mono text-[12px] text-ink truncate">{l.value}</span>
                      <span
                        className={`font-mono text-[10px] tracking-[0.14em] uppercase px-1.5 py-0.5 border ${
                          l.state === 'verified' ? 'border-signal-blue text-signal-blue' : 'border-rule text-muted'
                        }`}
                      >
                        {l.state === 'verified' ? '✓ verified' : 'pending'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <Section id="developers" spacing="tight">
        <Container>
          <PlateHead
            plateNum="P.01"
            kicker="// FOR_DEVELOPERS"
            title={
              <>
                Reach this agent <Emphasis tone="blue">by name.</Emphasis>
              </>
            }
          />
          <Grid12 className="gap-4">
            <div className="col-span-12 md:col-span-7">
              <ul className="list-none p-0 m-0 font-mono text-[12px]">
                {[
                  ['Identity document', `${mirror}/.well-known/did.json`],
                  ['Agent card', `${mirror}/.well-known/agent-card.json`],
                  ['Owner proof', `${mirror}/representation.jwt`],
                ].map(([label, url]) => (
                  <li key={label} className="grid grid-cols-[140px_1fr] gap-3 py-3 border-t border-rule last:border-b">
                    <span className="text-kicker uppercase text-muted">{label}</span>
                    <a href={url} className="text-ink break-all underline decoration-rule hover:decoration-ink">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <p className="col-span-12 md:col-span-5 text-body-sm text-ink-2">
              Standard identity and agent-card documents, signed by the name&apos;s own key. Any agent
              framework that reads agent cards can address this name with no custom integration.
            </p>
          </Grid12>
        </Container>
      </Section>
    </>
  );
}
