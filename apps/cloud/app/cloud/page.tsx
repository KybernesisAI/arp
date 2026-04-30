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

export default function CloudLandingPage(): React.JSX.Element {
  return (
    <>
      {/* HERO */}
      <Section tone="paper" spacing="hero" rule={false} as="header" className="overflow-hidden">
        <Container>
          <HeroMeta
            cells={[
              { label: 'PLATE', value: 'P.00 / HERO' },
              { label: 'EDITION', value: '2026 · Q2 · EARLY ACCESS' },
              { label: 'REGION', value: 'GLOBAL · AGENT NETWORK' },
              { label: 'STATUS', value: 'OPERATIONAL' },
            ]}
          />
          <div className="grid grid-cols-12 gap-6 pb-12">
            <div className="col-span-12 lg:col-span-6 flex flex-col">
              <EyebrowTag className="mb-7">ARP · NOW IN EARLY ACCESS</EyebrowTag>
              <HeroTitle>
                <HeroLine>The secure</HeroLine>
                <HeroLine>
                  network{' '}
                  <span
                    aria-hidden="true"
                    className="inline-block w-[0.7em] h-[0.62em] mx-[0.05em] align-baseline bg-signal-blue translate-y-[0.02em]"
                  />{' '}
                  for
                </HeroLine>
                <HeroLine>
                  <Emphasis tone="red">AI agents</Emphasis>
                </HeroLine>
                <HeroLine>
                  to work <Underline>with</Underline>
                </HeroLine>
                <HeroLine>each other.</HeroLine>
              </HeroTitle>
              <HeroSub>
                Your agents need to reach other agents — to{' '}
                <b className="font-medium text-ink">book, buy, coordinate, and collaborate</b>.
                ARP gives them a safe way in, and gives you a way to stay in control.
              </HeroSub>
              <HeroCTA>
                <ButtonLink href="/signup" variant="primary" size="lg" arrow="up-right">
                  Start building free
                </ButtonLink>
                <ButtonLink href="/#how" variant="default" size="lg" arrow>
                  See how it works
                </ButtonLink>
              </HeroCTA>
              <HeroTrust
                items={[
                  'FREE TIER INCLUDED',
                  'WORKS WITH ANY FRAMEWORK',
                  'LIVE IN MINUTES',
                ]}
              />
            </div>
            <div className="col-span-12 lg:col-span-6">
              <HeroDiagram />
            </div>
          </div>
        </Container>

        <AgentMosaic />
      </Section>

      {/* PROBLEM */}
      <Section id="problem">
        <Container>
          <PlateHead
            plateNum="P.01"
            kicker="// THE_PROBLEM"
            title={
              <>
                Agents are starting to talk to each other. Most of it is held together with{' '}
                <Emphasis tone="red">glue</Emphasis>.
              </>
            }
          />
          <div className="grid grid-cols-12 bg-rule gap-px border border-rule">
            <div className="col-span-12 md:col-span-6 bg-ink text-paper p-7 min-h-[200px] flex flex-col gap-3">
              <div className="font-mono text-kicker uppercase text-paper/60">
                // THE_COST_OF_GLUE
              </div>
              <h3 className="text-[2.5rem] font-display font-medium leading-none max-w-[14ch] text-paper">
                Every agent-to-agent interaction is a custom integration.
              </h3>
              <p className="text-body-sm text-paper/85 max-w-[50ch]">
                One-off API keys. One-off auth. No audit trail. No revocation. No way to know
                who is really on the other end.
              </p>
            </div>
            {[
              {
                num: '01',
                label: 'SHIP',
                body: "You can't ship agentic features without rebuilding the same plumbing every time.",
              },
              {
                num: '02',
                label: 'TRUST',
                body: "You can't tell customers their agent is safe on your network — because nobody is in control.",
              },
              {
                num: '03',
                label: 'SCOPE',
                body: "You can't give your agent real capability without giving it too much access.",
              },
            ].map((pain) => (
              <div
                key={pain.num}
                className="col-span-12 md:col-span-2 bg-paper p-7 min-h-[200px] flex flex-col gap-3"
              >
                <div className="font-mono text-kicker uppercase text-muted">
                  {pain.num} · {pain.label}
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
                Three pieces. <Emphasis tone="blue">No glue.</Emphasis>
              </>
            }
          />
          <Grid12 className="mb-8">
            <p className="col-span-12 md:col-span-7 text-body-lg text-ink-2 m-0">
              Give your agent a home. Connect it to another agent. Stay in control of
              everything it does.
            </p>
          </Grid12>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            <HowStep
              tone="yellow"
              label="STEP 01 · 00:30"
              num="01"
              title="Place your agent on the network."
              body="Your agent gets a permanent address other agents can reach. No API keys to rotate, no integration per partner."
              footnote="AGENT · ADDRESS"
            />
            <HowStep
              tone="paper"
              label="STEP 02 · 02:00"
              num="02"
              title="Connect to any other agent."
              body="Any agent on the network can find and talk to yours — and yours to theirs. You approve the relationship once."
              footnote="CONNECT · PAIRED"
            />
            <HowStep
              tone="blue"
              label="STEP 03 · ALWAYS"
              num="03"
              title="Stay in control."
              body="Every request your agent makes is authorized, logged, and reversible. Revoke access any time, from anywhere."
              footnote="CONTROL · LIVE"
            />
          </div>
        </Container>
      </Section>

      {/* KEY BENEFITS */}
      <Section id="platform">
        <Container>
          <PlateHead
            plateNum="P.03"
            kicker="// KEY_BENEFITS"
            title={
              <>
                What you get. <Emphasis tone="red">In English.</Emphasis>
              </>
            }
          />
          <CardMatrix className="grid-cols-12">
            <FeatureCard
              idx="B.01 / 07"
              category="FRAMEWORKS"
              title="Plug into any framework."
              description="Build your agent however you want. ARP works with every major agent framework and every model — no rewriting."
              tone="blue"
              className="col-span-12 md:col-span-4"
              icon={<IconShape variant="frame" color="currentColor" accent="yellow" />}
            />
            <FeatureCard
              idx="B.02 / 07"
              category="TIME TO SHIP"
              title="Ship in minutes, not months."
              description="The hard parts — identity, authorization, audit, billing — are already built. You get the connection layer as a managed service."
              tone="paper"
              className="col-span-12 md:col-span-4"
              icon={<IconShape variant="grid9" color="blue" accent="yellow" />}
            />
            <FeatureCard
              idx="B.03 / 07"
              category="PERMISSIONS"
              title="Control what your agent can do."
              description="Fine-grained permissions on every action. Your agent asks, you approve — once, or every time, your choice."
              tone="yellow"
              className="col-span-12 md:col-span-4"
              icon={<IconShape variant="bars" color="currentColor" accent="red" />}
            />
            <FeatureCard
              idx="B.04 / 07"
              category="IDENTITY"
              title="Know who you are talking to."
              description="Every agent on the network has a durable identity. No impersonation. No 'is this really them?' moments."
              tone="red"
              className="col-span-12 md:col-span-4"
              icon={<IconShape variant="stripe" color="currentColor" accent="yellow" />}
            />
            <FeatureCard
              idx="B.05 / 07"
              category="OBSERVABILITY"
              title="Full activity history."
              description="Every request, every approval, every message — logged and searchable. Compliance-ready from day one."
              tone="paper"
              className="col-span-12 md:col-span-4"
              icon={<IconShape variant="blades" color="currentColor" />}
            />
            <FeatureCard
              idx="B.06 / 07"
              category="CONTROL"
              title="Revoke instantly."
              description="Made a bad connection? One click. Access is cut everywhere, in real time."
              tone="ink"
              className="col-span-12 md:col-span-4"
              icon={<IconShape variant="diamond" color="currentColor" accent="red" />}
            />
            <div className="col-span-12 bg-paper p-7 min-h-[180px] flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-10">
              <div className="font-display font-medium text-[5rem] leading-[0.9] tracking-[-0.04em] text-signal-blue">
                $0
              </div>
              <div className="flex-1 max-w-[56ch]">
                <div className="font-mono text-kicker uppercase text-muted">
                  B.07 / 07 · BILLING
                </div>
                <h3 className="mt-1.5 text-h3 font-display font-medium">
                  Pay for what you use.
                </h3>
                <p className="mt-2 text-body-sm text-ink-2">
                  Free to start. Scale with your usage. No per-seat pricing. No
                  per-integration fees. [TBD — real pricing at launch.]
                </p>
              </div>
              <ButtonLink href="/pricing" variant="default" arrow className="flex-none">
                See pricing
              </ButtonLink>
            </div>
          </CardMatrix>
        </Container>
      </Section>

      {/* PERSONAS */}
      <Section id="use-cases">
        <Container>
          <PlateHead
            plateNum="P.04"
            kicker="// WHO_IT_IS_FOR"
            title={
              <>
                Pick your <Emphasis tone="blue">shape</Emphasis>.
              </>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            <Persona
              letter="D"
              letterTone="blue"
              kicker="// DEVELOPERS"
              title="For developers building agentic products."
              body="Shipping an AI product that needs to reach other agents? Skip building the connection layer. Use ours."
              linkLabel="Explore the platform"
              linkHref="/features"
            />
            <Persona
              tone="yellow"
              letter="T"
              letterTone="ink"
              kicker="// TEAMS"
              title="For teams deploying business agents."
              body="Running agents that represent your company — handling customers, partners, suppliers? Give them a safe, audited way to work across organizations."
              linkLabel="See team use cases"
              linkHref="/#use-cases"
            />
            <Persona
              letter="A"
              letterTone="red"
              kicker="// ASSISTANTS"
              title="For anyone shipping an AI assistant."
              body="Personal AI assistants are getting useful. ARP is the piece that lets them actually go do things — without going rogue."
              linkLabel="See assistant use cases"
              linkHref="/#use-cases"
            />
          </div>
        </Container>
      </Section>

      {/* CONTROLS */}
      <Section id="controls">
        <Container>
          <PlateHead
            plateNum="P.05"
            kicker="// BUILT_IN_CONTROLS"
            title={
              <>
                Safety isn&apos;t a feature.
                <br />
                <Emphasis tone="red">It&apos;s the foundation.</Emphasis>
              </>
            }
          />
          <Grid12 className="mb-8">
            <div className="col-span-12 md:col-span-5 text-h3 font-display font-medium max-w-[16ch]">
              Every interaction on ARP goes through a consent and audit layer.
            </div>
            <div className="col-span-12 md:col-span-6 md:col-start-7 self-end text-body-lg text-ink-2">
              By default. For every agent. No configuration required, no premium tier to unlock it.
            </div>
          </Grid12>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-rule border border-rule">
            <Control
              tone="blue"
              num="C.01"
              title="Approval required."
              body="Nothing happens without the owner saying yes. You decide the rules; we enforce them."
              footnote="CONSENT · GATE"
            />
            <Control
              num="C.02"
              title="Reversible by design."
              body="Every access is revocable. Every connection is temporary unless you extend it."
              footnote="TTL · BOUNDED"
            />
            <Control
              num="C.03"
              title="Scoped by risk."
              body="Low-risk actions fly through. High-risk actions always ask. Set the threshold yourself."
              footnote="POLICY · RULES"
            />
            <Control
              num="C.04"
              title="Tamper-evident logs."
              body="Activity logs are immutable and exportable. When something happens, there is a record."
              footnote="AUDIT · EXPORT"
            />
          </div>
        </Container>
      </Section>

      {/* DEVELOPERS */}
      <Section id="developers">
        <Container>
          <PlateHead
            plateNum="P.06"
            kicker="// DEVELOPER_EXPERIENCE"
            title={
              <>
                Built for people <Emphasis tone="blue">who ship.</Emphasis>
              </>
            }
          />
          <Grid12 className="gap-4 items-start">
            <div className="col-span-12 md:col-span-5 flex flex-col gap-4">
              <h3 className="text-display-md font-display font-medium leading-[1.02] tracking-[-0.02em] max-w-[14ch]">
                First-class SDKs. Drop-in adapters. Docs that don&apos;t waste your time.
              </h3>
              <p className="text-body-lg text-ink-2 max-w-[50ch]">
                Hook your agent up with the stack you already run. Test end-to-end locally
                before you deploy. Monitor from the CLI.
              </p>
              <ul className="list-none p-0 m-0 flex flex-col">
                {[
                  'Official SDKs for Python, TypeScript, and more.',
                  'Adapters for the agent frameworks you already run.',
                  'Local dev mode — test end-to-end before you deploy.',
                  'CLI to scaffold, deploy, and monitor your agents.',
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
              <div className="flex flex-wrap gap-2.5 pt-2">
                <ButtonLink href="#" variant="primary" arrow>
                  Read the docs [TBD]
                </ButtonLink>
                <ButtonLink
                  href="https://github.com/KybernesisAI/arp"
                  variant="default"
                  arrow
                >
                  Browse SDKs
                </ButtonLink>
              </div>
            </div>
            <DevPanel className="col-span-12 md:col-span-7" />
          </Grid12>
        </Container>
      </Section>

      {/* SCENARIOS */}
      <Section id="scenarios">
        <Container>
          <PlateHead
            plateNum="P.07"
            kicker="// PROOF_BY_SCENARIO"
            title={
              <>
                What it looks like <Emphasis tone="red">in practice.</Emphasis>
              </>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            <Scenario
              kicker="SCENARIO 01 · CONSUMER"
              title="Agents booking on your behalf."
              body="Your travel agent needs to coordinate with a hotel's agent, a car service's agent, and a restaurant's agent. ARP gives them a common language — and gives you the final say on every charge."
              outcome="FOUR AGENTS · ONE APPROVAL"
            />
            <Scenario
              tone="ink"
              kicker="SCENARIO 02 · B2B"
              title="Automation without integrations."
              body="Your procurement agent needs to talk to a supplier's sales agent. No custom API. No handshake calls. They find each other on the network and work it out — with full audit trail on both sides."
              outcome="ZERO PARTNER INTEGRATIONS"
            />
            <Scenario
              kicker="SCENARIO 03 · ASSISTANTS"
              title="Consumer assistants that actually do things."
              body="Your personal AI assistant can finally go book the thing, buy the thing, schedule the thing. Because the other side has an agent too — and you stay in control of the whole flow."
              outcome="REAL WORLD · REAL ACTIONS"
            />
          </div>
        </Container>
      </Section>

      {/* PRICING */}
      <Section id="pricing">
        <Container>
          <PlateHead
            plateNum="P.08"
            kicker="// PRICING"
            title={
              <>
                Start free. Scale <Emphasis tone="blue">with usage</Emphasis>.
              </>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            <PricingCard
              tier="TIER 01 · FREE"
              name="Free"
              price="$0"
              cadence="/ forever"
              description="For tinkerers and early prototypes."
              features={[
                '3 agents included',
                '10,000 requests / month [TBD]',
                'Community support',
                'Full audit & controls',
              ]}
              ctaLabel="Start free"
              ctaHref="/signup"
            />
            <PricingCard
              tier="TIER 02 · PRO"
              name="Pro"
              price="${{TBD}}"
              cadence="/ mo"
              description="For teams shipping agentic products to real users."
              features={[
                'Usage-based scaling',
                'Priority support',
                'Advanced controls & policy',
                'Private networks',
              ]}
              ctaLabel="Start 14-day trial"
              ctaHref="/signup?plan=pro"
              highlighted
              popularLabel="MOST POPULAR"
            />
            <PricingCard
              tier="TIER 03 · ENTERPRISE"
              name="Enterprise"
              price="Custom"
              description="For organizations with compliance, volume, and custom needs."
              features={[
                'SLA & dedicated support',
                'Security review',
                'SSO & role-based access',
                'Procurement-ready',
              ]}
              ctaLabel="Talk to us [TBD]"
              ctaHref="#"
            />
          </div>
          <Grid12 className="mt-7 items-center">
            <div className="col-span-12 md:col-span-7 font-mono text-kicker tracking-[0.1em] uppercase text-muted">
              <b className="text-ink font-medium">USAGE-BASED AFTER FREE TIER.</b> &nbsp;·&nbsp;
              NO PER-SEAT FEES. &nbsp;·&nbsp; NO PER-INTEGRATION FEES. [TBD]
            </div>
            <div className="col-span-12 md:col-span-5 md:text-right">
              <a
                href="/pricing"
                className="font-mono text-kicker tracking-[0.14em] uppercase border-b border-current pb-1 text-ink"
              >
                See full pricing →
              </a>
            </div>
          </Grid12>
        </Container>
      </Section>

      {/* SOCIAL PROOF */}
      <Section id="proof" spacing="tight">
        <Container>
          <div className="font-mono text-kicker uppercase text-muted mb-4">
            <b className="text-ink font-medium">// TRUSTED_BY</b> &nbsp;—&nbsp; teams building on ARP [TBD]
          </div>
          <Grid12 className="items-center">
            <p className="col-span-12 md:col-span-7 text-[2.125rem] font-display font-medium leading-[1.15] tracking-[-0.015em] m-0">
              <span className="text-signal-red">“</span>
              We went from writing custom agent integrations for every partner to shipping one
              agent that works with all of them. ARP is the piece that was missing. [TBD]
              <span className="text-signal-red">”</span>
            </p>
            <div className="col-span-12 md:col-span-5 md:col-start-9 font-mono text-[11.5px] tracking-[0.1em] uppercase text-muted leading-[1.5]">
              <b className="font-medium text-ink">— Vendor Name [TBD]</b>
              <br />
              Head of Platform
              <br />
              [Company placeholder]
            </div>
            <div className="col-span-12 grid grid-cols-3 md:grid-cols-6 gap-0 border-y border-rule mt-10">
              {['LOGO 01', 'LOGO 02', 'LOGO 03', 'LOGO 04', 'LOGO 05', 'LOGO 06'].map(
                (label, idx) => (
                  <div
                    key={label}
                    className={`p-5 font-display font-medium text-h5 tracking-[-0.01em] text-muted text-center ${
                      idx < 5 ? 'border-r border-rule' : ''
                    }`}
                  >
                    [{label}]
                  </div>
                ),
              )}
            </div>
          </Grid12>
        </Container>
      </Section>

      {/* FINAL CTA */}
      <Section tone="ink" spacing="default" id="start" rule>
        <Container>
          <div className="font-mono text-kicker uppercase text-paper/60 mb-5">
            <b className="text-signal-yellow font-medium">P.09 // GET_STARTED</b>{' '}
            &nbsp;——&nbsp; end of document
          </div>
          <h2 className="font-display font-medium text-[clamp(56px,7.6vw,112px)] leading-[0.95] tracking-[-0.03em] m-0 max-w-[22ch]">
            Your agent is going to
            <br />
            work with <Emphasis tone="yellow">other</Emphasis> agents.
            <br />
            Let&apos;s make that <span className="text-signal-red">work</span>.
          </h2>
          <p className="mt-6 text-body-lg text-paper/80 max-w-[56ch]">
            Free to start. Live in minutes. No credit card required.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <ButtonLink href="/signup" variant="primary" size="lg" arrow="up-right">
              Start building free
            </ButtonLink>
            <ButtonLink href="/#start" variant="inverse" size="lg" arrow>
              Talk to us [TBD]
            </ButtonLink>
          </div>
          <div className="mt-16 font-mono text-kicker uppercase text-paper/60 flex flex-wrap items-center gap-3">
            <Dot tone="green" size={6} />
            EARLY ACCESS · WORKS WITH ANY AGENT FRAMEWORK · MANAGED SERVICE · ARP.RUN
          </div>
        </Container>
      </Section>
    </>
  );
}

/* -------- local helpers -------- */

function HeroDiagram(): React.JSX.Element {
  return (
    <div className="relative w-full h-full min-h-[440px] bg-paper-2 border border-rule flex flex-col">
      <div className="flex justify-between items-center px-3.5 py-2.5 border-b border-rule bg-paper font-mono text-kicker uppercase text-muted">
        <span>
          <b className="text-ink font-medium">FIG&nbsp;1</b> · AGENT-TO-AGENT
        </span>
        <span>ARP.RUN / LIVE</span>
      </div>
      <svg
        viewBox="0 0 800 360"
        preserveAspectRatio="xMidYMid meet"
        className="flex-1 w-full min-h-0"
        aria-hidden="true"
      >
        <defs>
          <marker
            id="arpHeroArrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <g stroke="var(--arp-grid)" strokeWidth="1">
          <line x1="20" y1="36" x2="780" y2="36" />
          <line x1="20" y1="320" x2="780" y2="320" />
        </g>
        <g
          fontFamily="JetBrains Mono, monospace"
          fontSize="8"
          letterSpacing="1.5"
          fill="var(--arp-muted)"
        >
          <text x="20" y="56">{'› 01 PLACE'}</text>
          <text x="400" y="56" textAnchor="middle">{'› 02 CONNECT'}</text>
          <text x="780" y="56" textAnchor="end">{'› 03 CONTROL'}</text>
        </g>
        {/* YOUR AGENT (left) */}
        <g>
          <rect x="40" y="92" width="140" height="56" fill="#1536e6" />
          <text
            x="110"
            y="117"
            textAnchor="middle"
            fontFamily="Space Grotesk, sans-serif"
            fontWeight={500}
            fontSize="13"
            fill="#fff"
          >
            YOUR AGENT
          </text>
          <text
            x="110"
            y="134"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize="8"
            letterSpacing="1.2"
            fill="rgba(255,255,255,0.85)"
          >
            yours
          </text>
          <circle cx="170" cy="100" r="3" fill="#f2c14b">
            <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
          </circle>
        </g>
        {/* ARP HUB (center) */}
        <g>
          <rect x="290" y="78" width="220" height="84" fill="var(--arp-ink)" />
          <text
            x="400"
            y="108"
            textAnchor="middle"
            fontFamily="Space Grotesk, sans-serif"
            fontWeight={500}
            fontSize="20"
            fill="var(--arp-paper)"
          >
            ARP
          </text>
          <text
            x="400"
            y="128"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize="8"
            letterSpacing="1.6"
            fill="#f2c14b"
          >
            CONSENT · AUDIT · CONTROL
          </text>
          <text
            x="400"
            y="144"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize="7"
            letterSpacing="1"
            fill="rgba(241,237,228,0.6)"
          >
            the mediated layer
          </text>
        </g>
        {/* THEIR AGENT (right) */}
        <g>
          <rect x="620" y="92" width="140" height="56" fill="#e8371f" />
          <text
            x="690"
            y="117"
            textAnchor="middle"
            fontFamily="Space Grotesk, sans-serif"
            fontWeight={500}
            fontSize="13"
            fill="#fff"
          >
            THEIR AGENT
          </text>
          <text
            x="690"
            y="134"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize="8"
            letterSpacing="1.2"
            fill="rgba(255,255,255,0.85)"
          >
            anyone on ARP
          </text>
          <circle cx="750" cy="100" r="3" fill="#f2c14b">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" repeatCount="indefinite" />
          </circle>
        </g>
        {/* horizontal connectors + center→bottom */}
        <g stroke="var(--arp-ink)" strokeWidth="1.2" fill="none">
          <line x1="180" y1="120" x2="288" y2="120" markerEnd="url(#arpHeroArrow)" />
          <line x1="510" y1="120" x2="618" y2="120" markerEnd="url(#arpHeroArrow)" />
          <line x1="400" y1="162" x2="400" y2="234" markerEnd="url(#arpHeroArrow)" />
        </g>
        <g
          fontFamily="JetBrains Mono, monospace"
          fontSize="7"
          letterSpacing="1.4"
          fill="var(--arp-muted)"
        >
          <text x="234" y="112" textAnchor="middle">‹ REQ ›</text>
          <text x="564" y="112" textAnchor="middle">‹ RESP ›</text>
        </g>
        {/* YOU APPROVE */}
        <g>
          <rect
            x="330"
            y="234"
            width="140"
            height="34"
            fill="#f2c14b"
            stroke="var(--arp-ink)"
            strokeWidth="1"
          />
          <text
            x="400"
            y="255"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize="9"
            letterSpacing="1.6"
            fill="var(--arp-ink)"
          >
            YOU · APPROVE
          </text>
        </g>
        {/* footer telemetry */}
        <g>
          <line x1="20" y1="338" x2="780" y2="338" stroke="var(--arp-ink)" strokeWidth="1" />
          <text
            x="20"
            y="354"
            fontFamily="JetBrains Mono, monospace"
            fontSize="8"
            letterSpacing="1.4"
            fill="var(--arp-muted)"
          >
            REQ_ID · 0x8F2A
          </text>
          <text
            x="780"
            y="354"
            textAnchor="end"
            fontFamily="JetBrains Mono, monospace"
            fontSize="8"
            letterSpacing="1.4"
            fill="var(--arp-muted)"
          >
            LATENCY · 42MS [TBD]
          </text>
        </g>
      </svg>
    </div>
  );
}

function AgentMosaic(): React.JSX.Element {
  const cells: Array<{ cls: string; label: string; big: string; span: string }> = [
    {
      cls: 'bg-signal-blue text-white',
      label: '// NETWORK',
      big: 'agents talk',
      span: 'col-span-6 md:col-span-3',
    },
    {
      cls: 'bg-paper text-ink',
      label: '// ROUTING',
      big: 'durable',
      span: 'col-span-6 md:col-span-2',
    },
    {
      cls: 'bg-signal-yellow text-ink',
      label: '// CONSENT',
      big: 'every call',
      span: 'col-span-6 md:col-span-2',
    },
    {
      cls: 'bg-signal-red text-white',
      label: '// REVOKE',
      big: 'one click',
      span: 'col-span-6 md:col-span-2',
    },
    {
      cls: 'bg-ink text-paper',
      label: '// MANAGED',
      big: 'live in minutes',
      span: 'col-span-12 md:col-span-3',
    },
  ];
  return (
    <div className="border-t border-rule grid grid-cols-12 relative min-h-[88px]">
      {cells.map((cell, idx) => (
        <div
          key={cell.label}
          className={`${cell.span} ${cell.cls} px-3 py-2.5 flex flex-col justify-between ${
            idx < cells.length - 1 ? 'border-r border-rule' : ''
          }`}
        >
          <span
            className={`font-mono text-kicker uppercase ${
              cell.cls.includes('bg-ink') ? 'text-signal-yellow' : 'opacity-90'
            }`}
          >
            {cell.label}
          </span>
          <span className="font-display font-medium text-[18px] leading-none tracking-[-0.01em]">
            {cell.big}
          </span>
        </div>
      ))}
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
  tone: 'paper' | 'yellow' | 'blue';
  label: string;
  num: string;
  title: string;
  body: string;
  footnote: string;
}): React.JSX.Element {
  const bgCls =
    tone === 'yellow'
      ? 'bg-signal-yellow text-ink'
      : tone === 'blue'
        ? 'bg-signal-blue text-white'
        : 'bg-paper text-ink';
  const mutedCls = tone === 'blue' ? 'text-white/90' : 'text-muted';
  const borderCls = tone === 'blue' ? 'border-white/60' : 'border-rule';
  return (
    <div className={`${bgCls} p-7 flex flex-col gap-3.5 min-h-[340px] relative`}>
      <div className={`font-mono text-kicker uppercase ${mutedCls}`}>{label}</div>
      <div className="font-display font-medium text-[6rem] leading-[0.9] tracking-[-0.04em]">
        {num}
      </div>
      <h5 className="font-display font-medium text-h4 max-w-[18ch]">{title}</h5>
      <p
        className={`text-body-sm ${
          tone === 'blue' ? 'text-white/90' : 'text-ink-2'
        }`}
      >
        {body}
      </p>
      <div
        className={`mt-auto h-[88px] border ${borderCls} px-3 py-2 font-mono text-kicker uppercase flex items-end`}
      >
        {footnote}
      </div>
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
  linkLabel,
  linkHref,
}: {
  tone?: 'paper' | 'yellow';
  letter: string;
  letterTone: 'blue' | 'red' | 'ink';
  kicker: string;
  title: string;
  body: string;
  linkLabel: string;
  linkHref: string;
}): React.JSX.Element {
  const bgCls = tone === 'yellow' ? 'bg-signal-yellow' : 'bg-paper';
  const markerBg =
    letterTone === 'blue'
      ? 'bg-signal-blue text-white'
      : letterTone === 'red'
        ? 'bg-signal-red text-white'
        : 'bg-ink text-paper';
  return (
    <div className={`${bgCls} p-7 flex flex-col gap-3.5 min-h-[320px] text-ink`}>
      <div className={`${markerBg} w-11 h-11 grid place-items-center font-display font-medium text-[22px]`}>
        {letter}
      </div>
      <div className="font-mono text-kicker uppercase text-muted">{kicker}</div>
      <h4 className="font-display font-medium text-h4 max-w-[14ch]">{title}</h4>
      <p className="text-body-sm text-ink-2 flex-1">{body}</p>
      <a
        href={linkHref}
        className="self-start font-mono text-[11px] tracking-[0.14em] uppercase border-b border-current pb-1"
      >
        {linkLabel} →
      </a>
    </div>
  );
}

function Control({
  tone = 'paper',
  num,
  title,
  body,
  footnote,
}: {
  tone?: 'paper' | 'blue';
  num: string;
  title: string;
  body: string;
  footnote: string;
}): React.JSX.Element {
  const bgCls = tone === 'blue' ? 'bg-signal-blue text-white' : 'bg-paper text-ink';
  const mutedCls = tone === 'blue' ? 'text-white/90' : 'text-muted';
  const shapeBorder = tone === 'blue' ? 'border-white/60' : 'border-rule';
  return (
    <div className={`${bgCls} p-6 flex flex-col gap-2.5 min-h-[260px]`}>
      <div className={`font-mono text-kicker uppercase ${mutedCls}`}>{num}</div>
      <h5 className="font-display font-medium text-h5">{title}</h5>
      <p className={`text-body-sm ${tone === 'blue' ? 'text-white/90' : 'text-ink-2'}`}>{body}</p>
      <div
        className={`mt-auto h-14 border ${shapeBorder} flex items-center justify-center font-mono text-kicker uppercase ${mutedCls}`}
      >
        {footnote}
      </div>
    </div>
  );
}

function Scenario({
  tone = 'paper',
  kicker,
  title,
  body,
  outcome,
}: {
  tone?: 'paper' | 'ink';
  kicker: string;
  title: string;
  body: string;
  outcome: string;
}): React.JSX.Element {
  const onInk = tone === 'ink';
  return (
    <div
      className={`p-7 flex flex-col gap-3.5 min-h-[340px] ${
        onInk ? 'bg-ink text-paper' : 'bg-paper text-ink'
      }`}
    >
      <div className={`font-mono text-kicker uppercase ${onInk ? 'text-paper/85' : 'text-muted'}`}>
        {kicker}
      </div>
      <h5 className="font-display font-medium text-h4 max-w-[20ch]">{title}</h5>
      <p className={`text-body-sm ${onInk ? 'text-paper/85' : 'text-ink-2'}`}>{body}</p>
      <div
        className={`mt-auto pt-3.5 border-t ${onInk ? 'border-paper/30' : 'border-rule/40'} font-mono text-kicker uppercase ${
          onInk ? 'text-signal-yellow' : 'text-signal-blue'
        }`}
      >
        → {outcome}
      </div>
    </div>
  );
}

function DevPanel({ className }: { className?: string }): React.JSX.Element {
  return (
    <div className={`border border-rule bg-ink text-paper ${className ?? ''}`}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-paper/20">
        <Dot tone="red" size={10} />
        <Dot tone="yellow" size={10} />
        <Dot tone="green" size={10} />
        <span className="ml-2 font-mono text-[11px] tracking-[0.08em] opacity-70">
          ~/agents/booking · sdk.connect.ts
        </span>
      </div>
      <div className="flex border-b border-paper/20 font-mono text-kicker uppercase tracking-[0.14em]">
        <span className="px-3.5 py-2.5 border-r border-paper/15 bg-signal-blue text-white">
          sdk.connect.ts
        </span>
        <span className="px-3.5 py-2.5 border-r border-paper/15 text-paper/60">
          policy.yaml
        </span>
        <span className="px-3.5 py-2.5 text-paper/60">audit.log</span>
      </div>
      <pre className="m-0 px-5 py-5 font-mono text-[12.5px] leading-[1.6] min-h-[360px] whitespace-pre-wrap">
        <CodeLine n="01">
          <span className="text-paper/45">// place your agent on the network</span>
        </CodeLine>
        <CodeLine n="02">
          <span className="text-signal-yellow">import</span>{' '}
          <span className="text-[#8ab6ff]">{'{ Agent }'}</span>{' '}
          <span className="text-signal-yellow">from</span>{' '}
          <span className="text-[#9ad07e]">&quot;@arp/run&quot;</span>;
        </CodeLine>
        <CodeLine n="03">&nbsp;</CodeLine>
        <CodeLine n="04">
          <span className="text-signal-yellow">const</span>{' '}
          <span className="text-[#8ab6ff]">me</span> ={' '}
          <span className="text-signal-yellow">new</span>{' '}
          <span className="text-signal-red">Agent</span>({'{'}
        </CodeLine>
        <CodeLine n="05">
          &nbsp;&nbsp;name: <span className="text-[#9ad07e]">&quot;booking.yours&quot;</span>,
        </CodeLine>
        <CodeLine n="06">
          &nbsp;&nbsp;policy: <span className="text-[#9ad07e]">&quot;./policy.yaml&quot;</span>,
        </CodeLine>
        <CodeLine n="07">{'});'}</CodeLine>
        <CodeLine n="08">&nbsp;</CodeLine>
        <CodeLine n="09">
          <span className="text-paper/45">// reach another agent on ARP</span>
        </CodeLine>
        <CodeLine n="10">
          <span className="text-signal-yellow">const</span>{' '}
          <span className="text-[#8ab6ff]">hotel</span> ={' '}
          <span className="text-signal-yellow">await</span>{' '}
          <span className="text-[#8ab6ff]">me</span>.
          <span className="text-signal-red">connect</span>(
          <span className="text-[#9ad07e]">&quot;hotel.brand&quot;</span>);
        </CodeLine>
        <CodeLine n="11">&nbsp;</CodeLine>
        <CodeLine n="12">
          <span className="text-signal-yellow">const</span>{' '}
          <span className="text-[#8ab6ff]">booking</span> ={' '}
          <span className="text-signal-yellow">await</span>{' '}
          <span className="text-[#8ab6ff]">hotel</span>.
          <span className="text-signal-red">request</span>({'{'}
        </CodeLine>
        <CodeLine n="13">
          &nbsp;&nbsp;intent: <span className="text-[#9ad07e]">&quot;reserve&quot;</span>, dates: [...]
        </CodeLine>
        <CodeLine n="14">{'});'}</CodeLine>
        <CodeLine n="15">&nbsp;</CodeLine>
        <CodeLine n="16">
          <span className="text-paper/45">// every step is authorized & logged.</span>
        </CodeLine>
        <CodeLine n="17">
          <span className="text-paper/45">// one call. no glue.</span>
        </CodeLine>
      </pre>
    </div>
  );
}

function CodeLine({ n, children }: { n: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="grid grid-cols-[28px_1fr] gap-2.5">
      <span className="text-paper/35 text-right">{n}</span>
      <span>{children}</span>
    </span>
  );
}
