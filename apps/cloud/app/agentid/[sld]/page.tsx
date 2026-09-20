import type * as React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { agents } from '@kybernesis/arp-cloud-db';
import { getDb } from '@/lib/db';
import { loadBadgeData, normalizeBadgeSld } from '@/lib/badge-data';
import { BadgeHero } from '@/app/lander/BadgeHero';
import { CLAIM, Card, HeroPill, Kicker, LanderFooter, LanderNav, LanderShell, StateChip, Tag } from '@/app/lander/ui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLD_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const ACTIVE_MS = 5 * 60 * 1000;

export async function generateMetadata(props: { params: Promise<{ sld: string }> }): Promise<Metadata> {
  const { sld: raw } = await props.params;
  const sld = normalizeBadgeSld(decodeURIComponent(raw), '');
  if (!sld) return { title: 'AgentID' };
  return {
    title: `${sld}.agent — AgentID`,
    description: `${sld}.agent is a registered agent identity. See who stands behind it, whether it is online, and how to reach it.`,
  };
}

/**
 * Public identity profile: `agent.arp.run/<sld>`.
 *
 * Same visual language as the lander: black hero with the agent's 3D badge,
 * then black-on-white bento tiles. Reads across tenants by name (identity is
 * public by definition). No auth, no supplier or key vocabulary.
 */
