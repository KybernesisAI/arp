import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OwnerAppShell } from '@/components/OwnerAppShell';
import { StatusPill } from '@/components/StatusPill';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';
import { formatAgentName, formatExpiry, formatRelative } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getSession();
  if (!session) redirect('/login');

  const client = new RuntimeClient();
  const { connections } = await client.listConnections().catch(() => ({
    connections: [],
  }));

  const byPeer = new Map<string, typeof connections>();
  for (const c of connections) {
    const arr = byPeer.get(c.peer_did) ?? [];
    arr.push(c);
    byPeer.set(c.peer_did, arr);
  }

  return (
    <OwnerAppShell>
      <section className="mb-6 flex items-center justify-between">
        <h2 className="font-display text-h3 font-medium text-ink">Address book</h2>
        <Link href="/pair" className="btn btn-primary no-underline">
          + New connection
        </Link>
      </section>

      {byPeer.size === 0 && (
        <div className="card">
          <p className="text-arp-muted">
            No connections yet. Start by generating a pairing invitation.
          </p>
        </div>
      )}

      {Array.from(byPeer.entries()).map(([peerDid, group]) => (
        <details
          key={peerDid}
          open
          className="card mb-3 [&_summary]:cursor-pointer"
        >
          <summary className="flex items-center justify-between">
            <span className="font-semibold">{formatAgentName(peerDid)}</span>
            <span className="text-xs text-arp-muted">
              {group.length} connection{group.length === 1 ? '' : 's'}
            </span>
          </summary>
          <div className="mt-3 divide-y divide-arp-border">
            {group.map((c) => (
              <div
                key={c.connection_id}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={c.status} />
                    <span className="font-semibold">
                      {c.label ?? c.purpose ?? c.connection_id}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-arp-muted">
                    {c.cedar_policies.length} policies · expires{' '}
                    {c.expires_at ? formatExpiry(new Date(c.expires_at).toISOString()) : '—'} · last msg{' '}
                    {formatRelative(c.last_message_at)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/connections/${encodeURIComponent(c.connection_id)}`}
                    className="btn no-underline"
                  >
                    Open
                  </Link>
                  <Link
                    href={`/connections/${encodeURIComponent(c.connection_id)}/audit`}
                    className="btn no-underline"
                  >
                    Audit
                  </Link>
                  <Link
                    href={`/connections/${encodeURIComponent(c.connection_id)}/revoke`}
                    className="btn btn-danger no-underline"
                  >
                    Revoke
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </OwnerAppShell>
  );
}
