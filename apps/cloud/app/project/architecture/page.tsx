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
  PlateHead,
  Section,
  Underline,
} from '@/components/ui';

export const metadata = {
  title: 'Architecture · ARP',
};

const layers = [
  {
    idx: 'L.01 / 07',
    category: 'IDENTITY',
    title: 'DIDs and .agent domains',
    description:
      'Agents are addressed by .agent domains. Owners are attributes, never parents. did:key is the primary principal identity for browser-held owners; did:web for sovereign or cloud-managed principals.',
  },
  {
    idx: 'L.02 / 07',
    category: 'TRANSPORT',
    title: 'Signed envelopes',
    description:
      'DIDComm-based today with one clean seam — the Transport interface — for swapping to A2A later without touching runtime code.',
  },
  {
    idx: 'L.03 / 07',
    category: 'PAIRING',
    title: 'First-contact handshake',
    description:
      'Well-known documents, signed handshakes, tamper rejection, and cryptographic pinning of the agent-side TLS cert.',
  },
  {
    idx: 'L.04 / 07',
    category: 'POLICY',
    title: 'Cedar with ARP extensions',
    description:
      'Integer cents, epoch-ms, scope obligations — no floats, no ISO strings, no ambiguity. Fifty pre-built scopes in the catalog.',
  },
  {
    idx: 'L.05 / 07',
    category: 'OBLIGATIONS',
    title: 'Approval + reversibility',
    description:
      'Per-scope caps, approval windows, reversibility TTLs. Every decision threads its obligations into the audit entry and the outbound reply.',
  },
  {
    idx: 'L.06 / 07',
    category: 'AUDIT',
    title: 'Tamper-evident chain',
    description:
      'Hash chain over every decision. Exportable. Verifiable offline — no need to trust the runtime that produced it.',
  },
  {
    idx: 'L.07 / 07',
    category: 'RUNTIME',
    title: 'Reference implementation',
    description:
      'Lightweight glue in TypeScript. Same runtime ships hosted on ARP Cloud and self-hosted in the reference sidecar.',
  },
];

export default function ArchitecturePage(): React.JSX.Element {
  return (
    <>
      <Section tone="paper" spacing="hero" rule={false} as="header">
        <Container>
          <HeroMeta
            cells={[
              { label: 'PLATE', value: 'P.00 / ARCHITECTURE' },
              { label: 'SPEC', value: 'V0.1' },
              { label: 'LAYERS', value: '7 · EACH SWAPPABLE' },
              { label: 'STATUS', value: 'REFERENCE · SHIPPING' },
            ]}
          />
          <div className="grid grid-cols-12 gap-6 pb-12">
            <div className="col-span-12 lg:col-span-8 flex flex-col">
              <EyebrowTag className="mb-7">ARCHITECTURE · V0.1</EyebrowTag>
              <HeroTitle>
                <HeroLine>Seven layers.</HeroLine>
                <HeroLine>
                  Each one <Underline>swappable</Underline>.
                </HeroLine>
              </HeroTitle>
              <HeroSub>
                [TBD — overview paragraph. Full detail lives in the spec once it lands at
                spec.arp.run. In the meantime, the reference runtime in the monorepo is the
                authoritative implementation.]
              </HeroSub>
              <HeroCTA>
                <ButtonLink href="#" variant="primary" arrow>
                  Read the full spec [TBD]
                </ButtonLink>
                <ButtonLink
                  href="https://github.com/KybernesisAI/arp"
                  variant="default"
                  arrow="up-right"
                >
                  Source on GitHub
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
            kicker="// LAYERS"
            title={
              <>
                The stack at a glance. <Emphasis tone="blue">Top to bottom.</Emphasis>
              </>
            }
          />
          <CardMatrix className="grid-cols-1 md:grid-cols-3">
            {layers.slice(0, 6).map((layer) => (
              <FeatureCard
                key={layer.idx}
                idx={layer.idx}
                category={layer.category}
                title={layer.title}
                description={layer.description}
                tone="paper"
              />
            ))}
            <FeatureCard
              idx={layers[6]!.idx}
              category={layers[6]!.category}
              title={layers[6]!.title}
              description={layers[6]!.description}
              tone="blue"
              className="col-span-1 md:col-span-3"
            />
          </CardMatrix>
        </Container>
      </Section>

      <Section>
        <Container>
          <PlateHead
            plateNum="P.02"
            kicker="// DIAGRAMS"
            title={
              <>
                What it looks like <Emphasis tone="red">in motion</Emphasis>.
              </>
            }
          />
          <p className="text-body-lg text-ink-2 max-w-[64ch]">
            [TBD — architectural diagrams. Probably four: identity, pairing, policy
            evaluation, and audit chain. These land when the spec site goes live at
            spec.arp.run.]
          </p>
        </Container>
      </Section>
    </>
  );
}
