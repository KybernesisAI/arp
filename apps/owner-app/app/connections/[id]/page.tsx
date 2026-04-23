import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { StatusPill } from '@/components/StatusPill';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';
import { getScopeCatalog } from '@/lib/catalog';
import { formatAgentName, formatExpiry } from '@/lib/format';
import { renderProposalConsent } from '@kybernesis/arp-consent-ui';

export const dynamic = 'force-dynamic';

export default async function ConnectionDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await getSession())) redirect('/login');
  const { id } = await params;

  const client = new RuntimeClient();
  const data = await client.getConnection(id);
  if (!data) notFound();
  const { connection } = data;
  const catalog = getScopeCatalog();

  // Best-effort consent view. Without scope selections (the ConnectionToken
  // drops them post-pairing), we fall back to a policy dump.
  const policyView = {
    headline: `${formatAgentName(connection.peer_did)} · ${connection.purpose ?? connection.connection_id}`,
    cedar_policies: connection.cedar_policies,
    obligations: connection.token.obligations,
    expires: connection.token.expires,
  };
  void catalog;
  void renderProposalConsent;

  return (
    <div>
      <Header />

      <div className="mb-4 flex items-center gap-3">
        <Link href="/" className="text-xs">
          ← Back
        </Link>
        <StatusPill status={connection.status} />
        <h2 className="text-lg font-semibold">{policyView.headline}</h2>
      </div>

      <section className="card mb-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="label">Connection ID</dt>
            <dd className="break-all">{connection.connection_id}</dd>
          </div>
          <div>
            <dt className="label">Purpose</dt>
            <dd>{connection.purpose ?? '—'}</dd>
          </div>
          <div>
            <dt className="label">Issuer (principal)</dt>
            <dd className="break-all">{connection.token.issuer}</dd>
          </div>
          <div>
            <dt className="label">Subject (agent)</dt>
            <dd className="break-all">{connection.token.subject}</dd>
          </div>
          <div>
            <dt className="label">Audience (peer)</dt>
            <dd className="break-all">{connection.token.audience}</dd>
          </div>
          <div>
            <dt className="label">Expires</dt>
            <dd>{formatExpiry(connection.token.expires)}</dd>
          </div>
        </dl>
      </section>

      <section className="card mb-4">
        <h3 className="mb-2 text-sm font-semibold">Cedar policies</h3>
        <div className="space-y-2">
          {connection.cedar_policies.map((p, i) => (
            <pre
              key={i}
              className="whitespace-pre-wrap rounded bg-arp-bg p-3 text-xs"
            >
              {p}
            </pre>
          ))}
        </div>
      </section>

      {connection.token.obligations.length > 0 && (
        <section className="card mb-4">
          <h3 className="mb-2 text-sm font-semibold">Obligations</h3>
          <ul className="space-y-1 text-xs">
            {connection.token.obligations.map((o, i) => (
              <li key={i} className="rounded bg-arp-bg p-2">
                <span className="font-semibold">{o.type}</span>
                <pre className="mt-1 whitespace-pre-wrap text-arp-muted">
                  {JSON.stringify(o.params, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-2">
        <Link
          className="btn no-underline"
          href={`/connections/${encodeURIComponent(connection.connection_id)}/audit`}
        >
          Audit log
        </Link>
        <Link
          className="btn btn-danger no-underline"
          href={`/connections/${encodeURIComponent(connection.connection_id)}/revoke`}
        >
          Revoke
        </Link>
      </div>
    </div>
  );
}
