import type * as React from 'react';
import OnboardingForm from './OnboardingForm';
import { PlateHead } from '@/components/ui';
import { AppShell } from '@/components/app/AppShell';

export const dynamic = 'force-dynamic';

export default function OnboardingPage(): React.JSX.Element {
  return (
    <AppShell showMainActions={false}>
      <PlateHead
        plateNum="O.00"
        kicker="// ONBOARDING · BROWSER-HELD"
        title="Get started with ARP Cloud."
      />
      <div className="max-w-[720px]">
        <p className="text-body-lg text-ink-2 mb-8">
          Create your account. Your browser generates your identity locally — we never see your
          private key. When you write down your recovery phrase, keep it somewhere safe. It is
          the only way to get your account back if this browser is lost.
        </p>
        <OnboardingForm />
      </div>
    </AppShell>
  );
}
