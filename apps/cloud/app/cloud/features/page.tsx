import type * as React from 'react';
import {
  ButtonLink,
  CardMatrix,
  Container,
  Emphasis,
  EyebrowTag,
  FeatureCard,
  HeroCTA,
  HeroLine,
  HeroMeta,
  HeroSub,
  HeroTitle,
  IconShape,
  PlateHead,
  Section,
} from '@/components/ui';

export const metadata = {
  title: 'Platform · ARP Cloud',
};

export default function FeaturesPage(): React.JSX.Element {
  return (
    <>
      <Section tone="paper" spacing="hero" rule={false} as="header">
        <Container>
          <HeroMeta
            cells={[
              { label: 'PLATE', value: 'P.00 / PLATFORM' },
              { label: 'CAPABILITIES', value: 'IDENTITY · CONSENT · AUDIT' },
              { label: 'RUNTIME', value: 'MANAGED · MULTI-TENANT' },
              { label: 'STATUS', value: 'OPERATIONAL' },
            ]}
          />
          <div className="grid grid-cols-12 gap-6 pb-12">
            <div className="col-span-12 lg:col-span-8 flex flex-col">
              <EyebrowTag className="mb-7">PLATFORM · ARP CLOUD</EyebrowTag>
              <HeroTitle>
                <HeroLine>Everything your agent needs</HeroLine>
                <HeroLine>
                  to <Emphasis tone="blue">reach the world</Emphasis>.
                </HeroLine>
              </HeroTitle>
              <HeroSub>
                Identity, consent, audit, billing, observability — all of it managed, all of it
                wired in. You plug your agent in; we handle the rest.
              </HeroSub>
              <HeroCTA>
                <ButtonLink href="/signup" variant="primary" size="lg" arrow="up-right">
                  Start free
                </ButtonLink>
                <ButtonLink href="/pricing" variant="default" size="lg" arrow>
                  See pricing
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
            kicker="// CAPABILITIES"
            title={
              <>
                The managed runtime. <Emphasis tone="red">In plain English.</Emphasis>
              </>
            }
          />
          <CardMatrix className="grid-cols-1 md:grid-cols-3">
            <FeatureCard
              idx="F.01 / 09"
              category="IDENTITY"
              title="Durable agent identity"
              description="Every agent gets a permanent address on the network. Rotate, recover, revoke — all without losing the identity."
              tone="paper"
              icon={<IconShape variant="frame" color="ink" accent="blue" />}
            />
            <FeatureCard
              idx="F.02 / 09"
              category="CONSENT"
              title="Consent + approval flow"
              description="Approval gates fire on high-risk scopes. One-tap approve or deny from your dashboard, desktop, or mobile."
              tone="yellow"
              icon={<IconShape variant="diamond" color="ink" accent="red" />}
            />
            <FeatureCard
              idx="F.03 / 09"
              category="AUDIT"
              title="Tamper-evident audit"
              description="Hash-chained log of every decision. Exportable. Verifiable offline — without trusting ARP Cloud."
              tone="blue"
              icon={<IconShape variant="blades" color="currentColor" accent="yellow" />}
            />
            <FeatureCard
              idx="F.04 / 09"
              category="POLICY"
              title="Cedar policies, ARP extensions"
              description="Fifty pre-built scope templates. Write your own policies in a typed language with obligations."
              tone="paper"
              icon={<IconShape variant="grid9" color="ink" accent="blue" />}
            />
            <FeatureCard
              idx="F.05 / 09"
              category="OBLIGATIONS"
              title="Per-scope caps + TTLs"
              description="Monthly spend ceilings, per-counterparty caps, reversibility windows — enforced by the runtime."
              tone="red"
              icon={<IconShape variant="bars" color="currentColor" accent="yellow" />}
            />
            <FeatureCard
              idx="F.06 / 09"
              category="TRANSPORT"
              title="Signed end-to-end"
              description="Every message is signed and verifiable. Transport is swappable — no runtime change when the wire format evolves."
              tone="paper"
              icon={<IconShape variant="stripe" color="ink" accent="blue" />}
            />
            <FeatureCard
              idx="F.07 / 09"
              category="MULTI-TENANT"
              title="Isolated workspaces"
              description="Tenant isolation baked in. Five-by-four adversarial scenarios run clean on every release."
              tone="ink"
              icon={<IconShape variant="diamond" color="currentColor" accent="yellow" />}
            />
            <FeatureCard
              idx="F.08 / 09"
              category="BILLING"
              title="Usage-based, Stripe-backed"
              description="Plans cap at usage soft-ceilings. Stripe webhook idempotent. Receipts + invoicing out of the box."
              tone="paper"
              icon={<IconShape variant="grid9" color="ink" accent="red" />}
            />
            <FeatureCard
              idx="F.09 / 09"
              category="REVOCATION"
              title="Instant cut-off"
              description="One click revokes a connection everywhere. The counterparty is told, not tricked."
              tone="yellow"
              icon={<IconShape variant="revoke" color="ink" accent="red" />}
            />
          </CardMatrix>
        </Container>
      </Section>

      <Section id="controls">
        <Container>
          <PlateHead
            plateNum="P.02"
            kicker="// BUILT_IN_CONTROLS"
            title={
              <>
                Safety isn&apos;t a feature. <Emphasis tone="red">It&apos;s the foundation.</Emphasis>
              </>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-rule border border-rule">
            {[
              {
                tone: 'blue' as const,
                num: 'C.01',
                title: 'Approval required.',
                body: 'Nothing happens without the owner saying yes. You decide the rules; we enforce them.',
                footnote: 'CONSENT · GATE',
              },
              {
                tone: 'paper' as const,
                num: 'C.02',
                title: 'Reversible by design.',
                body: 'Every access is revocable. Every connection is temporary unless you extend it.',
                footnote: 'TTL · BOUNDED',
              },
              {
                tone: 'paper' as const,
                num: 'C.03',
                title: 'Scoped by risk.',
                body: 'Low-risk actions fly through. High-risk actions always ask. Set the threshold yourself.',
                footnote: 'POLICY · RULES',
              },
              {
                tone: 'paper' as const,
                num: 'C.04',
                title: 'Tamper-evident logs.',
                body: 'Activity logs are immutable and exportable. When something happens, there is a record.',
                footnote: 'AUDIT · EXPORT',
              },
            ].map((c) => {
              const bgCls = c.tone === 'blue' ? 'bg-signal-blue text-white' : 'bg-paper text-ink';
              const mutedCls = c.tone === 'blue' ? 'text-white/90' : 'text-muted';
              return (
                <div key={c.num} className={`${bgCls} p-6 flex flex-col gap-2.5 min-h-[260px]`}>
                  <div className={`font-mono text-kicker uppercase ${mutedCls}`}>{c.num}</div>
                  <h5 className="font-display font-medium text-h5">{c.title}</h5>
                  <p className={`text-body-sm ${c.tone === 'blue' ? 'text-white/90' : 'text-ink-2'}`}>
                    {c.body}
                  </p>
                  <div
                    className={`mt-auto h-14 border flex items-center justify-center font-mono text-kicker uppercase ${mutedCls} ${
                      c.tone === 'blue' ? 'border-white/60' : 'border-rule'
                    }`}
                  >
                    {c.footnote}
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      </Section>

      <Section id="developers">
        <Container>
          <PlateHead
            plateNum="P.03"
            kicker="// DEVELOPERS"
            title={
              <>
                First-class SDKs. <Emphasis tone="blue">Drop-in adapters.</Emphasis>
              </>
            }
          />
          <p className="text-body-lg text-ink-2 max-w-[64ch]">
            Type-safe SDKs for TypeScript and Python. Five first-party framework adapters.
            Authoring CLI that scaffolds new ones. Local dev mode that runs the full stack
            against PGlite. [TBD — final list and per-adapter links at Phase 9.]
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="#" variant="primary" arrow>
              Read the docs [TBD]
            </ButtonLink>
            <ButtonLink
              href="https://github.com/KybernesisAI/arp"
              variant="default"
              arrow="up-right"
            >
              Browse SDKs
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
