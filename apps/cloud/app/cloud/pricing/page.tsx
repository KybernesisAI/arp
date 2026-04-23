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
  PricingCard,
  Section,
} from '@/components/ui';

export const metadata = {
  title: 'Pricing · ARP Cloud',
};

export default function PricingPage(): React.JSX.Element {
  return (
    <>
      <Section tone="paper" spacing="hero" rule={false} as="header">
        <Container>
          <HeroMeta
            cells={[
              { label: 'PLATE', value: 'P.00 / PRICING' },
              { label: 'EDITION', value: '2026 · Q2 · PREVIEW' },
              { label: 'BILLING', value: 'STRIPE · USD' },
              { label: 'STATUS', value: 'OPERATIONAL' },
            ]}
          />
          <div className="grid grid-cols-12 gap-6 pb-12">
            <div className="col-span-12 lg:col-span-8 flex flex-col">
              <EyebrowTag dotTone="yellow" className="mb-7">
                PRICING · FREE TO START
              </EyebrowTag>
              <HeroTitle>
                <HeroLine>Free tier.</HeroLine>
                <HeroLine>
                  Usage-based <Emphasis tone="blue">after that</Emphasis>.
                </HeroLine>
              </HeroTitle>
              <HeroSub>
                Pricing below is placeholder until public launch. Numbers marked{' '}
                <code className="font-mono text-ink">{`{{TBD}}`}</code> will be replaced with the
                final values at Phase 9.
              </HeroSub>
              <HeroCTA>
                <ButtonLink href="/signup" variant="primary" size="lg" arrow="up-right">
                  Start free
                </ButtonLink>
                <ButtonLink href="/features" variant="default" size="lg" arrow>
                  Platform features
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
            kicker="// TIERS"
            title={<>Three tiers. Pick the one that fits.</>}
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
                'Browser-held identity',
              ]}
              ctaLabel="Start free"
              ctaHref="/signup"
              footnote="NO CREDIT CARD REQUIRED"
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
                'SLA · [TBD]',
              ]}
              ctaLabel="Start 14-day trial"
              ctaHref="/signup?plan=pro"
              highlighted
              popularLabel="MOST POPULAR"
              footnote="BILLED MONTHLY · CANCEL ANYTIME"
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
                'Dedicated runtime region',
              ]}
              ctaLabel="Talk to us [TBD]"
              ctaHref="#"
              footnote="VOLUME + COMPLIANCE"
            />
          </div>
          <div className="mt-8 font-mono text-kicker uppercase text-muted">
            <b className="text-ink font-medium">USAGE-BASED AFTER FREE TIER.</b>{' '}
            &nbsp;·&nbsp; NO PER-SEAT FEES. &nbsp;·&nbsp; NO PER-INTEGRATION FEES. [TBD]
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <PlateHead
            plateNum="P.02"
            kicker="// FAQ"
            title={
              <>
                Questions we get <Emphasis tone="red">every week</Emphasis>.
              </>
            }
          />
          <dl className="max-w-[72ch] space-y-8">
            {faqs.map((faq) => (
              <div key={faq.question} className="border-t border-rule pt-5">
                <dt className="font-display font-medium text-h4">{faq.question}</dt>
                <dd className="mt-2 text-body-lg text-ink-2">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </Section>

      <Section tone="ink">
        <Container>
          <div className="font-mono text-kicker uppercase text-paper/60 mb-5">
            <b className="text-signal-yellow font-medium">P.03 // GET_STARTED</b>
          </div>
          <h2 className="font-display font-medium text-display-md leading-[1.0] tracking-[-0.02em] max-w-[22ch] m-0">
            Free tier, no card, <span className="text-signal-yellow">three minutes</span> to live.
          </h2>
          <div className="mt-10 flex flex-wrap gap-3">
            <ButtonLink href="/signup" variant="primary" size="lg" arrow="up-right">
              Start free
            </ButtonLink>
            <ButtonLink href="/features" variant="inverse" size="lg" arrow>
              Tour the platform
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}

const faqs = [
  {
    question: 'What actually runs where?',
    answer:
      '[TBD] Your agent runs wherever it ran before. ARP Cloud handles identity, messaging, permissions, and audit — nothing else. Your framework code stays yours.',
  },
  {
    question: 'Do you ever see our keys?',
    answer:
      '[TBD] No. Your identity is generated in your browser and never transmitted to us. Every signed action is verified with the public half only.',
  },
  {
    question: 'Can I self-host instead?',
    answer:
      '[TBD] Yes. ARP is MIT-licensed and the reference runtime is shipped in the open-source repo. Cloud is the convenient option; sovereign is the reference option.',
  },
  {
    question: 'How does billing work?',
    answer:
      '[TBD] Monthly via Stripe. Plans are usage-soft-capped — we warn before you hit the next tier.',
  },
];
