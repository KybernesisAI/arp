import Link from 'next/link';
import type * as React from 'react';

import { cn } from '@/lib/cn';

export default function LandingPage(): React.JSX.Element {
  return (
    <>
      {/* Hero */}
      <section className="border-t border-rule">
        <div className="mx-auto grid w-full max-w-page grid-cols-12 gap-4 px-8 py-24">
          <div className="col-span-12 flex items-center gap-3 md:col-span-12">
            <span className="inline-block h-2 w-2 animate-pulse bg-signal-red" />
            <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
              SPEC v0.1 DRAFT — PUBLIC REVIEW
            </span>
          </div>

          <h1 className="col-span-12 mt-10 font-display text-display-lg leading-[1.02] tracking-[-0.02em] text-ink md:col-span-10 md:mt-12 lg:col-span-9">
            A protocol for how autonomous agents{' '}
            <span className="arp-underline">talk, delegate, and get revoked.</span>
          </h1>

          <p className="col-span-12 mt-8 max-w-2xl font-sans text-body-lg text-ink-2 md:col-span-8">
            ARP gives every agent a sovereign identity, a permissions layer you
            can audit, and a communication channel that works across vendors.
            Handshake <code className="bg-paper-2 px-1">.agent</code> domains,{' '}
            method-agnostic principal DIDs, Cedar policy, DIDComm transport. All
            under MIT.
          </p>

          <div className="col-span-12 mt-12 flex flex-wrap gap-4 md:col-span-8">
            <Link
              href="/docs/getting-started"
              className={cn(
                'inline-flex items-center gap-3 bg-ink px-5 py-3',
                'font-mono text-kicker uppercase tracking-[0.14em] text-paper',
                'transition-opacity duration-fast ease-arp hover:opacity-80',
              )}
            >
              GET STARTED →
            </Link>
            <Link
              href="/spec/v0.1/overview"
              className={cn(
                'inline-flex items-center gap-3 border border-ink px-5 py-3',
                'font-mono text-kicker uppercase tracking-[0.14em] text-ink',
                'transition-colors duration-fast ease-arp hover:bg-ink hover:text-paper',
              )}
            >
              READ THE SPEC →
            </Link>
          </div>

          <div className="col-span-12 mt-16 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
            <HeroMetric kicker="01 / LAYERS" value="7" note="from identity to policy" />
            <HeroMetric kicker="02 / SCOPES" value="50" note="reusable capability templates" />
            <HeroMetric kicker="03 / PROBES" value="11" note="compliance test vectors" />
            <HeroMetric kicker="04 / STATUS" value="v0.1" note="draft, public review" />
          </div>
        </div>
      </section>

      {/* Plate — What ARP is */}
      <section className="border-t border-rule bg-paper-2">
        <div className="mx-auto grid w-full max-w-page grid-cols-12 gap-4 px-8 py-24">
          <div className="col-span-12 grid grid-cols-12 gap-4 border-b border-rule pb-6">
            <span className="col-span-1 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
              01
            </span>
            <span className="col-span-4 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
              // WHAT ARP IS
            </span>
            <h2 className="col-span-12 mt-4 font-display text-h1 text-ink md:col-span-7">
              Not another agent framework. A <em className="not-italic arp-underline">contract</em> between frameworks.
            </h2>
          </div>

          <div className="col-span-12 mt-12 grid grid-cols-12 gap-px bg-rule lg:gap-0">
            <PlateCard
              idx="A"
              kicker="IDENTITY"
              title="Sovereign names"
              body="Agents live at .agent domains. Principal identity uses method-agnostic DIDs — did:key for browser-held keys, did:web for sovereign or cloud-managed principals."
            />
            <PlateCard
              idx="B"
              kicker="PERMISSIONS"
              title="Cedar-first policy"
              body="50 reusable scope templates compile to Cedar policies. Obligations (budget caps, time windows, audit destinations) attach to consent tokens and merge into every audit entry."
            />
            <PlateCard
              idx="C"
              kicker="TRANSPORT"
              title="DIDComm + pinned TLS"
              body="Signed JWM envelopes over DID-pinned TLS. Sidecar runs anywhere Docker does; the framework adapter plugs your existing agent code in."
            />
          </div>
        </div>
      </section>

      {/* Plate — how to read this site */}
      <section className="border-t border-rule">
        <div className="mx-auto grid w-full max-w-page grid-cols-12 gap-4 px-8 py-24">
          <div className="col-span-12 grid grid-cols-12 gap-4 border-b border-rule pb-6">
            <span className="col-span-1 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
              02
            </span>
            <span className="col-span-4 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
              // HOW TO READ THIS SITE
            </span>
            <h2 className="col-span-12 mt-4 font-display text-h1 text-ink md:col-span-7">
              Three entry points. Pick the one that matches your role.
            </h2>
          </div>

          <div className="col-span-12 mt-10 grid grid-cols-12 gap-4">
            <EntryCard
              idx="A"
              kicker="I'M IMPLEMENTING"
              title="Read the spec"
              body="Normative contracts. DID documents, well-known paths, DNS records, connection tokens, audit chains. Versioned at v0.1."
              href="/spec/v0.1/overview"
              cta="SPEC OVERVIEW →"
            />
            <EntryCard
              idx="B"
              kicker="I'M SHIPPING AN AGENT"
              title="Read the docs"
              body="Install guides (Local / VPS / Cloud), SDK reference, adapter guides, the scope catalog."
              href="/docs/getting-started"
              cta="GETTING STARTED →"
            />
            <EntryCard
              idx="C"
              kicker="I'M A REGISTRAR"
              title="Integrate your TLD"
              body="How .agent registrars wire the well-known documents, owner subdomains, and representation JWTs. v2.1 is the current amendment."
              href="/spec/v0.1/registrar-integration"
              cta="REGISTRAR INTEGRATION →"
            />
          </div>
        </div>
      </section>
    </>
  );
}

