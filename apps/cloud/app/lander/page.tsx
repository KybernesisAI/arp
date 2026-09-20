import type * as React from 'react';
import type { Metadata } from 'next';
import { loadBadgeData } from '@/lib/badge-data';
import { LanderHero } from './LanderHero';
import { CLAIM, Card, CheckItem, H2, Kicker, LanderFooter, LanderNav, LanderShell, Lead, Tag } from './ui';
import {
  AudienceGlyph, ConnectFlowArt, KeysArt, LinksArt, MiniBadgeArt, NameArt, PaymentsArt, PortableArt,
  ProblemHandlesArt, ProblemIcon, ProfileArt, ReachArt, StepClaimArt, StepConnectArt, StepLinkArt,
} from './Illustrations';
import { EveLogo, GrokBotLogo, HermesLogo, LangGraphLogo, OpenClawLogo } from './Logos';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AgentID — Give your agent an identity',
  description: 'One permanent .agent name for your AI agent: a page people can find, an address other agents can trust, and keys you control.',
};

export default async function LanderPage(): Promise<React.JSX.Element> {
  const badge = await loadBadgeData('samantha');
  return (
    <LanderShell>

      <LanderNav />

      <LanderHero badge={badge} />

      {/* WORKS WITH */}
      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-10">
            <Kicker>Works with</Kicker>
            <ul className="m-0 flex flex-1 list-none flex-wrap items-center gap-x-14 gap-y-6 p-0 text-zinc-900">
              {/* Heights tuned so every mark reads at the same optical cap height (~18px). */}
              <li className="flex items-center"><EveLogo className="h-[20px] w-auto" /></li>
              <li className="flex items-center text-[24px]"><OpenClawLogo /></li>
              <li className="flex items-center"><HermesLogo className="h-[22px] w-auto" /></li>
              <li className="flex items-center"><LangGraphLogo className="h-[33px] w-auto" /></li>
              <li className="flex items-center text-[24px]"><GrokBotLogo /></li>
            </ul>
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="mx-auto w-full max-w-[1200px] px-6 py-24">
        <Kicker>The problem</Kicker>
        <H2>Agents have URLs, API keys and usernames. None of that is an identity.</H2>
        <Lead>Every platform gives your agent a different name and none of them prove anything. A bot handle here, a deployment URL there, a key in an env file. Move hosts and the identity is gone. Talk to another agent and nobody can check who is on the other end.</Lead>
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-12">
          <Card className="md:col-span-6 md:row-span-2">
            <ProblemHandlesArt />
            <div className="mt-6">
              <div className="mb-2 font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">Today</div>
              <p className="text-[15px] leading-relaxed text-zinc-700">Your agent already has four or five names, and every one of them belongs to someone else.</p>
            </div>
          </Card>
          {([
            ['portable', 'Not portable', "Your agent's name is owned by whichever platform issued it. Leave, and you start over."],
            ['verified', 'Not verified', 'Anyone can claim to be your agent. There is no way for a person or another agent to check.'],
          ] as const).map(([k, t, b]) => (
            <Card key={t} className="md:col-span-6">
              <div className="flex items-start gap-4">
                <ProblemIcon kind={k} />
                <div>
                  <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">{t}</div>
                  <p className="mt-2 text-[15px] leading-relaxed text-zinc-700">{b}</p>
                </div>
              </div>
            </Card>
          ))}
          <Card className="md:col-span-12">
            <div className="flex items-start gap-4">
              <ProblemIcon kind="reachable" />
              <div>
                <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">Not reachable</div>
                <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-zinc-700">People and agents who want to work with yours have no address to use. Just a form, or nothing.</p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-24">
          <Kicker>How it works</Kicker>
          <H2>Claim it. Connect it. Link everything to it.</H2>
          <Lead>Three steps, a few minutes. The name is the root; everything your agent is, and everywhere it lives, hangs off that one name.</Lead>
          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { n: '01', t: 'Claim your name.', b: 'Pick a name like samantha.agent. It is registered to you, renews on your terms, and never belongs to a platform.', f: 'Name · registered', art: <StepClaimArt />, glow: 'emerald' as const },
              { n: '02', t: 'Connect your agent.', b: 'Paste where your agent runs and click Connect. Kybernesis agents are ready as they are; any other agent with a URL takes one package.', f: 'Agent · connected', art: <StepConnectArt />, glow: 'cyan' as const },
              { n: '03', t: 'Link everything to it.', b: 'Its workspace identity, its control plane, its public endpoint. Each link is verified from both sides, so a checkmark means something.', f: 'Links · verified', art: <StepLinkArt />, glow: 'emerald' as const },
            ].map((s) => (
              <Card key={s.n} glow={s.glow}>
                {s.art}
                <div className="mt-6 flex items-center justify-between">
                  <div className="font-mono text-[12px] tracking-[0.14em] text-zinc-400">STEP {s.n}</div>
                  <Tag tone="emerald">{s.f}</Tag>
                </div>
                <h3 className="mt-3 text-[22px] font-medium tracking-[-0.02em]">{s.t}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">{s.b}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT YOU GET */}
      <section id="get" className="mx-auto w-full max-w-[1200px] px-6 py-24">
        <Kicker>What you get</Kicker>
        <H2>One name. Everything attached.</H2>
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Card className="sm:col-span-2 lg:col-span-4" glow="emerald">
            <div className="grid h-full grid-cols-1 gap-6 md:grid-cols-2">
              <div className="flex flex-col justify-end">
                <Kicker>The name</Kicker>
                <h3 className="mt-3 text-[24px] font-medium tracking-[-0.02em]">A name that is yours.</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">samantha.agent is registered to you, not leased from a platform. Renew it for as long as you want it. Nobody can take it or reassign it.</p>
              </div>
              <NameArt />
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <ProfileArt />
            <Kicker><span className="mt-6 block">The profile</span></Kicker>
            <h3 className="mt-3 text-[20px] font-medium tracking-[-0.02em]">A public page people can find.</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">What your agent does, who it represents, how to reach it, and whether it is online right now.</p>
          </Card>
          {[
            { k: 'Verified links', t: 'Proof, not claims.', b: "Link the agent's workspace account, control plane and endpoints. Each link is confirmed from both sides before it shows as verified.", art: <LinksArt />, glow: 'emerald' as const },
            { k: 'Reachable', t: 'An address other agents can use.', b: 'Any agent, on any platform, can look up your agent by name and knock. You decide who gets in. That part is the Connect add-on.', art: <ReachArt />, glow: 'cyan' as const },
            { k: 'Portable', t: 'Move hosts. Keep the identity.', b: 'Redeploy to a new cloud, switch frameworks, hand the agent to a teammate. The name, the profile and the verified links all come along.', art: <PortableArt />, glow: 'cyan' as const },
          ].map((c) => (
            <Card key={c.k} className="lg:col-span-2" glow={c.glow}>
              {c.art}
              <Kicker><span className="mt-6 block">{c.k}</span></Kicker>
              <h3 className="mt-3 text-[20px] font-medium tracking-[-0.02em]">{c.t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">{c.b}</p>
            </Card>
          ))}
          <Card className="sm:col-span-2 lg:col-span-6" glow="cyan">
            <div className="grid h-full grid-cols-1 gap-6 md:grid-cols-5">
              <div className="flex flex-col justify-center md:col-span-3">
                <Kicker>Owner control</Kicker>
                <h3 className="mt-3 text-[24px] font-medium tracking-[-0.02em]">You hold the keys.</h3>
                <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-zinc-600">The owner is always visible and always in charge. Rotate, transfer or retire the identity from one place, and every link updates.</p>
              </div>
              <div className="md:col-span-2"><KeysArt /></div>
            </div>
          </Card>
        </div>
      </section>

      {/* ADD-ONS */}
      <section id="addons" className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-24">
          <Kicker>Add-ons</Kicker>
          <H2>Start with a name. Add what you need.</H2>
          <Lead>The identity is the base layer. Everything that makes an agent useful to other agents installs on top of it, when you want it.</Lead>
          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="relative overflow-hidden rounded-3xl bg-black p-6 text-white">
              <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between"><Tag tone="dark">Included</Tag><span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/40">the base</span></div>
                <MiniBadgeArt />
                <h3 className="mt-6 text-[24px] font-medium tracking-[-0.02em]">Identity</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-white/65">Your name, your public profile, verified links, health status and the owner controls. This is what you register.</p>
                <ul className="mt-6 space-y-2 text-[14px] text-white/85">{['Registered name', 'Public profile page', 'Verified links', 'Owner dashboard'].map((x) => <CheckItem key={x} tone="light">{x}</CheckItem>)}</ul>
              </div>
            </div>
            <Card glow="emerald">
              <div className="flex items-center justify-between"><Tag tone="emerald">Add-on · Connect</Tag><span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">$5 / mo</span></div>
              <div className="mt-5"><ConnectFlowArt /></div>
              <h3 className="mt-6 text-[24px] font-medium tracking-[-0.02em]">Connect</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">Let your agent work with other agents. Approve each relationship once, set what it can and cannot do, see every message, revoke any time.</p>
              <ul className="mt-6 space-y-2 text-[14px] text-zinc-700">{['Pair with any agent by name', 'Permissions in plain English', 'Full activity log', 'One-click revoke'].map((x) => <CheckItem key={x}>{x}</CheckItem>)}</ul>
              <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">Powered by ARP</div>
            </Card>
            <Card glow="cyan">
              <div className="flex items-center justify-between"><Tag tone="cyan">Add-on · Payments</Tag><span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">soon</span></div>
              <div className="mt-5"><PaymentsArt /></div>
              <h3 className="mt-6 text-[24px] font-medium tracking-[-0.02em]">Payments</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">Let your agent earn and spend. Accept machine payments, pay other agents, with limits and approvals you set.</p>
              <ul className="mt-6 space-y-2 text-[14px] text-zinc-700">{['Accept machine payments', 'Pay other agents', 'Limits + approvals', 'Receipts + reconciliation'].map((x) => <CheckItem key={x} tone="cyan">{x}</CheckItem>)}</ul>
              <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">Coming soon</div>
            </Card>
          </div>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="mx-auto w-full max-w-[1200px] px-6 py-24">
        <Kicker>Who it's for</Kicker>
        <H2>Builders, businesses and platforms.</H2>
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {([
            ['builders', 'Builders', 'For developers building agents.', 'You already have an agent. Give it a name it can keep, a page people can find, and an address other agents can reach.', 'emerald'],
            ['companies', 'Companies', 'For businesses putting an agent in front of customers.', 'support.yourbrand.agent is easier to trust than a chat widget. Verified ownership, a public profile, and a clear record of what it is allowed to do.', 'cyan'],
            ['platforms', 'Platforms', 'For agent platforms and frameworks.', 'Give every agent on your platform a portable identity without building an identity system. Open standards, one adapter, no lock-in for your users.', 'emerald'],
          ] as const).map(([kind, k, t, b, glow]) => (
            <Card key={k} glow={glow}>
              <AudienceGlyph kind={kind} />
              <Kicker><span className="mt-6 block">{k}</span></Kicker>
              <h3 className="mt-3 text-[20px] font-medium tracking-[-0.02em]">{t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">{b}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-24">
          <Kicker>Pricing</Kicker>
          <H2>One name, one price. Add-ons when you need them.</H2>
          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { name: 'Name', price: '$29', period: '/ year', desc: 'A registered name with everything attached.', feats: ['Your .agent name', 'Public profile page', 'Verified links', 'Owner dashboard + health'], cta: 'Claim a name', href: CLAIM, primary: true, tone: 'light' as const },
              { name: 'Connect', price: '$5', period: '/ month', desc: 'Agent-to-agent, with you in control.', feats: ['Pair with any agent', 'Permissions + approvals', 'Full activity log', 'Instant revoke'], cta: 'Add Connect', href: 'https://cloud.arp.run/pricing', primary: false, tone: 'emerald' as const },
              { name: 'Payments', price: 'Soon', period: '', desc: 'Let your agent earn and spend.', feats: ['Accept machine payments', 'Pay other agents', 'Limits + approvals', 'Receipts + reconciliation'], cta: 'Join the waitlist', href: CLAIM, primary: false, tone: 'cyan' as const },
            ].map((p) => (
              <div key={p.name} className={`relative overflow-hidden rounded-3xl border p-8 ${p.primary ? 'border-black bg-black text-white' : 'border-zinc-200 bg-white'}`}>
                {p.primary && <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/25 blur-3xl" />}
                <div className="relative">
                  <div className={`font-mono text-[12px] uppercase tracking-[0.14em] ${p.primary ? 'text-white/60' : 'text-zinc-500'}`}>{p.name}</div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-[44px] font-medium tracking-[-0.03em]">{p.price}</span>
                    <span className={`text-[14px] ${p.primary ? 'text-white/60' : 'text-zinc-500'}`}>{p.period}</span>
                  </div>
                  <p className={`mt-2 text-[15px] ${p.primary ? 'text-white/70' : 'text-zinc-600'}`}>{p.desc}</p>
                  <ul className={`mt-6 space-y-2 text-[14px] ${p.primary ? 'text-white/85' : 'text-zinc-700'}`}>{p.feats.map((x) => <CheckItem key={x} tone={p.tone}>{x}</CheckItem>)}</ul>
                  <a href={p.href} className={`mt-8 inline-block rounded-full px-5 py-2.5 text-[14px] font-medium ${p.primary ? 'bg-white text-black hover:bg-zinc-200' : 'border border-zinc-300 text-zinc-900 hover:border-zinc-900'}`}>{p.cta}</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto w-full max-w-[1200px] px-6 py-24">
        <Kicker>FAQ</Kicker>
        <H2>Questions.</H2>
        <div className="mt-10 divide-y divide-zinc-200 border-y border-zinc-200">
          {[
            ['What can a name look like?', 'Lowercase letters, numbers and hyphens, up to 63 characters. It always ends in .agent.'],
            ['Do I need to change my agent’s code?', 'Not for Kybernesis agents. For any other agent with a URL, a developer adds one package once; after that the owner does everything from the console.'],
            ['Can I move my agent to another host?', 'Yes. Reconnect from the name’s page with the new address. The name, the profile and the verified links stay exactly as they were.'],
            ['Who holds the keys?', 'By default we hold the name’s key for you so hosted delivery works. You can export it at any time and hold it yourself.'],
            ['What is Connect?', 'The add-on that lets other agents talk to yours. You approve each relationship, set what it may do in plain English, see every message, and can revoke instantly.'],
          ].map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[17px] font-medium">
                {q}
                <span className="ml-4 text-zinc-400 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-zinc-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-black text-white">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 left-1/3 h-[420px] w-[420px] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative mx-auto w-full max-w-[1200px] px-6 py-24">
          <Kicker>Get started</Kicker>
          <h2 className="mt-3 max-w-[20ch] text-[40px] font-medium leading-[1.05] tracking-[-0.03em] sm:text-[56px]">Claim your agent’s name.</h2>
          <p className="mt-5 max-w-[50ch] text-[17px] text-white/65">Pick a name, connect your agent, and it has an identity it can keep.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={CLAIM} className="rounded-full bg-white px-6 py-3 text-[15px] font-medium text-black hover:bg-zinc-200">Claim a name</a>
            <a href="/badge" className="rounded-full border border-white/25 px-6 py-3 text-[15px] font-medium text-white hover:border-white">See a live badge</a>
          </div>
        </div>
      </section>

      <LanderFooter />
    </LanderShell>
  );
}
