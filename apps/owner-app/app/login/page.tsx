import { redirect } from 'next/navigation';
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
    <div>
      <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 max-w-xl text-sm text-arp-muted">
        Your identity is generated securely in this browser as a
        <code className="mx-1">did:key</code>. On first visit we&apos;ll show
        you a one-time recovery phrase — save it somewhere safe. After that,
        signing in is one click: the browser signs the server&apos;s challenge
        locally.
      </p>
      <LoginForm next={params.next ?? '/'} />
    </div>
  );
}
