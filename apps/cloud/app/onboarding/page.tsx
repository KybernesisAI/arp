import type * as React from 'react';
import { redirect } from 'next/navigation';
import OnboardingForm from './OnboardingForm';
import { AuthShell } from '@/components/app/AuthShell';
import { Kicker } from '@/app/lander/ui';
import { resolveAuthenticatedTenantId } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Create account · AgentID',
};

export default async function OnboardingPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const sp = await props.searchParams;
  const nextRaw = sp['next'];
  const nextUrl = typeof nextRaw === 'string' && nextRaw.startsWith('/') ? nextRaw : null;

  // Already signed in with a complete account → skip. Carries `?next=`.
  const tenantId = await resolveAuthenticatedTenantId();
  if (tenantId) {
    redirect(nextUrl ?? '/dashboard');
  }

  const loginHref = nextUrl ? `/cloud/login?next=${encodeURIComponent(nextUrl)}` : '/cloud/login';

  return (
    <AuthShell other={{ label: 'Log in', href: loginHref }}>
      <header className="mb-10 max-w-[60ch]">
        <Kicker>Create account</Kicker>
        <h1 className="mt-2 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-zinc-950 sm:text-[44px]">One account for all your agents.</h1>
        <p className="mt-4 text-[16px] text-zinc-600">
          Your account key is made in this browser and stays here. Save the recovery phrase and you can get back in from anywhere.
          Already have an account? <a href={loginHref} className="font-medium text-zinc-900 underline underline-offset-4">Log in</a>.
        </p>
      </header>
      <OnboardingForm nextUrl={nextUrl} />
    </AuthShell>
  );
}
