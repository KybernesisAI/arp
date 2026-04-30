import type * as React from 'react';
import { redirect } from 'next/navigation';
import OnboardingForm from './OnboardingForm';
import { Link, PlateHead } from '@/components/ui';
import { AppShell } from '@/components/app/AppShell';
import { resolveAuthenticatedTenantId } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const sp = await props.searchParams;
  const nextRaw = sp['next'];
  const nextUrl = typeof nextRaw === 'string' && nextRaw.startsWith('/') ? nextRaw : null;

  // If the user is already logged in with a complete account, skip onboarding
  // entirely. Carry the deep-link `?next=` if present. Uses the same
  // session→tenant resolution as requireTenantDb so a session whose cookie
  // hasn't been refreshed (tenantId still null after onboard) still hits
  // the redirect via the principalDid → tenants fallback.
  const tenantId = await resolveAuthenticatedTenantId();
  if (tenantId) {
    redirect(nextUrl ?? '/dashboard');
  }

  const loginHref = nextUrl
    ? `/cloud/login?next=${encodeURIComponent(nextUrl)}`
    : '/cloud/login';

  return (
    <AppShell showMainActions={false}>
      <PlateHead
        plateNum="O.00"
        kicker="// ONBOARDING · BROWSER-HELD"
        title="Get started with ARP Cloud."
      />
      <div className="max-w-[720px]">
        <p className="text-body-lg text-ink-2 mb-4">
          Create your account. Your browser generates your identity locally — we never see your
          private key. When you write down your recovery phrase, keep it somewhere safe. It is
          the only way to get your account back if this browser is lost.
        </p>
        <p className="text-body text-ink-2 mb-8">
          Already have an account?{' '}
          <Link href={loginHref}>Sign in instead →</Link>
        </p>
        <OnboardingForm nextUrl={nextUrl} />
      </div>
    </AppShell>
  );
}
