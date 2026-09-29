import type { Metadata } from 'next';
import type * as React from 'react';
import { LegalHeader, LegalSection } from '../LegalDoc';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for AgentID.',
};

export default function PrivacyPage(): React.JSX.Element {
  return (
    <>
      <LegalHeader title="Privacy Policy" updated="2026-04-24" />

      <LegalSection title="1. Who we are">
        <p>
          Kybernesis operates AgentID at cloud.agentid.dev. This policy describes how we handle personal data
          when you use the hosted Service.
        </p>
      </LegalSection>

      <LegalSection title="2. Data we collect">
        <h3>2.1 You provide</h3>
        <ul>
          <li>Account details: email, billing details via Stripe.</li>
          <li>
            Public key material: the public half of your account key, your agents&apos; public identity
            records, and the permission grants you have signed.
          </li>
          <li>Support correspondence.</li>
        </ul>
        <h3>2.2 Automatic</h3>
        <ul>
          <li>Request metadata: IP address, user agent, timestamps.</li>
          <li>Usage counters per account: message volume, activity-log entries.</li>
          <li>Rate-limit hits for anti-abuse.</li>
        </ul>
        <h3>2.3 We do NOT collect</h3>
        <ul>
          <li>
            <strong>Private keys.</strong> Your key pair is generated in your browser; the private key never
            leaves your device.
          </li>
          <li>
            <strong>Recovery phrases.</strong> Stored in your browser only; transmit them yourself if you need
            to copy them.
          </li>
          <li>Full message payloads (transport is end-to-end).</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. How we use it">
        <p>
          Operating the Service, enforcing acceptable use, billing, customer support, service announcements.
          No behavioral advertising.
        </p>
      </LegalSection>

      <LegalSection title="4. Sharing">
        <p>We use the following processors (subprocessors):</p>
        <ul>
          <li>Stripe — billing.</li>
          <li>Vercel — hosting and deployment.</li>
          <li>Neon — managed Postgres.</li>
          <li>[TODO: counsel — add any others].</li>
        </ul>
        <p>We do not sell personal data. We do not share personal data with advertising networks.</p>
      </LegalSection>

      <LegalSection title="5. Retention">
        <p>
          Account data is retained for the life of your account plus [TODO: counsel — TBD] days after
          termination. Activity-log entries are retained per plan (see pricing). Request logs are kept for at
          most 90 days.
        </p>
      </LegalSection>

      <LegalSection title="6. Your rights">
        <p>Depending on your jurisdiction, you may have rights to:</p>
        <ul>
          <li>Access a copy of your personal data.</li>
          <li>Correct inaccurate data.</li>
          <li>Delete data (subject to legal retention requirements).</li>
          <li>Port data to another provider.</li>
          <li>Object to specific processing.</li>
        </ul>
        <p>
          Requests: <a href="mailto:privacy@agentid.dev">privacy@agentid.dev</a>. We respond within 30 days.
        </p>
      </LegalSection>

      <LegalSection title="7. International transfers">
        <p>
          Our infrastructure runs on Vercel and Neon regions that may be outside your country of residence.
          Standard Contractual Clauses or equivalent safeguards apply where required.
        </p>
      </LegalSection>

      <LegalSection title="8. Security">
        <p>
          Your keys stay in your browser. Every message between agents is authenticated and
          integrity-protected. Activity-log entries are hash-chained so tampering can be detected. The full
          security posture is documented in the public specification.
        </p>
      </LegalSection>

      <LegalSection title="9. Children">
        <p>
          The Service is not directed at children under 16. We do not knowingly collect personal data from
          children.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes">
        <p>Material changes will be announced with 30 days&apos; notice where practical.</p>
      </LegalSection>

      <LegalSection title="11. Contact">
        <p>
          Privacy questions: <a href="mailto:privacy@agentid.dev">privacy@agentid.dev</a>.
        </p>
      </LegalSection>
    </>
  );
}
