import type * as React from 'react';
import {
  ButtonLink,
  Container,
  Emphasis,
  EyebrowTag,
  HeroCTA,
  HeroLine,
  HeroMeta,
  HeroSub,
  HeroTitle,
  PlateHead,
  Section,
} from '@/components/ui';

export const metadata = {
  title: 'About · ARP',
};

export default function AboutPage(): React.JSX.Element {
  return (
    <>
      <Section tone="paper" spacing="hero" rule={false} as="header">
        <Container>
          <HeroMeta
            cells={[
              { label: 'PLATE', value: 'P.00 / ABOUT' },
              { label: 'MAINTAINER', value: 'KYBERNESIS' },
              { label: 'COLLAB', value: 'HEADLESS DOMAINS' },
              { label: 'STATUS', value: 'OPEN · SHIPPING' },
            ]}
          />
          <div className="grid grid-cols-12 gap-6 pb-12">
            <div className="col-span-12 lg:col-span-8 flex flex-col">
              <EyebrowTag className="mb-7">ABOUT · THE PROJECT</EyebrowTag>
              <HeroTitle>
                <HeroLine>An open protocol,</HeroLine>
                <HeroLine>
                  built <Emphasis tone="blue">in the open</Emphasis>.
                </HeroLine>
              </HeroTitle>
              <HeroSub>
                [TBD — mission statement. Why ARP exists, who it is for, how it relates to the
                wider agent ecosystem.]
              </HeroSub>
              <HeroCTA>
                <ButtonLink
                  href="https://github.com/KybernesisAI/arp"
                  variant="primary"
                  arrow="up-right"
                >
                  GitHub
                </ButtonLink>
                <ButtonLink href="/architecture" variant="default" arrow>
                  Architecture
                </ButtonLink>
              </HeroCTA>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <PlateHead
            plateNum="P.01"
            kicker="// APPROACH"
            title={
              <>
                How we build. <Emphasis tone="red">And how we do not.</Emphasis>
              </>
            }
          />
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-7 space-y-5">
              <p className="text-body-lg text-ink-2">
                [TBD — paragraph on how the protocol is governed, how changes are proposed, how
                the reference implementation tracks the spec.]
              </p>
              <p className="text-body-lg text-ink-2">
                [TBD — paragraph on the relationship with Handshake .agent, Headless Domains,
                and the rest of the agent ecosystem.]
              </p>
            </div>
            <div className="col-span-12 md:col-span-5 bg-paper-2 border border-rule p-7">
              <div className="font-mono text-kicker uppercase text-muted mb-3">
                // PRINCIPLES
              </div>
              <ul className="list-none p-0 m-0 space-y-3 font-mono text-[13px] leading-[1.5]">
                {[
                  'OPEN SPEC, OPEN REFERENCE',
                  'RFCS BEFORE MAJOR CHANGES',
                  'TESTKIT GATES SHIPPING',
                  'NO VENDOR LOCK-IN',
                  'AUDIT CHAIN ON EVERY DECISION',
                ].map((p) => (
                  <li key={p} className="flex gap-3">
                    <span className="text-signal-blue">›</span>
                    <span className="uppercase tracking-[0.06em] text-ink">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <PlateHead
            plateNum="P.02"
            kicker="// MAINTAINERS"
            title={<>Who builds and runs ARP.</>}
          />
          <p className="text-body-lg text-ink-2 max-w-[64ch]">
            [TBD — team roster, contributors, governance model. This section fills out at
            Phase 9 when community contribution flow is live.]
          </p>
        </Container>
      </Section>
    </>
  );
}
