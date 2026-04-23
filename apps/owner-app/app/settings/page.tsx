import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { env } from '@/lib/env';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  if (!(await getSession())) redirect('/login');
  const e = env();
  const client = new RuntimeClient();
  const { connections } = await client.listConnections().catch(() => ({
    connections: [],
  }));

  return (
    <div>
      <Header />
      <h2 className="mb-4 text-lg font-semibold">Settings</h2>

      <section className="card mb-4 space-y-2 text-sm">
        <h3 className="font-semibold">Identity</h3>
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="label">Principal DID</dt>
            <dd className="break-all">{e.ARP_PRINCIPAL_DID}</dd>
          </div>
          <div>
            <dt className="label">Agent DID</dt>
            <dd className="break-all">{e.ARP_AGENT_DID}</dd>
          </div>
          <div>
            <dt className="label">Scope catalog version</dt>
            <dd>{e.ARP_SCOPE_CATALOG_VERSION}</dd>
          </div>
          <div>
            <dt className="label">Active connections</dt>
            <dd>{connections.filter((c) => c.status === 'active').length}</dd>
          </div>
        </dl>
      </section>

      <section className="card mb-4 space-y-2 text-sm">
        <h3 className="font-semibold">Keys</h3>
        <p className="text-arp-muted">
          Agent key rotation is staged through{' '}
          <code>/admin/keys/rotate</code>. In v0 it returns 501 and prompts a
          restart with a fresh keystore path.
        </p>
        <Link href="/settings/keys" className="btn no-underline">
          Open rotation panel
        </Link>
      </section>

      <section className="card space-y-2 text-sm">
        <h3 className="font-semibold text-arp-danger">Danger zone</h3>
        <p className="text-arp-muted">
          Revoke every active connection. Each revocation lands in the
          signed revocations list peers poll every 5 minutes.
        </p>
        <DangerZone connections={connections} />
      </section>
    </div>
  );
}

function DangerZone({
  connections,
}: {
  connections: Array<{ connection_id: string; status: string }>;
}) {
  const active = connections.filter((c) => c.status === 'active');
  if (active.length === 0) {
    return <p className="text-xs text-arp-muted">No active connections.</p>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {active.map((c) => (
        <li key={c.connection_id}>
          <Link
            href={`/connections/${encodeURIComponent(c.connection_id)}/revoke`}
          >
            Revoke {c.connection_id}
          </Link>
        </li>
      ))}
    </ul>
  );
}
