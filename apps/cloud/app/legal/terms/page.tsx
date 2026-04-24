import type { Metadata } from 'next';
import type * as React from 'react';

export const metadata: Metadata = {
  title: 'Terms of Service · ARP',
  description: 'Terms of service for ARP Cloud.',
};

export default function TermsPage(): React.JSX.Element {
  return (
    <>
      <header>
        <div className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
          // LEGAL / TERMS OF SERVICE
        </div>
        <h1 className="mt-4 font-display text-display-md text-ink">
          Terms of Service
        </h1>
        <p className="mt-3 font-mono text-kicker uppercase text-muted">
          LAST UPDATED 2026-04-24
        </p>
      </header>

      <Section title="1. Acceptance">
        <p>
          By creating an account, installing the ARP sidecar, or
          otherwise using the ARP protocol, reference implementation, or any
          hosted ARP service operated by Kybernesis (collectively, the
          &ldquo;Service&rdquo;), you agree to the final published terms.
          This draft is provided for review only.
        </p>
      </Section>

      <Section title="2. The Service">
        <p>
          Kybernesis operates ARP Cloud, a hosted runtime for the
          Agent Relationship Protocol. Customers may also self-host the
          open-source reference implementation under its MIT license;
          these terms apply only to usage of the hosted Service.
        </p>
      </Section>

      <Section title="3. Accounts">
        <p>
          You must provide accurate information, maintain the
          confidentiality of your credentials and recovery phrase, and
          promptly notify us of any unauthorized use. You are responsible
          for all activity under your account.
        </p>
      </Section>

      <Section title="4. Acceptable use">
        <p>
          The following are prohibited without limitation:
        </p>
        <ul>
          <li>Using the Service to violate applicable law.</li>
          <li>
            Attempting to circumvent identity, policy, audit, or rate-limit
            systems.
          </li>
          <li>Distributing malware via agent-to-agent messaging.</li>
          <li>
            Conducting load testing, penetration testing, or red-team
            activity against the Service without prior written consent.
          </li>
          <li>
            Using the Service to build a competing product based on our
            proprietary components [if any — counsel to clarify scope].
          </li>
        </ul>
      </Section>

      <Section title="5. Fees + billing">
        <p>
          Paid tiers are billed via Stripe. Prices + quotas are
          published at <code>cloud.arp.run/pricing</code>. You authorize
          recurring charges until you cancel.
        </p>
      </Section>

      <Section title="6. Intellectual property">
        <p>
          The ARP protocol specification, reference implementation,
          and SDKs are released under the MIT License. The ARP name + the
          Kybernesis word-mark remain the property of Kybernesis; trademark
          use is restricted per a future separate brand-use policy.
        </p>
      </Section>

      <Section title="7. Confidentiality">
        <p>
          You agree to keep non-public information disclosed to you
          in the course of using the Service confidential, and to use such
          information only as needed to use the Service.
        </p>
      </Section>

      <Section title="8. Termination">
        <p>
          Either party may terminate on notice. We may suspend or
          terminate accounts engaged in abuse. Upon termination, your data
          is deleted per the Privacy Policy&apos;s retention schedule.
        </p>
      </Section>

      <Section title="9. Disclaimers">
        <p>
          The Service is provided &ldquo;as is.&rdquo; Kybernesis
          disclaims all warranties to the fullest extent permitted by law.
        </p>
      </Section>

      <Section title="10. Limitation of liability">
        <p>
          Aggregate liability is capped at the greater of (a) fees
          paid to Kybernesis in the 12 months preceding the claim, or
          (b) USD 100. No indirect, consequential, or punitive damages.
        </p>
      </Section>

      <Section title="11. Governing law">
        <p>
          Governed by the laws of [TODO: counsel — jurisdiction
          TBD]. Exclusive jurisdiction in [TODO: counsel].
        </p>
      </Section>

      <Section title="12. Changes">
        <p>
          We may update these Terms; material changes will be
          announced with 30 days&apos; notice where practical.
        </p>
      </Section>

      <Section title="13. Contact">
        <p>
          Questions: <code>legal@arp.run</code>.
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
