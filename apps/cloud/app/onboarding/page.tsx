import type * as React from 'react';
import OnboardingForm from './OnboardingForm';

export const dynamic = 'force-dynamic';

export default function OnboardingPage(): React.JSX.Element {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.75rem', marginBottom: '1rem' }}>Get started with ARP Cloud</h1>
      <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
        Create your account to deploy your agent. Your browser generates your identity
        locally — we never see your private key.
      </p>
      <OnboardingForm />
    </main>
  );
}
