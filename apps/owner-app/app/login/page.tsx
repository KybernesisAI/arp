import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
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
  const e = env();

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 max-w-xl text-sm text-arp-muted">
        Prove you control <span className="text-arp-text">{e.ARP_PRINCIPAL_DID}</span> by
        signing a one-time challenge with your Ed25519 principal key. In v0 this is
        done by pasting a base64url-encoded signature from the ARP CLI or the
        mobile app; browser-wallet support lands in Phase 8.
      </p>
      <LoginForm principalDid={e.ARP_PRINCIPAL_DID} next={params.next ?? '/'} />
    </div>
  );
}
