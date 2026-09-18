import type * as React from 'react';
import type { Metadata } from 'next';
import { and, desc, eq } from 'drizzle-orm';
import { agentLinks, agents, domainRegistrations, registrarBindings } from '@kybernesis/arp-cloud-db';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { mirrorOriginFor } from '@/lib/key-custody';
import { npubFromHex } from '@/lib/links';
import { BadgeClient, type BadgeData } from './BadgeClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AgentID badge',
  description: 'An interactive identity badge for an agent with a registered .agent name.',
};

const SLD_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Standalone 3D identity badge (AgentID side quest, 2026-09-18). Reachable
 * at agent.arp.run/badge (rewritten to /agentid/badge by the middleware);
 * `?name=<sld>` picks the agent, default samantha. Intended to be lifted onto
 * the lander once the look is right.
 */
export default async function BadgePage(props: { searchParams: Promise<{ name?: string }> }): Promise<React.JSX.Element> {
  const { name } = await props.searchParams;
  const sld = (name ?? 'samantha').toLowerCase().replace(/\.agent$/, '');
  const safe = SLD_REGEX.test(sld) ? sld : 'samantha';
  const domain = `${safe}.agent`;
  const agentDid = `did:web:${domain}`;
  const db = await getDb();
  const [agentRows, bindingRows, regRows, linkRows] = await Promise.all([
    db.select({ agentName: agents.agentName, agentDescription: agents.agentDescription, createdAt: agents.createdAt, runtimeKind: agents.runtimeKind, a2a: agents.wellKnownA2aCard }).from(agents).where(eq(agents.did, agentDid)).limit(1),
    db.select({ ownerLabel: registrarBindings.ownerLabel }).from(registrarBindings).where(eq(registrarBindings.domain, domain)).orderBy(desc(registrarBindings.createdAt)).limit(1),
    db.select({ registeredAt: domainRegistrations.registeredAt }).from(domainRegistrations).where(eq(domainRegistrations.domain, domain)).orderBy(desc(domainRegistrations.createdAt)).limit(1),
    db.select({ kind: agentLinks.kind, value: agentLinks.value }).from(agentLinks).where(and(eq(agentLinks.agentDid, agentDid), eq(agentLinks.status, 'verified'))).orderBy(desc(agentLinks.verifiedAt)),
  ]);
  const agent = agentRows[0];
  const mirror = mirrorOriginFor(domain, env().AGENTID_MIRROR_SUFFIX);
  const since = (regRows[0]?.registeredAt ?? agent?.createdAt ?? new Date()).toISOString().slice(0, 10);
  const data: BadgeData = {
    sld: safe,
    name: agent?.agentName ?? safe,
    description: agent?.agentDescription || 'An AI agent with a registered name.',
    did: agentDid,
    profileUrl: `${env().AGENTID_PROFILE_BASE}/${safe}`,
    mirrorHost: mirror.replace(/^https:\/\//, ''),
    since,
    ownerVerified: bindingRows.length > 0,
    cardSigned: ((agent?.a2a as { signatures?: unknown[] } | null)?.signatures?.length ?? 0) > 0,
    runtime: agent ? agent.runtimeKind !== 'none' : false,
    links: linkRows.map((l) => ({
      kind: l.kind === 'nostr' ? 'BUZZ' : l.kind === 'kybernesis' ? 'CONTROL PLANE' : l.kind === 'runtime' ? 'RUNTIME' : 'WEB',
      value: l.kind === 'nostr' ? npubFromHex(l.value).slice(0, 16) + '…' : l.value.replace(/^https:\/\//, ''),
    })),
  };
  return <BadgeClient data={data} />;
}
