import type * as React from 'react';
import OnboardingForm from './OnboardingForm';

export const dynamic = 'force-dynamic';

export default function OnboardingPage(): React.JSX.Element {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.75rem', marginBottom: '1rem' }}>Provision your agent</h1>
      <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
        Three steps: sign in with your principal DID, paste your handoff bundle, provision. Typical run: ~20 seconds.
      </p>
      <OnboardingForm />
    </main>
  );
}
