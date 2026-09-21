import type * as React from 'react';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/app/AuthShell';
import { Kicker } from '@/app/lander/ui';
import LoginForm from './LoginForm';
import { resolveAuthenticatedTenantId } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Log in · AgentID',
};

export default async function LoginPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const sp = await props.searchParams;
  const nextRaw = sp['next'];
  const nextUrl = typeof nextRaw === 'string' && nextRaw.startsWith('/') ? nextRaw : null;

  // Already signed in with a complete account → straight through.
  const tenantId = await resolveAuthenticatedTenantId();
  if (tenantId) {
    redirect(nextUrl ?? '/dashboard');
  }
  const signupHref = nextUrl ? `/onboarding?next=${encodeURIComponent(nextUrl)}` : '/onboarding';

  return (
    <AuthShell other={{ label: 'Create account', href: signupHref }}>
      <header className="mb-10 max-w-[60ch]">
        <Kicker>Log in</Kicker>
        <h1 className="mt-2 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-zinc-950 sm:text-[44px]">Welcome back.</h1>
        <p className="mt-4 text-[16px] text-zinc-600">
          On the device you set up with, this is one tap. Anywhere else, use the email on your account or your recovery phrase.
        </p>
      </header>
      <LoginForm nextUrl={nextUrl} signupHref={signupHref} />
    </AuthShell>
  );
}