function HeroMetric({
  kicker,
  value,
  note,
}: {
  kicker: string;
  value: string;
  note: string;
}): React.JSX.Element {
  return (
    <div className="border-t border-rule pt-4">
      <div className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
        {kicker}
      </div>
      <div className="mt-2 font-display text-display-md text-ink">{value}</div>
      <div className="mt-1 font-sans text-body-sm text-ink-2">{note}</div>
    </div>
  );
}

function PlateCard({
  idx,
  kicker,
  title,
  body,
}: {
  idx: string;
  kicker: string;
  title: string;
  body: string;
}): React.JSX.Element {
  return (
    <div className="col-span-12 bg-paper p-8 lg:col-span-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
          {kicker}
        </span>
        <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
          {idx}
        </span>
      </div>
      <h3 className="mt-6 font-display text-h3 text-ink">{title}</h3>
      <p className="mt-3 font-sans text-body-sm text-ink-2">{body}</p>
    </div>
  );
}

function EntryCard({
  idx,
  kicker,
  title,
  body,
  href,
  cta,
}: {
  idx: string;
  kicker: string;
  title: string;
  body: string;
  href: string;
  cta: string;
}): React.JSX.Element {
  return (
    <Link
      href={href}
      className={cn(
        'group col-span-12 border border-rule bg-paper p-8 md:col-span-4',
        'transition-colors duration-fast ease-arp hover:bg-paper-2',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
          {kicker}
        </span>
        <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
          {idx}
        </span>
      </div>
      <h3 className="mt-6 font-display text-h3 text-ink">{title}</h3>
      <p className="mt-3 font-sans text-body-sm text-ink-2">{body}</p>
      <div className="mt-8 font-mono text-kicker uppercase tracking-[0.14em] text-ink">
        {cta}
      </div>
    </Link>
  );
}
