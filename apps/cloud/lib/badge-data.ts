/**
 * Data behind the 3D identity badge (AgentID). One loader so the standalone
 * /badge page, the lander hero and, later, every agent page render the same
 * badge from the same facts.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { agentLinks, agents, domainRegistrations, registrarBindings } from '@kybernesis/arp-cloud-db';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { mirrorOriginFor } from '@/lib/key-custody';
import { npubFromHex } from '@/lib/links';

export interface BadgeData {
  sld: string;
  name: string;
  description: string;
  did: string;
  profileUrl: string;
  connectUrl: string;
  mirrorHost: string;
  a2aEndpoint: string;
  since: string;
  ownerVerified: boolean;
  ownerLabel: string | null;
  cardSigned: boolean;
  selfHeldKey: boolean;
  runtime: boolean;
  avatarUrl: string;
  /** Owner-chosen accent (hex) from the identity profile, or null. */
  accent: string | null;
  links: Array<{ kind: string; value: string }>;
}

const SLD_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
/** Portraits checked in under public/assets/badge/avatars/<sld>.png (public/ is CDN-served, not bundled). */
const LOCAL_AVATARS = new Set(['samantha', 'kyber', 'sid']);

export function normalizeBadgeSld(input: string | undefined, fallback = 'samantha'): string {
  const sld = (input ?? fallback).toLowerCase().replace(/\.agent$/, '');
  return SLD_REGEX.test(sld) ? sld : fallback;
}

export async function loadBadgeData(sldInput: string, opts: { avatar?: string } = {}): Promise<BadgeData> {
  const sld = normalizeBadgeSld(sldInput);
  const domain = `${sld}.agent`;
  const agentDid = `did:web:${domain}`;
  const db = await getDb();
  const [agentRows, bindingRows, regRows, linkRows] = await Promise.all([
    db.select({ agentName: agents.agentName, agentDescription: agents.agentDescription, createdAt: agents.createdAt, runtimeKind: agents.runtimeKind, keyCustody: agents.keyCustody, a2a: agents.wellKnownA2aCard, hasAvatar: sql<boolean>`${agents.avatarData} is not null`, accent: agents.accent, profileUpdatedAt: agents.profileUpdatedAt }).from(agents).where(eq(agents.did, agentDid)).limit(1),
    db.select({ ownerLabel: registrarBindings.ownerLabel }).from(registrarBindings).where(eq(registrarBindings.domain, domain)).orderBy(desc(registrarBindings.createdAt)).limit(1),
    db.select({ registeredAt: domainRegistrations.registeredAt }).from(domainRegistrations).where(eq(domainRegistrations.domain, domain)).orderBy(desc(domainRegistrations.createdAt)).limit(1),
    db.select({ kind: agentLinks.kind, value: agentLinks.value }).from(agentLinks).where(and(eq(agentLinks.agentDid, agentDid), eq(agentLinks.status, 'verified'))).orderBy(desc(agentLinks.verifiedAt)),
  ]);
  const agent = agentRows[0];
  const mirror = mirrorOriginFor(domain, env().AGENTID_MIRROR_SUFFIX);
  const since = (regRows[0]?.registeredAt ?? agent?.createdAt ?? new Date()).toISOString().slice(0, 10);
  const localAvatar = LOCAL_AVATARS.has(sld) ? `/assets/badge/avatars/${sld}.png` : null;
  // Precedence: an explicit override → the identity's own picture (S6c) → a checked-in portrait → a generated placeholder.
  const identityAvatar = agent?.hasAvatar ? `${mirror}/avatar.png?v=${encodeURIComponent(agent.profileUpdatedAt?.toISOString() ?? '')}` : null;
  const avatarUrl = opts.avatar && /^https:\/\/[^\s]+$/i.test(opts.avatar) ? opts.avatar : identityAvatar ?? localAvatar ?? `https://api.dicebear.com/9.x/notionists/png?seed=${encodeURIComponent(sld)}&size=512&backgroundColor=1c1c22`;
  return {
    sld,
    name: agent?.agentName ?? sld,
    description: agent?.agentDescription || 'An AI agent with a registered name.',
    did: agentDid,
    profileUrl: `${env().AGENTID_PROFILE_BASE}/${sld}`,
    connectUrl: `https://cloud.arp.run/pair?peer=${encodeURIComponent(agentDid)}`,
    mirrorHost: mirror.replace(/^https:\/\//, ''),
    a2aEndpoint: `${mirror}/a2a`,
    since,
    ownerVerified: bindingRows.length > 0,
    ownerLabel: bindingRows[0]?.ownerLabel ?? null,
    cardSigned: ((agent?.a2a as { signatures?: unknown[] } | null)?.signatures?.length ?? 0) > 0,
    selfHeldKey: agent?.keyCustody === 'exported',
    runtime: agent ? agent.runtimeKind !== 'none' : false,
    avatarUrl,
    accent: agent?.accent ?? null,
    links: linkRows.map((l) => ({
      kind: l.kind === 'nostr' ? 'Buzz' : l.kind === 'kybernesis' ? 'Control plane' : l.kind === 'runtime' ? 'Runtime' : 'Web',
      value: l.kind === 'nostr' ? npubFromHex(l.value).slice(0, 20) + '…' : l.value.replace(/^https:\/\//, ''),
    })),
  };
}
