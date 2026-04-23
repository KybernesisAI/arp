import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';
import { RevokeForm } from './RevokeForm';

export const dynamic = 'force-dynamic';

export default async function RevokePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await getSession())) redirect('/login');
  const { id } = await params;
  const client = new RuntimeClient();
  const detail = await client.getConnection(id);
  if (!detail) notFound();
  const { connection } = detail;

  return (
    <div>
      <Header />
      <div className="mb-4">
        <Link
          href={`/connections/${encodeURIComponent(id)}`}
          className="text-xs"
        >
          ← Connection
        </Link>
        <h2 className="mt-2 text-lg font-semibold">Revoke connection</h2>
      </div>
      <div className="card max-w-xl">
        <p className="text-sm text-arp-muted">
          Revoking {connection.connection_id} tears down the connection
          immediately and pushes a signed revocation entry into the
          `/revocations.json` list the peer polls every 5 minutes.
        </p>
        <RevokeForm connectionId={connection.connection_id} />
      </div>
    </div>
  );
}
