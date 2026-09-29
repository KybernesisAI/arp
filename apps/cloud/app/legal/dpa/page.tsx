import type { Metadata } from 'next';
import type * as React from 'react';
import { LegalHeader, LegalSection } from '../LegalDoc';

export const metadata: Metadata = {
  title: 'Data Processing Addendum',
  description: 'Data processing addendum for AgentID.',
};

export default function DpaPage(): React.JSX.Element {
  return (
    <>
      <LegalHeader title="Data Processing Addendum" updated="2026-04-24" />

      <LegalSection title="1. Parties">
        <p>
          This Data Processing Addendum (&ldquo;DPA&rdquo;) is entered into between Kybernesis
          (&ldquo;Processor&rdquo;) and the Customer (&ldquo;Controller&rdquo;), and supplements the applicable
          Terms of Service.
        </p>
      </LegalSection>

      <LegalSection title="2. Scope">
        <p>
          This DPA applies when Kybernesis processes personal data on behalf of the Customer in the course of
          providing AgentID. It does NOT apply to data where Kybernesis acts as an independent controller
          (e.g. its own billing records).
        </p>
      </LegalSection>

      <LegalSection title="3. Roles">
        <p>
          Customer is the Controller and determines the purposes and means of processing. Kybernesis is the
          Processor and processes personal data solely on documented instructions from Customer, unless
          required to do otherwise by applicable law.
        </p>
      </LegalSection>

      <LegalSection title="4. Subprocessors">
        <p>Customer authorizes Kybernesis to engage the following subprocessors:</p>
        <ul>
          <li>Vercel Inc. — hosting and deployment.</li>
          <li>Neon Inc. — managed Postgres.</li>
          <li>Stripe, Inc. — billing.</li>
          <li>[TODO: counsel — additional subprocessors].</li>
        </ul>
        <p>Kybernesis will notify Customer of changes to subprocessors at least 14 days before onboarding.</p>
      </LegalSection>

      <LegalSection title="5. Security measures">
        <p>Kybernesis implements and maintains appropriate technical and organisational measures, including:</p>
        <ul>
          <li>End-to-end authentication and integrity checks on every message between agents.</li>
          <li>Hash-chained activity-log entries per account.</li>
          <li>Browser-held account keys (Kybernesis never holds them).</li>
          <li>Account isolation enforced at the database layer.</li>
          <li>Access controls and audit logging on production systems.</li>
          <li>[TODO: counsel — formalise SOC 2 / ISO-compatible controls].</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Incidents">
        <p>
          In the event of a personal data breach affecting Customer data, Kybernesis will notify Customer
          within 72 hours of awareness, per the incident runbook referenced in the operations documentation.
        </p>
      </LegalSection>

      <LegalSection title="7. Data subject requests">
        <p>
          Kybernesis will, to the extent legally permitted, promptly notify Customer of any data subject
          request received directly by Kybernesis and provide reasonable assistance in responding.
        </p>
      </LegalSection>

      <LegalSection title="8. International transfers">
        <p>
          Where personal data is transferred across jurisdictions, the parties rely on Standard Contractual
          Clauses (EU) or equivalent safeguards (UK IDTA, other jurisdictions per counsel&apos;s direction).
        </p>
      </LegalSection>

      <LegalSection title="9. Audit rights">
        <p>
          Customer may audit Kybernesis&apos;s compliance with this DPA subject to reasonable notice and
          confidentiality obligations. Audits are at Customer&apos;s expense and may be satisfied by third-party
          attestations where applicable.
        </p>
      </LegalSection>

      <LegalSection title="10. Deletion and return">
        <p>
          Upon termination, Kybernesis will, at Customer&apos;s option, return or delete Customer personal data
          within 30 days, subject to legal retention requirements.
        </p>
      </LegalSection>

      <LegalSection title="11. Contact">
        <p>
          DPA questions and data protection officer correspondence:{' '}
          <a href="mailto:privacy@agentid.dev">privacy@agentid.dev</a>.
        </p>
      </LegalSection>
    </>
  );
}
