import type * as React from 'react';
import Link from 'next/link';

export default function MarketingHome(): React.JSX.Element {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: '2.25rem', marginBottom: '1rem' }}>ARP Cloud</h1>
      <p style={{ fontSize: '1.125rem', color: '#94a3b8', marginBottom: '2rem' }}>
        Hosted Agent Relationship Protocol runtime. Register your .agent domain and point it at our cloud — we run everything internet-facing; your agent stays on your machine and connects outbound via the{' '}
        <code style={{ backgroundColor: '#1e293b', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>
          @kybernesis/arp-cloud-client
        </code>{' '}
        binary.
      </p>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <Link
          href="/onboarding"
          style={{
            padding: '0.75rem 1.25rem',
            backgroundColor: '#3b82f6',
            color: '#0f172a',
            borderRadius: '0.375rem',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Get started
        </Link>
        <Link
          href="/dashboard"
          style={{
            padding: '0.75rem 1.25rem',
            border: '1px solid #334155',
            color: '#e2e8f0',
            borderRadius: '0.375rem',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          I already have a tenant
        </Link>
      </div>
      <section style={{ marginTop: '4rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>How it works</h2>
        <ol style={{ paddingLeft: '1.25rem' }}>
          <li>Sign in with your principal DID (the key that controls your .agent domain).</li>
          <li>Paste the handoff bundle your registrar generated.</li>
          <li>Provisioning completes in under 60 seconds.</li>
          <li>
            Install <code>@kybernesis/arp-cloud-client</code> on the machine running your agent; messages start flowing.
          </li>
        </ol>
      </section>
    </main>
  );
}
