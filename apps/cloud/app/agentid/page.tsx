import type * as React from 'react';
import {
  ButtonLink,
  CardMatrix,
  Container,
  Dot,
  Emphasis,
  EyebrowTag,
  FeatureCard,
  Grid12,
  HeroCTA,
  HeroLine,
  HeroMeta,
  HeroSub,
  HeroTitle,
  HeroTrust,
  IconShape,
  PlateHead,
  PricingCard,
  Section,
  Underline,
} from '@/components/ui';

/**
 * AgentID lander — the identity-first front door.
 *
 * Positioning: the product is a permanent NAME for an AI agent. Everything
 * else (connections, permissions, payments) hangs off the name as add-ons.
 * Copy deliberately never mentions the naming root, keys, DIDs, or any
 * crypto vocabulary — that lives in the developer strip only.
 */
export default function AgentIdLandingPage(): React.JSX.Element {
  return (
    <>
      {/* HERO */}
      <Section tone="paper" spacing="hero" rule={false} as="header" className="overflow-hidden">
        <Container>
          <HeroMeta
            cells={[
              { label: 'PLATE', value: 'P.00 / HERO' },
              { label: 'EDITION', value: '2026 · Q3 · PREVIEW' },
              { label: 'NAMESPACE', value: '*.AGENT' },
              { label: 'STATUS', value: 'EARLY ACCESS' },
            ]}
          />
          <div className="grid grid-cols-12 gap-6 pb-12">
            <div className="col-span-12 lg:col-span-6 flex flex-col">
              <EyebrowTag className="mb-7">AGENTID · IDENTITY FOR AI AGENTS</EyebrowTag>
              <HeroTitle>
                <HeroLine>Give your</HeroLine>
                <HeroLine>
                  <Emphasis tone="red">agent</Emphasis> a{' '}
                  <span
                    aria-hidden="true"
                    className="inline-block w-[0.7em] h-[0.62em] mx-[0.05em] align-baseline bg-signal-blue translate-y-[0.02em]"
                  />
                </HeroLine>
                <HeroLine>
                  <Underline>name</Underline>.
                </HeroLine>
              </HeroTitle>
              <HeroSub>
                One permanent identity for your AI agent.{' '}
                <b className="font-medium text-ink">
                  A name people can find, other agents can trust, and you control.
                </b>{' '}
                Attach it to any agent, on any platform, and take it with you when you move.
              </HeroSub>
              <HeroCTA>
                <ButtonLink href="#claim" variant="primary" size="lg" arrow="up-right">
                  Claim your name
                </ButtonLink>
                <ButtonLink href="#how" variant="default" size="lg" arrow>
                  See how it works
                </ButtonLink>
              </HeroCTA>
              <HeroTrust
                items={['YOURS FOR GOOD', 'WORKS WITH ANY AGENT', 'VERIFIED, NOT CLAIMED']}
              />
            </div>
            <div className="col-span-12 lg:col-span-6">
              <IdentityRecord />
            </div>
          </div>
        </Container>
        <NameStrip />
      </Section>

      {/* PROBLEM */}
      <Section id="problem">
        <Container>
          <PlateHead
            plateNum="P.01"
            kicker="// THE_PROBLEM"
            title={
              <>
                Agents have URLs, API keys, and usernames.{' '}
                <Emphasis tone="red">None of that is an identity.</Emphasis>
              </>
            }
          />
          <div className="grid grid-cols-12 bg-rule gap-px border border-rule">
            <div className="col-span-12 md:col-span-6 bg-ink text-paper p-7 min-h-[200px] flex flex-col gap-3">
              <div className="font-mono text-kicker uppercase text-paper/60">// WHO_IS_THIS</div>
              <h3 className="text-[2.5rem] font-display font-medium leading-none max-w-[14ch] text-paper">
                Every platform gives your agent a different name. None of them prove anything.
              </h3>
              <p className="text-body-sm text-paper/85 max-w-[50ch]">
                A bot handle here, a deployment URL there, a key in an env file. Move hosts and
                the identity is gone. Talk to another agent and nobody can check who is really
                on the other end.
              </p>
            </div>
            {[
              {
                num: '01',
                label: 'PORTABLE',
                body: "Your agent's name is owned by whichever platform issued it. Leave, and you start over.",
              },
              {
                num: '02',
                label: 'VERIFIED',
                body: 'Anyone can claim to be your agent. There is no way for a person or another agent to check.',
              },
              {
                num: '03',
                label: 'REACHABLE',
                body: 'People and agents who want to work with yours have no address to use. Just a form, or nothing.',
              },
            ].map((pain) => (
              <div
                key={pain.num}
                className="col-span-12 md:col-span-2 bg-paper p-7 min-h-[200px] flex flex-col gap-3"
              >
                <div className="font-mono text-kicker uppercase text-muted">
                  {pain.num} · NOT {pain.label}
                </div>
                <div className="font-display font-medium text-[3.6rem] leading-[0.9] tracking-[-0.03em] text-signal-red">
                  ×
                </div>
                <p className="text-body-sm text-ink-2">{pain.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* HOW IT WORKS */}
      <Section id="how">
        <Container>
          <PlateHead
            plateNum="P.02"
            kicker="// HOW_IT_WORKS"
            title={
              <>
                Claim it. Attach it. <Emphasis tone="blue">Link everything to it.</Emphasis>
              </>
            }
          />
          <Grid12 className="mb-8">
            <p className="col-span-12 md:col-span-7 text-body-lg text-ink-2 m-0">
              Three steps, about ten minutes. The name is the root. Everything else your agent
              is, and everywhere it lives, hangs off that one name.
            </p>
          </Grid12>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            <HowStep
              tone="yellow"
              label="STEP 01 · 01:00"
              num="01"
              title="Claim your name."
              body="Pick a name like samantha.agent. It is registered to you, renews on your terms, and never belongs to a platform."
              footnote="NAME · REGISTERED"
            />
            <HowStep
              tone="paper"
              label="STEP 02 · 05:00"
              num="02"
              title="Attach it to your agent."
              body="One package for Kybernesis Eve agents. Adapters for OpenClaw, Hermes, LangGraph, and any agent with a URL. The name follows the agent, not the host."
              footnote="AGENT · ATTACHED"
            />
            <HowStep
              tone="blue"
              label="STEP 03 · ALWAYS"
              num="03"
              title="Link everything to it."
              body="Its workspace identity, its control plane, its public endpoint. Each link is verified in both directions, so a checkmark means something."
              footnote="LINKS · VERIFIED"
            />
          </div>
        </Container>
      </Section>

      {/* WHAT YOU GET */}
      <Section id="identity">
        <Container>
          <PlateHead
            plateNum="P.03"
            kicker="// WHAT_YOU_GET"
            title={
              <>
                One name. <Emphasis tone="red">Everything attached.</Emphasis>
              </>
            }
          />
          <CardMatrix className="grid-cols-12">
            <FeatureCard
              idx="I.01 / 06"
              category="THE NAME"
              title="A name that is yours."
              description="samantha.agent is registered to you, not leased from a platform. Renew it for as long as you want it. Nobody can take it or reassign it."
              tone="blue"
              className="col-span-12 md:col-span-4"
              icon={<IconShape variant="stripe" color="currentColor" accent="yellow" />}
            />
            <FeatureCard
              idx="I.02 / 06"
              category="THE PROFILE"
              title="A public page people can find."
              description="What your agent does, who it represents, how to reach it, and whether it is online right now. Shareable like a business card."
              tone="paper"
              className="col-span-12 md:col-span-4"
              icon={<IconShape variant="frame" color="blue" accent="yellow" />}
            />
            <FeatureCard
              idx="I.03 / 06"
              category="VERIFIED LINKS"
              title="Proof, not claims."
              description="Link the agent's workspace account, control plane, and endpoints. Each link is confirmed from both sides before it shows as verified."
              tone="yellow"
              className="col-span-12 md:col-span-4"
              icon={<IconShape variant="grid9" color="currentColor" accent="red" />}
            />
            <FeatureCard
              idx="I.04 / 06"
              category="REACHABLE"
              title="An address other agents can use."
              description="Any agent, on any platform, can look up your agent by name and knock. You decide who gets in. That part is the Connect add-on."
              tone="red"
              className="col-span-12 md:col-span-4"
              icon={<IconShape variant="bars" color="currentColor" accent="yellow" />}
            />
            <FeatureCard
              idx="I.05 / 06"
              category="PORTABLE"
              title="Move hosts. Keep the identity."
              description="Redeploy to a new cloud, switch frameworks, hand the agent to a teammate. The name, the profile, and the verified links all come along."
              tone="paper"
              className="col-span-12 md:col-span-4"
              icon={<IconShape variant="blades" color="currentColor" />}
            />
            <FeatureCard
              idx="I.06 / 06"
              category="OWNER CONTROL"
              title="You hold the keys."
              description="The owner is always visible and always in charge. Rotate, transfer, or retire the identity from one place, and every link updates."
              tone="ink"
              className="col-span-12 md:col-span-4"
              icon={<IconShape variant="stripe" color="paper" accent="yellow" />}
            />
          </CardMatrix>
        </Container>
      </Section>

      {/* ADD-ONS */}
      <Section id="addons" tone="paper-2">
        <Container>
          <PlateHead
            plateNum="P.04"
            kicker="// ADD_ONS"
            title={
              <>
                Start with a name. <Emphasis tone="blue">Add what you need.</Emphasis>
              </>
            }
          />
          <Grid12 className="mb-8">
            <p className="col-span-12 md:col-span-7 text-body-lg text-ink-2 m-0">
              The identity is the base layer. Everything that makes an agent useful to
              other agents installs on top of it, from one marketplace, when you want it.
            </p>
          </Grid12>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            <Addon
              tone="ink"
              tag="INCLUDED"
              name="Identity"
              body="Your name, your public profile, verified links, health status, and the owner controls. This is what you register."
              bullets={['Registered name', 'Public profile page', 'Verified links', 'Owner dashboard']}
            />
            <Addon
              tone="paper"
              tag="ADD-ON · CONNECT"
              name="Connect"
              body="Let your agent work with other agents. Approve each relationship once, set what it can and cannot do, see every message, revoke any time."
              bullets={[
                'Pair with any agent by name',
                'Permissions in plain English',
                'Full activity log',
                'One-click revoke',
              ]}
              footnote="POWERED BY ARP"
            />
            <Addon
              tone="paper"
              tag="ADD-ON · PAYMENTS"
              name="Payments"
              body="Let your agent charge for its work, or pay other agents for theirs. Micropayments, subscriptions, and receipts, all tied to the name."
              bullets={['Accept payments by name', 'Pay other agents', 'Spending limits', 'Receipts on every charge']}
              footnote="COMING SOON"
            />
          </div>
        </Container>
      </Section>

      {/* WHO IT'S FOR */}
      <Section id="who">
        <Container>
          <PlateHead
            plateNum="P.05"
            kicker="// WHO_ITS_FOR"
            title={
              <>
                Built for people who <Emphasis tone="red">ship agents.</Emphasis>
              </>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            <Persona
              letter="B"
              letterTone="blue"
              kicker="// BUILDERS"
              title="For developers building agents."
              body="You already have an agent. Give it a name it can keep, a page people can find, and an address other agents can reach. One package, ten minutes."
            />
            <Persona
              tone="yellow"
              letter="C"
              letterTone="ink"
              kicker="// COMPANIES"
              title="For businesses putting an agent in front of customers."
              body="support.yourbrand.agent is easier to trust than a chat widget. Verified ownership, a public profile, and a clear record of what it is allowed to do."
            />
            <Persona
              letter="P"
              letterTone="red"
              kicker="// PLATFORMS"
              title="For agent platforms and frameworks."
              body="Give every agent on your platform a portable identity without building an identity system. Open standards, one adapter, no lock-in for your users."
            />
          </div>
        </Container>
      </Section>

      {/* DEVELOPER STRIP */}
      <Section id="developers" spacing="tight">
        <Container>
          <Grid12 className="items-start gap-4">
            <div className="col-span-12 md:col-span-5">
              <div className="font-mono text-kicker uppercase text-muted mb-3">
                <b className="text-ink font-medium">// UNDER_THE_HOOD</b> &nbsp;·&nbsp; for developers
              </div>
              <h3 className="text-display-md font-display font-medium leading-[1.02] tracking-[-0.02em] max-w-[16ch] m-0">
                Open standards. Nothing proprietary in the identity.
              </h3>
            </div>
            <ul className="col-span-12 md:col-span-7 list-none p-0 m-0 flex flex-col">
              {[
                'Every name publishes a standard identity document and a signed agent card at a well-known address.',
                'Verified links are two-way proofs, not self-declared metadata. A link shows as verified only when both sides point at each other.',
                'The Connect add-on is the Agent Relationship Protocol (ARP): open source, MIT licensed, with adapters for the frameworks you already run.',
                'Interoperable with A2A agent cards, so agents built on other stacks can find and address yours with no custom integration.',
              ].map((item) => (
                <li
                  key={item}
                  className="grid grid-cols-[24px_1fr] gap-3 py-3 border-t border-rule last:border-b items-start"
                >
                  <span className="font-mono text-kicker tracking-[0.14em] text-signal-blue pt-0.5">
                    [✓]
                  </span>
                  <span className="text-body-sm">{item}</span>
                </li>
              ))}
            </ul>
          </Grid12>
        </Container>
      </Section>

      {/* PRICING */}
      <Section id="pricing">
        <Container>
          <PlateHead
            plateNum="P.06"
            kicker="// PRICING"
            title={
              <>
                One name, one price. <Emphasis tone="blue">Add-ons when you need them.</Emphasis>
              </>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            <PricingCard
              tier="TIER 01 · IDENTITY"
              name="Name"
              price="$[TBD]"
              cadence="/ year"
              description="A registered name with everything attached."
              features={[
                'Your .agent name',
                'Public profile page',
                'Verified links',
                'Owner dashboard + health',
              ]}
              ctaLabel="Claim a name"
              ctaHref="#claim"
              highlighted
              popularLabel="START HERE"
            />
            <PricingCard
              tier="TIER 02 · CONNECT"
              name="Connect"
              price="$5"
              cadence="/ agent / mo"
              description="Agent-to-agent, with you in control."
              features={[
                'Pair with any agent',
                'Permissions + approvals',
                'Full activity log',
                'Instant revoke',
              ]}
              ctaLabel="Add Connect"
              ctaHref="https://cloud.arp.run/pricing"
            />
            <PricingCard
              tier="TIER 03 · PAYMENTS"
              name="Payments"
              price="[TBD]%"
              cadence="/ transaction"
              description="Let your agent earn and spend."
              features={[
                'Accept machine payments',
                'Pay other agents',
                'Limits + approvals',
                'Receipts + reconciliation',
              ]}
              ctaLabel="Join the waitlist"
              ctaHref="#claim"
              footnote="COMING SOON"
            />
          </div>
          <Grid12 className="mt-7 items-center">
            <div className="col-span-12 md:col-span-7 font-mono text-kicker tracking-[0.1em] uppercase text-muted">
              <b className="text-ink font-medium">ONE FLAT PRICE PER NAME.</b> &nbsp;·&nbsp; NO
              PER-SEAT FEES. &nbsp;·&nbsp; ADD-ONS ARE OPTIONAL. [TBD]
            </div>
          </Grid12>
        </Container>
      </Section>

      {/* CLAIM */}
      <Section tone="ink" spacing="default" id="claim" rule>
        <Container>
          <div className="font-mono text-kicker uppercase text-paper/60 mb-5">
            <b className="text-signal-yellow font-medium">P.07 // CLAIM_YOUR_NAME</b>{' '}
            &nbsp;——&nbsp; end of document
          </div>
          <h2 className="font-display font-medium text-[clamp(56px,7.6vw,112px)] leading-[0.95] tracking-[-0.03em] m-0 max-w-[22ch]">
            Your agent is going to
            <br />
            need a <Emphasis tone="yellow">name</Emphasis>.
            <br />
            Make it <span className="text-signal-red">yours</span>.
          </h2>
          <p className="mt-6 text-body-lg text-paper/80 max-w-[56ch]">
            Early access. Claim a name now and we will hold it for you while we bring
            registration online.
          </p>
          <ClaimForm />
          <div className="mt-16 font-mono text-kicker uppercase text-paper/60 flex flex-wrap items-center gap-3">
            <Dot tone="green" size={6} />
            EARLY ACCESS · WORKS WITH ANY AGENT · BUILT ON ARP · AGENT.ARP.RUN
          </div>
        </Container>
      </Section>
    </>
  );
}

/* -------- local helpers -------- */

/**
 * Hero visual: the identity record for one agent. This is the "what you are
 * buying" picture — a name at the top, verified links underneath, reachability
 * and owner at the bottom. Static mock; every value is illustrative.
 */
function IdentityRecord(): React.JSX.Element {
  const links: Array<{ kind: string; value: string; state: 'verified' | 'pending' }> = [
    { kind: 'OWNER', value: 'Ian · Kybernesis', state: 'verified' },
    { kind: 'RUNTIME', value: 'Eve · samantha.vercel.app', state: 'verified' },
    { kind: 'CONTROL PLANE', value: 'agent.kybernesis.ai / samantha', state: 'verified' },
    { kind: 'WORKSPACE', value: 'Buzz · npub1s4m…9qx', state: 'verified' },
    { kind: 'CONNECT', value: '3 active connections', state: 'verified' },
    { kind: 'PAYMENTS', value: 'not enabled', state: 'pending' },
  ];
  return (
    <div className="relative w-full h-full min-h-[440px] bg-paper-2 border border-rule flex flex-col">
      <div className="flex justify-between items-center px-3.5 py-2.5 border-b border-rule bg-paper font-mono text-kicker uppercase text-muted">
        <span>
          <b className="text-ink font-medium">FIG&nbsp;1</b> · IDENTITY RECORD
        </span>
        <span className="flex items-center gap-2">
          <Dot tone="green" size={6} /> ONLINE
        </span>
      </div>

      <div className="px-6 pt-7 pb-5 border-b border-rule">
        <div className="font-mono text-kicker uppercase text-muted mb-2">// NAME</div>
        <div className="font-display font-medium text-[clamp(34px,4.2vw,52px)] leading-[0.95] tracking-[-0.03em] text-ink">
          samantha<span className="text-signal-blue">.agent</span>
        </div>
        <p className="mt-3 text-body-sm text-ink-2 max-w-[44ch] m-0">
          Personal agent for Ian. Handles scheduling, research, and follow-ups. Reachable by
          other agents with permission.
        </p>
      </div>

      <ul className="list-none p-0 m-0 flex-1">
        {links.map((l, i) => (
          <li
            key={l.kind}
            className={`grid grid-cols-[120px_1fr_auto] gap-3 items-center px-6 py-2.5 ${
              i < links.length - 1 ? 'border-b border-rule' : ''
            }`}
          >
            <span className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-muted">
              {l.kind}
            </span>
            <span className="font-mono text-[12px] text-ink truncate">{l.value}</span>
            <span
              className={`font-mono text-[10px] tracking-[0.14em] uppercase px-1.5 py-0.5 border ${
                l.state === 'verified'
                  ? 'border-signal-blue text-signal-blue'
                  : 'border-rule text-muted'
              }`}
            >
              {l.state === 'verified' ? '✓ verified' : 'pending'}
            </span>
          </li>
        ))}
      </ul>

      <div className="px-6 py-3 border-t border-rule bg-paper font-mono text-[10.5px] tracking-[0.1em] uppercase text-muted flex flex-wrap justify-between gap-2">
        <span>REGISTERED 2026 · RENEWS YEARLY</span>
        <span>ID · PROFILE · LINKS · CONTROLS</span>
      </div>
    </div>
  );
}

function NameStrip(): React.JSX.Element {
  const names = [
    'samantha.agent',
    'atlas.agent',
    'support.acme.agent',
    'nova.agent',
    'concierge.hotelmarlow.agent',
    'sid.agent',
    'research.agent',
    'ghost.agent',
    'billing.northwind.agent',
    'mythos.agent',
  ];
  return (
    <div className="border-y border-rule bg-paper-2 overflow-hidden">
      <div className="mx-auto max-w-page px-8 py-3 flex flex-wrap gap-x-8 gap-y-1 font-mono text-[11px] tracking-[0.1em] uppercase text-muted">
        <span className="text-ink font-medium">// NAMES_IN_USE</span>
        {names.map((n) => (
          <span key={n}>
            <span className="text-ink">{n.replace('.agent', '')}</span>
            <span className="text-signal-blue">.agent</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function HowStep({
  tone,
  label,
  num,
  title,
  body,
  footnote,
}: {
  tone: 'yellow' | 'paper' | 'blue';
  label: string;
  num: string;
  title: string;
  body: string;
  footnote: string;
}): React.JSX.Element {
  const toneCls =
    tone === 'yellow'
      ? 'bg-signal-yellow text-ink'
      : tone === 'blue'
        ? 'bg-signal-blue text-paper'
        : 'bg-paper text-ink';
  const mutedCls = tone === 'blue' ? 'text-paper/70' : 'text-muted';
  const bodyCls = tone === 'blue' ? 'text-paper/85' : 'text-ink-2';
  return (
    <div className={`p-7 min-h-[300px] flex flex-col gap-3 ${toneCls}`}>
      <div className={`font-mono text-kicker uppercase ${mutedCls}`}>{label}</div>
      <div className="font-display font-medium text-[4rem] leading-[0.9] tracking-[-0.03em]">
        {num}
      </div>
      <h3 className="font-display font-medium text-h3 leading-[1.05] max-w-[16ch] m-0">{title}</h3>
      <p className={`text-body-sm m-0 ${bodyCls}`}>{body}</p>
      <div className={`mt-auto pt-4 font-mono text-[10.5px] tracking-[0.14em] uppercase ${mutedCls}`}>
        {footnote}
      </div>
    </div>
  );
}

function Addon({
  tone,
  tag,
  name,
  body,
  bullets,
  footnote,
}: {
  tone: 'ink' | 'paper';
  tag: string;
  name: string;
  body: string;
  bullets: string[];
  footnote?: string;
}): React.JSX.Element {
  const isInk = tone === 'ink';
  return (
    <div
      className={`p-7 min-h-[340px] flex flex-col gap-3 ${
        isInk ? 'bg-ink text-paper' : 'bg-paper text-ink'
      }`}
    >
      <div className={`font-mono text-kicker uppercase ${isInk ? 'text-signal-yellow' : 'text-muted'}`}>
        {tag}
      </div>
      <h3 className="font-display font-medium text-[2.5rem] leading-none m-0">{name}</h3>
      <p className={`text-body-sm m-0 ${isInk ? 'text-paper/85' : 'text-ink-2'}`}>{body}</p>
      <ul className="list-none p-0 m-0 mt-2 flex flex-col">
        {bullets.map((b) => (
          <li
            key={b}
            className={`grid grid-cols-[20px_1fr] gap-2 py-2 border-t items-start text-body-sm ${
              isInk ? 'border-paper/20' : 'border-rule'
            }`}
          >
            <span className={`font-mono text-kicker ${isInk ? 'text-signal-yellow' : 'text-signal-blue'}`}>
              +
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {footnote && (
        <div
          className={`mt-auto pt-4 font-mono text-[10.5px] tracking-[0.14em] uppercase ${
            isInk ? 'text-paper/60' : 'text-muted'
          }`}
        >
          {footnote}
        </div>
      )}
    </div>
  );
}

function Persona({
  tone = 'paper',
  letter,
  letterTone,
  kicker,
  title,
  body,
}: {
  tone?: 'paper' | 'yellow';
  letter: string;
  letterTone: 'blue' | 'red' | 'ink';
  kicker: string;
  title: string;
  body: string;
}): React.JSX.Element {
  const letterCls =
    letterTone === 'blue' ? 'text-signal-blue' : letterTone === 'red' ? 'text-signal-red' : 'text-ink';
  return (
    <div
      className={`p-7 min-h-[300px] flex flex-col gap-3 ${
        tone === 'yellow' ? 'bg-signal-yellow' : 'bg-paper'
      } text-ink`}
    >
      <div className="font-mono text-kicker uppercase text-muted">{kicker}</div>
      <div className={`font-display font-medium text-[4.5rem] leading-[0.9] tracking-[-0.03em] ${letterCls}`}>
        {letter}
      </div>
      <h3 className="font-display font-medium text-h3 leading-[1.05] max-w-[18ch] m-0">{title}</h3>
      <p className="text-body-sm text-ink-2 m-0">{body}</p>
    </div>
  );
}

/**
 * Claim form. There is no registrar yet — this is a plain GET to the existing
 * cloud signup so an early-access name lands in a real tenant record and can
 * be honoured once registration is live. No JS, no client component.
 */
function ClaimForm(): React.JSX.Element {
  return (
    <form
      action="https://cloud.arp.run/signup"
      method="get"
      className="mt-10 flex flex-col sm:flex-row gap-3 max-w-[640px]"
    >
      <input type="hidden" name="source" value="agentid" />
      <label className="flex-1 flex items-stretch border border-paper/40 bg-paper text-ink focus-within:border-signal-yellow">
        <span className="sr-only">Agent name</span>
        <input
          name="agent"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="yourname"
          pattern="[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?"
          title="Lowercase letters, numbers, and hyphens"
          className="flex-1 min-w-0 px-4 py-3.5 font-mono text-[15px] bg-transparent outline-none placeholder:text-muted"
        />
        <span className="px-4 flex items-center font-mono text-[15px] text-signal-blue border-l border-rule select-none">
          .agent
        </span>
      </label>
      <button
        type="submit"
        className="px-6 py-3.5 bg-signal-yellow text-ink font-mono text-[12px] tracking-[0.14em] uppercase border border-signal-yellow hover:bg-paper transition-colors duration-fast"
      >
        Claim early access ↗
      </button>
    </form>
  );
}
