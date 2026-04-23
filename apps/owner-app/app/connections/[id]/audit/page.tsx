import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';

export const dynamic = 'force-dynamic';

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offset?: string; limit?: string }>;
}) {
  if (!(await getSession())) redirect('/login');
  const { id } = await params;
  const { offset: offsetParam, limit: limitParam } = await searchParams;
  const offset = Number(offsetParam ?? 0);
  const limit = Number(limitParam ?? 50);

  const client = new RuntimeClient();
  const detail = await client.getConnection(id);
  if (!detail) notFound();

  const audit = await client.getAudit(id, {
    offset: Number.isFinite(offset) ? offset : 0,
    limit: Number.isFinite(limit) ? limit : 50,
  });

  return (
    <div>
      <Header />

      <div className="mb-4 flex items-center gap-3">
        <Link
          href={`/connections/${encodeURIComponent(id)}`}
          className="text-xs"
        >
          ← Connection
        </Link>
        <h2 className="text-lg font-semibold">Audit · {id}</h2>
      </div>

      <div className="card mb-4">
        <div className="flex items-center justify-between text-xs text-arp-muted">
          <span>{audit.total} entries total</span>
          <span
            className={
              audit.verification.valid
                ? 'text-arp-ok'
                : 'text-arp-danger'
            }
            data-testid="audit-verification"
          >
            {audit.verification.valid
              ? 'Chain verified ✓'
              : `Chain broken at seq ${audit.verification.firstBreakAt}: ${audit.verification.error ?? 'unknown'}`}
          </span>
        </div>
      </div>

      <section className="card space-y-2 text-xs">
        {audit.entries.length === 0 && (
          <div className="text-arp-muted">No entries yet.</div>
        )}
        {audit.entries.map((e) => (
          <div
            key={e.seq}
            className="rounded border border-arp-border bg-arp-bg p-2"
          >
            <div className="flex items-center justify-between">
              <span>
                seq={e.seq} · {e.timestamp}
              </span>
              <span
                className={
                  e.decision === 'allow'
                    ? 'text-arp-ok'
                    : 'text-arp-danger'
                }
              >
                {e.decision}
              </span>
            </div>
            <div className="mt-1 text-arp-muted">
              msg={e.msg_id}
              {e.policies_fired.length > 0 && (
                <> · policies=[{e.policies_fired.join(', ')}]</>
              )}
              {e.reason && <> · {e.reason}</>}
            </div>
            {e.obligations.length > 0 && (
              <pre className="mt-2 whitespace-pre-wrap text-arp-muted">
                {JSON.stringify(e.obligations, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </section>

      <nav className="mt-4 flex justify-between text-xs">
        <Link
          href={`/connections/${encodeURIComponent(id)}/audit?offset=${Math.max(0, offset - limit)}&limit=${limit}`}
          className={offset === 0 ? 'pointer-events-none opacity-40' : ''}
        >
          ← Newer
        </Link>
        <Link
          href={`/connections/${encodeURIComponent(id)}/audit?offset=${offset + limit}&limit=${limit}`}
          className={
            offset + limit >= audit.total
              ? 'pointer-events-none opacity-40'
              : ''
          }
        >
          Older →
        </Link>
      </nav>
    </div>
  );
}
