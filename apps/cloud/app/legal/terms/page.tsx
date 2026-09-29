import type { Metadata } from 'next';
import type * as React from 'react';
import { siteUrl } from '@/lib/origins';
import { LegalHeader, LegalSection } from '../LegalDoc';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of service for AgentID.',
};

export default function TermsPage(): React.JSX.Element {
  return (
    <>
      <LegalHeader title="Terms of Service" updated="2026-04-24" />

      <LegalSection title="1. Acceptance">
        <p>
          By creating an account, or otherwise using AgentID or any hosted service operated by Kybernesis
          (collectively, the &ldquo;Service&rdquo;), you agree to the final published terms. This draft is
          provided for review only.
        </p>
      </LegalSection>

      <LegalSection title="2. The Service">
        <p>
          Kybernesis operates AgentID, a hosted service that gives an AI agent a permanent name, an identity
          other agents can trust, and a way to connect that you control. Customers may also self-host the
          open-source reference implementation under its MIT license; these terms apply only to usage of the
          hosted Service.
        </p>
      </LegalSection>

      <LegalSection title="3. Accounts">
        <p>
          You must provide accurate information, maintain the confidentiality of your credentials and recovery
          phrase, and promptly notify us of any unauthorized use. You are responsible for all activity under
          your account.
        </p>
      </LegalSection>

      <LegalSection title="4. Acceptable use">
        <p>The following are prohibited without limitation:</p>
        <ul>
          <li>Using the Service to violate applicable law.</li>
          <li>Attempting to circumvent identity, permission, activity-log, or rate-limit systems.</li>
          <li>Distributing malware via agent-to-agent messaging.</li>
          <li>
            Conducting load testing, penetration testing, or red-team activity against the Service without
            prior written consent.
          </li>
          <li>
            Using the Service to build a competing product based on our proprietary components [if any —
            counsel to clarify scope].
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Fees and billing">
        <p>
          Paid plans are billed via Stripe. Prices and quotas are published at{' '}
          <a href={siteUrl('/#pricing')}>agentid.dev</a>. You authorize recurring charges until you cancel.
        </p>
      </LegalSection>

      <LegalSection title="6. Intellectual property">
        <p>
          The underlying open-source protocol specification, reference implementation, and SDKs are released
          under the MIT License. The AgentID name and the Kybernesis word-mark remain the property of
          Kybernesis; trademark use is restricted per a future separate brand-use policy.
        </p>
      </LegalSection>

      <LegalSection title="7. Confidentiality">
        <p>
          You agree to keep non-public information disclosed to you in the course of using the Service
          confidential, and to use such information only as needed to use the Service.
        </p>
      </LegalSection>

      <LegalSection title="8. Termination">
        <p>
          Either party may terminate on notice. We may suspend or terminate accounts engaged in abuse. Upon
          termination, your data is deleted per the Privacy Policy&apos;s retention schedule.
        </p>
      </LegalSection>

      <LegalSection title="9. Disclaimers">
        <p>
          The Service is provided &ldquo;as is.&rdquo; Kybernesis disclaims all warranties to the fullest
          extent permitted by law.
        </p>
      </LegalSection>

      <LegalSection title="10. Limitation of liability">
        <p>
          Aggregate liability is capped at the greater of (a) fees paid to Kybernesis in the 12 months
          preceding the claim, or (b) USD 100. No indirect, consequential, or punitive damages.
        </p>
      </LegalSection>

      <LegalSection title="11. Governing law">
        <p>
          Governed by the laws of [TODO: counsel — jurisdiction TBD]. Exclusive jurisdiction in [TODO:
          counsel].
        </p>
      </LegalSection>

      <LegalSection title="12. Changes">
        <p>We may update these Terms; material changes will be announced with 30 days&apos; notice where practical.</p>
      </LegalSection>

      <LegalSection title="13. Contact">
        <p>
          Questions: <a href="mailto:legal@agentid.dev">legal@agentid.dev</a>.
        </p>
      </LegalSection>
    </>
  );
}
