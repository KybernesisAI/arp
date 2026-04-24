import type { Metadata } from 'next';
import type * as React from 'react';

export const metadata: Metadata = {
  title: 'Data Processing Addendum · ARP',
  description: 'Data processing addendum for ARP Cloud.',
};

export default function DpaPage(): React.JSX.Element {
  return (
    <>
      <header>
        <div className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
          // LEGAL / DATA PROCESSING ADDENDUM
        </div>
        <h1 className="mt-4 font-display text-display-md text-ink">
          Data Processing Addendum
        </h1>
        <p className="mt-3 font-mono text-kicker uppercase text-muted">
          LAST UPDATED 2026-04-24
        </p>
      </header>

      <Section title="1. Parties">
        <p>
          This Data Processing Addendum (&ldquo;DPA&rdquo;) is
          entered into between Kybernesis (&ldquo;Processor&rdquo;) and the
          Customer (&ldquo;Controller&rdquo;), and supplements the
          applicable Terms of Service.
        </p>
      </Section>

      <Section title="2. Scope">
        <p>
          This DPA applies when Kybernesis processes personal data
          on behalf of the Customer in the course of providing ARP Cloud.
          It does NOT apply to data where Kybernesis acts as an independent
          controller (e.g. its own billing records).
        </p>
      </Section>

      <Section title="3. Roles">
        <p>
          Customer is the Controller and determines the purposes
          and means of processing. Kybernesis is the Processor and
          processes personal data solely on documented instructions from
          Customer, unless required to do otherwise by applicable law.
        </p>
      </Section>

      <Section title="4. Subprocessors">
        <p>
          Customer authorizes Kybernesis to engage the following
          subprocessors:
        </p>
        <ul>
          <li>Vercel Inc. — hosting + deployment.</li>
          <li>Neon Inc. — managed Postgres.</li>
          <li>Stripe, Inc. — billing.</li>
          <li>[TODO: counsel — additional subprocessors].</li>
        </ul>
        <p>
          Kybernesis will notify Customer of changes to subprocessors at
          least 14 days before onboarding.
        </p>
      </Section>

      <Section title="5. Security measures">
        <p>
          Kybernesis implements and maintains appropriate
          technical and organisational measures, including:
        </p>
        <ul>
          <li>End-to-end transport authentication + integrity checks.</li>
          <li>Hash-chained audit entries per tenant.</li>
          <li>Browser-held principal keys (Kybernesis never holds them).</li>
          <li>Tenant isolation invariants enforced at the DB layer.</li>
          <li>Access controls + audit logging on production systems.</li>
          <li>[TODO: counsel — formalise SOC 2 / ISO-compatible controls].</li>
        </ul>
      </Section>

      <Section title="6. Incidents">
        <p>
          In the event of a personal data breach affecting
          Customer data, Kybernesis will notify Customer within 72 hours
          of awareness, per the incident runbook referenced in the
          operations documentation.
        </p>
      </Section>

      <Section title="7. Data subject requests">
        <p>
          Kybernesis will, to the extent legally permitted,
          promptly notify Customer of any data subject request received
          directly by Kybernesis and provide reasonable assistance in
          responding.
        </p>
      </Section>

      <Section title="8. International transfers">
        <p>
          Where personal data is transferred across jurisdictions,
          the parties rely on Standard Contractual Clauses (EU) or
          equivalent safeguards (UK IDTA, other jurisdictions per
          counsel&apos;s direction).
        </p>
      </Section>

      <Section title="9. Audit rights">
        <p>
          Customer may audit Kybernesis&apos;s compliance with
          this DPA subject to reasonable notice + confidentiality
          obligations. Audits are at Customer&apos;s expense and may be
          satisfied by third-party attestations where applicable.
        </p>
      </Section>

      <Section title="10. Deletion + return">
        <p>
          Upon termination, Kybernesis will, at Customer&apos;s
          option, return or delete Customer personal data within 30 days,
          subject to legal retention requirements.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          DPA questions + data protection officer correspondence:{' '}
          <code>privacy@arp.run</code>.
        </p>
      </Section>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="border-t border-rule pt-6">
      <h2 className="mb-3 font-display text-h3 text-ink">{title}</h2>
      <div className="arp-prose font-sans text-body-sm text-ink-2">
        {children}
      </div>
    </section>
  );
}
