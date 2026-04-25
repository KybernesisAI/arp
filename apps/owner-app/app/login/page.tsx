import { redirect } from 'next/navigation';
import { OwnerAppShell } from '@/components/OwnerAppShell';
import { getSession } from '@/lib/session';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (session) redirect('/');
  const params = await searchParams;

  return (
    <OwnerAppShell chrome={false}>
      <h1 className="mb-4 font-display text-h2 font-medium text-ink">Sign in</h1>
      <p className="mb-6 max-w-xl text-body text-muted">
        Pick how you want to sign in. Passkeys (Touch ID / Face ID / Windows
        Hello) are fastest. Recovery phrase still works for legacy or
        cross-device sign-in.
      </p>
      <LoginForm next={params.next ?? '/'} />
    </OwnerAppShell>
  );
}
