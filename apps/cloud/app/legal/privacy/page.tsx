// LEGAL-REVIEW-PENDING — skeleton only. Do NOT publish without counsel
// review. The sections below follow a standard Privacy Policy outline
// (data collected → data shared → retention → user rights); no specific
// privacy commitment binds ARP / Kybernesis until counsel signs off.
import type { Metadata } from 'next';
import type * as React from 'react';
import { LegalDraftBanner } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Privacy Policy (Draft) · ARP',
  description:
    'DRAFT privacy policy for ARP Cloud. Pending legal review; do not rely on.',
  robots: { index: false, follow: false },
};

export default function PrivacyPage(): React.JSX.Element {
  return (
    <>
      <LegalDraftBanner />

      <header>
        <div className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
          // LEGAL / PRIVACY POLICY
        </div>
        <h1 className="mt-4 font-display text-display-md text-ink">
          Privacy Policy
        </h1>
        <p className="mt-3 font-mono text-kicker uppercase text-muted">
          DRAFT · LAST UPDATED 2026-04-24 · PENDING COUNSEL REVIEW
        </p>
      </header>

      <Section title="1. Who we are">
        <p>
          [DRAFT] Kybernesis operates ARP Cloud at <code>cloud.arp.run</code>.
          This policy describes how we handle personal data when you use
          the hosted Service.
        </p>
      </Section>

      <Section title="2. Data we collect">
        <h3>2.1 You provide</h3>
        <ul>
          <li>Account identifiers: email, billing details via Stripe.</li>
          <li>
            Public cryptographic material: your principal DID (the public
            key portion), agent DIDs, consent tokens you have signed.
          </li>
          <li>Support correspondence.</li>
        </ul>
        <h3>2.2 Automatic</h3>
        <ul>
          <li>Request metadata: IP address, user agent, timestamps.</li>
          <li>Usage counters per tenant: message volume, audit entries.</li>
          <li>Rate-limit hits for anti-abuse.</li>
        </ul>
        <h3>2.3 We do NOT collect</h3>
        <ul>
          <li>
            <strong>Principal private keys.</strong> Your keypair is
            generated in your browser; the private key never leaves your
            device.
          </li>
          <li>
            <strong>Recovery phrases.</strong> Stored in your browser only;
            transmit them yourself if you need to copy them.
          </li>
          <li>Full message payloads (transport is end-to-end).</li>
        </ul>
      </Section>

      <Section title="3. How we use it">
        <p>
          [DRAFT] Operating the Service, enforcing acceptable use, billing,
          customer support, service announcements. No behavioral
          advertising.
        </p>
      </Section>

      <Section title="4. Sharing">
        <p>
          [DRAFT] We use the following processors (subprocessors):
        </p>
        <ul>
          <li>Stripe — billing.</li>
          <li>Vercel — hosting + deployment.</li>
          <li>Neon — managed Postgres.</li>
          <li>[TODO: counsel — add any others].</li>
        </ul>
        <p>
          We do not sell personal data. We do not share personal data with
          advertising networks.
        </p>
      </Section>

      <Section title="5. Retention">
        <p>
          [DRAFT] Account data is retained for the life of your account +
          [TODO: counsel — TBD] days after termination. Audit entries are
          retained per plan tier (see pricing). Request logs ≤ 90 days.
        </p>
      </Section>

      <Section title="6. Your rights">
        <p>[DRAFT] Depending on your jurisdiction, you may have rights to:</p>
        <ul>
          <li>Access a copy of your personal data.</li>
          <li>Correct inaccurate data.</li>
          <li>Delete data (subject to legal retention requirements).</li>
          <li>Port data to another provider.</li>
          <li>Object to specific processing.</li>
        </ul>
        <p>
          Requests: <code>privacy@arp.run</code>. We respond within 30 days.
        </p>
      </Section>

      <Section title="7. International transfers">
        <p>
          [DRAFT] Our infrastructure runs on Vercel + Neon regions that may
          be outside your country of residence. Standard Contractual
          Clauses or equivalent safeguards apply where required.
        </p>
      </Section>

      <Section title="8. Security">
        <p>
          [DRAFT] Principal keys are browser-held. Transport is
          authenticated + integrity-protected. Audit entries are hash-chained
          to allow tamper detection. The full security posture is
          documented in the public spec.
        </p>
      </Section>

      <Section title="9. Children">
        <p>
          [DRAFT] The Service is not directed at children under 16. We do
          not knowingly collect personal data from children.
        </p>
      </Section>

      <Section title="10. Changes">
        <p>
          [DRAFT] Material changes will be announced with 30 days&apos;
          notice where practical.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          [DRAFT] Privacy questions: <code>privacy@arp.run</code>.
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