export default async function AgentProfilePage(props: { params: Promise<{ sld: string }> }): Promise<React.JSX.Element> {
  const { sld: raw } = await props.params;
  const sld = decodeURIComponent(raw).toLowerCase().replace(/\.agent$/, '');
  if (!SLD_REGEX.test(sld)) notFound();
  const domain = `${sld}.agent`;
  const agentDid = `did:web:${domain}`;

  const db = await getDb();
  const [badge, agentRows] = await Promise.all([
    loadBadgeData(sld),
    db.select({ lastSeenAt: agents.lastSeenAt, runtimeKind: agents.runtimeKind, createdAt: agents.createdAt }).from(agents).where(eq(agents.did, agentDid)).limit(1),
  ]);
  const agent = agentRows[0];
  if (!agent) notFound();

  const online = agent.lastSeenAt ? Date.now() - agent.lastSeenAt.getTime() <= ACTIVE_MS : false;
  const hasRuntime = agent.runtimeKind !== 'none';
  const runtimeLabel = !hasRuntime ? 'Not attached' : agent.runtimeKind === 'bridge' ? 'Self-hosted' : 'Hosted';
  const statusLabel = online ? 'Online' : hasRuntime ? 'Offline' : 'Identity only';
  const mirror = `https://${badge.mirrorHost}`;
  const connect = badge.connectUrl;

  const records: Array<{ kind: string; name: string; value: string; href?: string; state: 'verified' | 'live' | 'pending' }> = [
    { kind: 'Identity', name: 'Identity document', value: `${badge.mirrorHost}/.well-known/did.json`, href: `${mirror}/.well-known/did.json`, state: 'live' },
    { kind: 'Card', name: 'Agent card (A2A)', value: `${badge.mirrorHost}/.well-known/agent-card.json`, href: `${mirror}/.well-known/agent-card.json`, state: badge.cardSigned ? 'verified' : 'live' },
    { kind: 'A2A', name: 'A2A endpoint', value: `${badge.mirrorHost}/a2a`, href: `${mirror}/.well-known/agent-card.json`, state: 'live' },
    { kind: 'Keys', name: 'Public key set', value: `${badge.mirrorHost}/.well-known/jwks.json`, href: `${mirror}/.well-known/jwks.json`, state: 'live' },
    { kind: 'Connect', name: 'Connect record', value: `${badge.mirrorHost}/.well-known/arp-card.json`, href: `${mirror}/.well-known/arp-card.json`, state: 'live' },
    { kind: 'Owner', name: 'Owner proof', value: badge.ownerVerified ? `${badge.mirrorHost}/representation.jwt` : 'not yet verified', href: badge.ownerVerified ? `${mirror}/representation.jwt` : undefined, state: badge.ownerVerified ? 'verified' : 'pending' },
  ];

  return (
    <LanderShell>
      <LanderNav />

      <BadgeHero badge={badge} zoom={1.6} minHeight="lg:h-[680px]">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 font-mono text-[12px] uppercase tracking-[0.14em] text-white/60">
          <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-400' : hasRuntime ? 'bg-amber-400' : 'bg-white/40'}`} /> {statusLabel} · since {badge.since}
        </div>
        <h1 className="break-words text-[44px] font-medium leading-[1.02] tracking-[-0.03em] sm:text-[60px] lg:text-[68px]">
          {sld}<span className="text-white/45">.agent</span>
        </h1>
        <p className="mt-6 max-w-[48ch] text-[18px] leading-relaxed text-white/65">{badge.description}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={connect} className="rounded-full bg-white px-6 py-3 text-[15px] font-medium text-black hover:bg-zinc-200">Request to connect</a>
          <a href={CLAIM} className="rounded-full border border-white/25 px-6 py-3 text-[15px] font-medium text-white hover:border-white">Get your own name</a>
        </div>
        <div className="mt-8 flex flex-wrap gap-2">
          <HeroPill on={badge.ownerVerified}>{badge.ownerVerified ? 'Verified owner' : 'Owner pending'}</HeroPill>
          <HeroPill on={hasRuntime}>{hasRuntime ? 'Reachable' : 'Not yet reachable'}</HeroPill>
          <HeroPill on={badge.cardSigned}>{badge.cardSigned ? 'Signed card' : 'Card unsigned'}</HeroPill>
        </div>
      </BadgeHero>

      {/* IDENTITY RECORD */}
      <section className="mx-auto w-full max-w-[1200px] px-6 py-20">
        <Kicker>Identity record</Kicker>
        <h2 className="mt-3 max-w-[22ch] text-[34px] font-medium leading-[1.05] tracking-[-0.025em] sm:text-[44px]">Who stands behind {sld}.agent.</h2>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card glow="emerald">
            <Kicker>Owner</Kicker>
            <div className="mt-3 flex items-center gap-2 text-[22px] font-medium tracking-[-0.02em]">
              {badge.ownerVerified ? badge.ownerLabel : 'Pending'}
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">{badge.ownerVerified ? 'Ownership proven from both sides and published with the name.' : 'The owner has not finished verification yet.'}</p>
            <div className="mt-5"><StateChip state={badge.ownerVerified ? 'verified' : 'pending'} /></div>
          </Card>
          <Card glow="cyan">
            <Kicker>Status</Kicker>
            <div className="mt-3 flex items-center gap-2.5 text-[22px] font-medium tracking-[-0.02em]">
              <span className="relative flex h-2.5 w-2.5">
                {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-500' : hasRuntime ? 'bg-amber-400' : 'bg-zinc-300'}`} />
              </span>
              {statusLabel}
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">{hasRuntime ? `${runtimeLabel} runtime. Messages sent to this name are delivered to the agent.` : 'A registered identity with no agent attached yet.'}</p>
            <div className="mt-5"><StateChip state={hasRuntime ? 'live' : 'pending'} /></div>
          </Card>
          <Card>
            <Kicker>Address</Kicker>
            <div className="mt-3 break-all font-mono text-[15px] text-zinc-900">{badge.mirrorHost}</div>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">Where this name resolves. Works in every browser and every agent client.</p>
            <div className="mt-5"><StateChip state="live" /></div>
          </Card>
          <Card>
            <Kicker>Registered</Kicker>
            <div className="mt-3 font-mono text-[15px] text-zinc-900">{badge.since}</div>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">{badge.selfHeldKey ? 'The owner holds the key for this name themselves.' : 'The key for this name is held for hosted delivery and exportable any time.'}</p>
            <div className="mt-5"><Tag tone="emerald">Permanent name</Tag></div>
          </Card>
        </div>
      </section>

      {/* VERIFIED LINKS */}
      <section className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-20">
          <Kicker>Verified links</Kicker>
          <h2 className="mt-3 max-w-[22ch] text-[34px] font-medium leading-[1.05] tracking-[-0.025em] sm:text-[44px]">Proof, not claims.</h2>
          <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-zinc-600">Each link below was confirmed from both sides before it appeared here. A checkmark means the other end agreed.</p>
          {badge.links.length > 0 ? (
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {badge.links.map((l) => (
                <Card key={`${l.kind}:${l.value}`} glow="emerald">
                  <Kicker>{l.kind}</Kicker>
                  <div className="mt-3 break-all font-mono text-[14px] text-zinc-900">{l.value}</div>
                  <div className="mt-5"><StateChip state="verified" /></div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="mt-10">
              <p className="m-0 text-[15px] text-zinc-600">No links have been verified for this name yet.</p>
            </Card>
          )}
        </div>
      </section>

      {/* REACH BY NAME */}
      <section className="mx-auto w-full max-w-[1200px] px-6 py-20">
        <Kicker>For developers</Kicker>
        <h2 className="mt-3 max-w-[22ch] text-[34px] font-medium leading-[1.05] tracking-[-0.025em] sm:text-[44px]">Reach this agent by name.</h2>
        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" glow="cyan">
            <ul className="m-0 list-none divide-y divide-zinc-200 p-0">
              {records.map((r) => (
                <li key={r.kind} className="grid grid-cols-12 items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="col-span-4 md:col-span-3 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">{r.kind}</div>
                  <div className="col-span-8 md:col-span-3 text-[14px] text-zinc-800">{r.name}</div>
                  <div className="col-span-9 md:col-span-5 break-all font-mono text-[12px] text-zinc-700">
                    {r.href ? <a href={r.href} className="underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900">{r.value}</a> : r.value}
                  </div>
                  <div className="col-span-3 md:col-span-1 text-right"><StateChip state={r.state} /></div>
                </li>
              ))}
            </ul>
          </Card>
          <div className="relative overflow-hidden rounded-3xl bg-black p-6 text-white">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="relative flex h-full flex-col">
              <Tag tone="dark">Standard A2A</Tag>
              <h3 className="mt-5 text-[24px] font-medium tracking-[-0.02em]">{badge.cardSigned ? 'Card signed by this name.' : 'A card any agent can read.'}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-white/65">
                {badge.cardSigned
                  ? 'The agent card is signed with the name’s own key and verifiable against its published key set. Any framework that reads agent cards can address this name with no custom integration.'
                  : 'A standard agent card lives at this name. Any framework that reads agent cards can address it at the A2A endpoint with no custom integration.'}
              </p>
              <div className="mt-auto pt-8">
                <a href={connect} className="inline-block rounded-full bg-white px-5 py-2.5 text-[14px] font-medium text-black hover:bg-zinc-200">Request to connect</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-black text-white">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative mx-auto w-full max-w-[1200px] px-6 py-20">
          <Kicker>Your turn</Kicker>
          <h2 className="mt-3 max-w-[20ch] text-[40px] font-medium leading-[1.05] tracking-[-0.03em] sm:text-[56px]">Give your agent a name like this.</h2>
          <p className="mt-5 max-w-[50ch] text-[17px] text-white/65">One permanent name, a page like this one, verified links, and an address other agents can trust.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={CLAIM} className="rounded-full bg-white px-6 py-3 text-[15px] font-medium text-black hover:bg-zinc-200">Claim a name</a>
            <a href="/lander" className="rounded-full border border-white/25 px-6 py-3 text-[15px] font-medium text-white hover:border-white">How it works</a>
          </div>
        </div>
      </section>

      <LanderFooter />
    </LanderShell>
  );
}
