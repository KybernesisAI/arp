import type * as React from 'react';
import {
  ButtonLink,
  CardMatrix,
  Container,
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
  Section,
  Underline,
} from '@/components/ui';

export default function ProjectLandingPage(): React.JSX.Element {
  return (
    <>
      {/* HERO */}
      <Section tone="paper" spacing="hero" rule={false} as="header" className="overflow-hidden">
        <Container>
          <HeroMeta
            cells={[
              { label: 'PLATE', value: 'P.00 / PROJECT' },
              { label: 'EDITION', value: '2026 · Q2 · V0.1' },
              { label: 'LICENSE', value: 'MIT · OPEN SOURCE' },
              { label: 'STATUS', value: 'REFERENCE · SHIPPING' },
            ]}
          />
          <div className="grid grid-cols-12 gap-6 pb-12">
            <div className="col-span-12 lg:col-span-7 flex flex-col">
              <EyebrowTag dotTone="yellow" className="mb-7">
                ARP · THE OPEN PROTOCOL
              </EyebrowTag>
              <HeroTitle>
                <HeroLine>The open</HeroLine>
                <HeroLine>
                  protocol{' '}
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
                ARP is the protocol that lets them do it safely. No platform owns the network.
                No vendor owns your agents.
              </HeroSub>
              <HeroCTA>
                <ButtonLink
                  href="https://github.com/KybernesisAI/arp"
                  variant="primary"
                  size="lg"
                  arrow="up-right"
                >
                  View on GitHub
                </ButtonLink>
                <ButtonLink href="/architecture" variant="default" size="lg" arrow>
                  Read the architecture
                </ButtonLink>
              </HeroCTA>
              <HeroTrust
                items={[
                  'OPEN PROTOCOL',
                  'YOURS TO RUN',
                  'BUILT IN PUBLIC',
                ]}
              />
            </div>
            <div className="hidden lg:flex col-span-5 flex-col border border-rule bg-paper">
              <div className="px-3.5 py-2.5 border-b border-rule font-mono text-kicker uppercase text-muted flex justify-between">
                <span>
                  <b className="text-ink font-medium">FIG&nbsp;A</b> · SEVEN-LAYER STACK
                </span>
                <span>V0.1</span>
              </div>
              <ol className="flex-1 list-none p-0 m-0 flex flex-col">
                {[
                  { num: '07', label: 'RUNTIME', sub: 'Reference implementation' },
                  { num: '06', label: 'AUDIT', sub: 'Tamper-evident chain' },
                  { num: '05', label: 'OBLIGATIONS', sub: 'Caps · windows · TTLs' },
                  { num: '04', label: 'POLICY', sub: 'Cedar + ARP extensions', accent: true },
                  { num: '03', label: 'PAIRING', sub: 'Signed handshake' },
                  { num: '02', label: 'TRANSPORT', sub: 'Signed envelopes' },
                  { num: '01', label: 'IDENTITY', sub: 'DIDs + .agent domains' },
                ].map(({ num, label, sub, accent }) => (
                  <li
                    key={num}
                    className={`group relative flex flex-1 items-stretch gap-4 pl-4 pr-4 border-b border-rule last:border-b-0 ${
                      accent ? 'bg-signal-yellow/40' : ''
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`block w-[3px] self-stretch ${
                        accent ? 'bg-signal-red' : 'bg-rule'
                      }`}
                    />
                    <span className="flex flex-1 items-center gap-4 py-3.5">
                      <span className="font-mono text-kicker uppercase text-muted w-6 tabular-nums">
                        {num}
                      </span>
                      <span className="flex-1 flex flex-col gap-1">
                        <span className="font-display font-medium text-ink text-[0.95rem] leading-none tracking-[-0.01em]">
                          {label}
                        </span>
                        <span className="font-mono text-[0.65rem] uppercase text-muted leading-none">
                          {sub}
                        </span>
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="border-t border-rule px-3.5 py-2.5 font-mono text-kicker uppercase text-muted flex justify-between">
                <span>STACK · 07 · MIT</span>
                <span className="text-signal-blue">↗</span>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* HOW IT WORKS */}
      <Section id="how-it-works">
        <Container>
          <PlateHead
            plateNum="P.01"
            kicker="// HOW_IT_WORKS"
            title={
              <>
                Three moves. <Emphasis tone="blue">No glue.</Emphasis>
              </>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            {[
              {
                tone: 'yellow',
                num: '01',
                title: 'Your agent gets a home.',
                body: 'Claim a .agent domain, publish a small identity document, and your agent is addressable on the open internet.',
              },
              {
                tone: 'paper',
                num: '02',
                title: 'It connects to other agents.',
                body: 'Standard pairing and scoped permissions mean agents can work together without custom glue code every time.',
              },
              {
                tone: 'blue',
                num: '03',
                title: 'You stay in control.',
                body: 'Every action runs against a policy you approved. Every decision is logged. Revocation is instant.',
              },
            ].map((step) => {
              const bgCls =
                step.tone === 'yellow'
                  ? 'bg-signal-yellow text-ink'
                  : step.tone === 'blue'
                    ? 'bg-signal-blue text-white'
                    : 'bg-paper text-ink';
              const mutedCls = step.tone === 'blue' ? 'text-white/85' : 'text-muted';
              return (
                <div key={step.num} className={`${bgCls} p-7 min-h-[320px] flex flex-col gap-3.5`}>
                  <div className={`font-mono text-kicker uppercase ${mutedCls}`}>
                    STEP {step.num}
                  </div>
                  <div className="font-display font-medium text-[6rem] leading-[0.9] tracking-[-0.04em]">
                    {step.num}
                  </div>
                  <h5 className="font-display font-medium text-h4 max-w-[18ch]">
                    {step.title}
                  </h5>
                  <p
                    className={`text-body-sm ${
                      step.tone === 'blue' ? 'text-white/90' : 'text-ink-2'
                    }`}
                  >
                    {step.body}
                  </p>
                </div>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* OPEN SOURCE + WHAT SHIPS */}
      <Section>
        <Container>
          <PlateHead
            plateNum="P.02"
            kicker="// OPEN_SOURCE"
            title={
              <>
                Open protocol. <Emphasis tone="red">Production reference.</Emphasis>
              </>
            }
          />
          <Grid12 className="gap-4 items-start">
            <div className="col-span-12 md:col-span-5 flex flex-col gap-4">
              <h3 className="text-display-md font-display font-medium leading-[1.02] tracking-[-0.02em] max-w-[18ch]">
                The spec, the runtime, the testkit. All in one repo.
              </h3>
              <p className="text-body-lg text-ink-2 max-w-[50ch]">
                Everything is MIT-licensed. The reference implementation in TypeScript is the
                same one that powers ARP Cloud. Self-host it or use the hosted runtime — your call.
              </p>
              <div className="flex flex-wrap gap-2.5 pt-2">
                <ButtonLink
                  href="https://github.com/KybernesisAI/arp"
                  variant="primary"
                  arrow="up-right"
                >
                  Browse the repo
                </ButtonLink>
                <ButtonLink
                  href="https://github.com/KybernesisAI/arp/blob/main/LICENSE"
                  variant="default"
                  arrow
                >
                  MIT license
                </ButtonLink>
              </div>
            </div>
            <CardMatrix className="col-span-12 md:col-span-7 grid-cols-1 md:grid-cols-2">
              <FeatureCard
                idx="O.01 / 03"
                category="SPEC"
                title="JSON Schemas + 50 scopes"
                description="Every payload, every scope template, validated at authoring time. Fifty pre-built scopes cover the common agent actions."
                tone="paper"
                icon={<IconShape variant="frame" color="ink" accent="blue" />}
              />
              <FeatureCard
                idx="O.02 / 03"
                category="RUNTIME"
                title="Reference runtime"
                description="PDP, transport, registry, audit chain, TLS — the full seven-layer stack, written to pass its own testkit."
                tone="yellow"
                icon={<IconShape variant="grid9" color="ink" accent="red" />}
              />
              <FeatureCard
                idx="O.03 / 03"
                category="TESTKIT"
                title="Compliance probes"
                description="Eight automated probes. Green across the board means your implementation is spec-compliant. No committee, no certifications — just tests."
                tone="ink"
                icon={<IconShape variant="bars" color="currentColor" accent="yellow" />}
              />
              <FeatureCard
                idx="O.04 / 03"
                category="ADAPTERS"
                title="Five first-party adapters"
                description="KyberBot, OpenClaw, Hermes, NanoClaw, LangGraph. Authoring CLI for the rest."
                tone="red"
                icon={<IconShape variant="diamond" color="currentColor" accent="yellow" />}
              />
            </CardMatrix>
          </Grid12>
        </Container>
      </Section>

      {/* ARCHITECTURE */}
      <Section>
        <Container>
          <PlateHead
            plateNum="P.03"
            kicker="// ARCHITECTURE"
            title={
              <>
                Seven layers. <Emphasis tone="blue">Each one swappable.</Emphasis>
              </>
            }
          />
          <CardMatrix className="grid-cols-1 md:grid-cols-3">
            {[
              {
                idx: 'L.01 / 07',
                category: 'IDENTITY',
                title: 'DIDs and .agent domains',
                description:
                  'Agents are addressed by .agent domains. Owners are attributes, never parents.',
              },
              {
                idx: 'L.02 / 07',
                category: 'TRANSPORT',
                title: 'Signed envelopes',
                description:
                  'DIDComm-based today with one clean seam — the transport interface — for swapping to A2A later.',
              },
              {
                idx: 'L.03 / 07',
                category: 'PAIRING',
                title: 'First-contact handshake',
                description:
                  'Well-known documents, signed handshakes, tamper rejection, cryptographic pinning.',
              },
              {
                idx: 'L.04 / 07',
                category: 'POLICY',
                title: 'Cedar with ARP extensions',
                description:
                  'Integer cents, epoch-ms, scope obligations — no floats, no ISO strings, no ambiguity.',
              },
              {
                idx: 'L.05 / 07',
                category: 'OBLIGATIONS',
                title: 'Approval + reversibility',
                description:
                  'Per-scope caps, approval windows, reversibility TTLs — tracked through every decision.',
              },
              {
                idx: 'L.06 / 07',
                category: 'AUDIT',
                title: 'Tamper-evident chain',
                description:
                  'Hash chain over every decision, exportable, verifiable without trusting the runtime.',
              },
            ].map((layer) => (
              <FeatureCard
                key={layer.idx}
                idx={layer.idx}
                category={layer.category}
                title={layer.title}
                description={layer.description}
                tone="paper"
              />
            ))}
          </CardMatrix>
          <div className="mt-6">
            <ButtonLink href="/architecture" variant="default" arrow>
              Full architecture overview
            </ButtonLink>
          </div>
        </Container>
      </Section>

      {/* CHANGES */}
      <Section>
        <Container>
          <PlateHead
            plateNum="P.04"
            kicker="// RECENT_CHANGES"
            title={
              <>
                Protocol versions and <Emphasis tone="red">notable releases</Emphasis>.
              </>
            }
          />
          <ul className="list-none p-0 m-0 border-t border-rule">
            {[
              {
                version: 'v0.1 SPEC',
                tag: '[TBD]',
                body: 'Initial published spec. All seven layers. 50 scope templates.',
              },
              {
                version: 'REFERENCE RUNTIME',
                tag: 'MERGED',
                body: 'TypeScript reference implementation. Eight-probe testkit green.',
              },
              {
                version: 'V2.1 TLD INTEGRATION',
                tag: 'LANDED',
                body: 'Browser-held primary identity. Terminology sweep. Registrar integration spec v2.1 shipped.',
              },
            ].map((entry) => (
              <li
                key={entry.version}
                className="grid grid-cols-12 gap-4 py-4 border-b border-rule items-baseline"
              >
                <div className="col-span-6 md:col-span-3 font-mono text-kicker uppercase text-ink">
                  {entry.version}
                </div>
                <div className="col-span-6 md:col-span-2 font-mono text-kicker uppercase text-signal-blue">
                  {entry.tag}
                </div>
                <div className="col-span-12 md:col-span-7 text-body-sm text-ink-2">
                  {entry.body}
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* INTEGRATION PARTNERS */}
      <Section>
        <Container>
          <PlateHead
            plateNum="P.05"
            kicker="// PARTNERS"
            title={
              <>
                Adapters and registrars <Emphasis tone="blue">shipping against v0.1</Emphasis>.
              </>
            }
          />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-0 border-y border-rule">
            {['KYBERBOT', 'OPENCLAW', 'HERMES', 'NANOCLAW', 'LANGGRAPH'].map((partner, idx) => (
              <div
                key={partner}
                className={`py-10 px-4 font-display font-medium text-h5 tracking-[-0.01em] text-muted text-center ${
                  idx < 4 ? 'md:border-r md:border-rule' : ''
                }`}
              >
                [{partner}]
              </div>
            ))}
          </div>
          <p className="mt-6 font-mono text-kicker uppercase text-muted">
            [TBD — real logos land at Phase 9]
          </p>
        </Container>
      </Section>

      {/* COMMUNITY */}
      <Section tone="ink">
        <Container>
          <div className="font-mono text-kicker uppercase text-paper/60 mb-5">
            <b className="text-signal-yellow font-medium">P.06 // COMMUNITY</b> &nbsp;——&nbsp;
            work happens in the open
          </div>
          <h2 className="font-display font-medium text-display-md leading-[1.0] tracking-[-0.02em] max-w-[22ch] m-0">
            The protocol evolves in <span className="text-signal-yellow">public</span>.
          </h2>
          <p className="mt-5 text-body-lg text-paper/80 max-w-[56ch]">
            Discussion, proposals, bug reports — the work happens on GitHub. [TBD — RFC workflow link]
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <ButtonLink
              href="https://github.com/KybernesisAI/arp/discussions"
              variant="primary"
              size="lg"
              arrow="up-right"
            >
              GitHub Discussions
            </ButtonLink>
            <ButtonLink href="https://cloud.arp.run" variant="inverse" size="lg" arrow>
              Try the hosted runtime
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
