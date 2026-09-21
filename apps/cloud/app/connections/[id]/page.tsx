import type * as React from 'react';
import { notFound, redirect } from 'next/navigation';
import { ConsoleShell } from '@/components/app/ConsoleShell';
import { Card, Kicker, StateChip } from '@/app/lander/ui';
import { ConnectionActions } from './ConnectionActions';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { buildConnectionView, type ConnectionView } from '@/lib/connection-view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mdy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}-${d}-${y}`;
}

const STATUS: Record<string, { label: string; dot: string; text: string }> = {
  active: { label: 'Active', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  suspended: { label: 'Paused', dot: 'bg-amber-400', text: 'text-amber-700' },
  revoked: { label: 'Ended', dot: 'bg-zinc-300', text: 'text-zinc-500' },
};

/**
 * /connections/[id] — one connection, in words: the two agents, what each
 * may do, the conditions, and the controls (pause, resume, change, end, log).
 * Tenant-scoped: a row from another account is a 404, same as a missing id.
 */
export default async function ConnectionDetailPage(props: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  const { id: rawId } = await props.params;
  const id = decodeURIComponent(rawId);
  let view: ConnectionView | null;
  try {
    view = await loadView(id);
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  if (!view) notFound();
  const st = STATUS[view.status] ?? { label: view.status, dot: 'bg-zinc-300', text: 'text-zinc-500' };
  const expired = view.status === 'active' && view.expiresAt !== null && new Date(view.expiresAt).getTime() <= Date.now();

  return (
    <ConsoleShell active="connections">
      <div className="mb-6"><a href="/connections" className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-900">← Connections</a></div>
      <header className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Kicker>
            <span className={`inline-flex items-center gap-2 ${expired ? 'text-zinc-500' : st.text}`}><span className={`h-1.5 w-1.5 rounded-full ${expired ? 'bg-zinc-300' : st.dot}`} />{expired ? 'Expired' : st.label}</span>
            {view.purpose && <span className="ml-3 text-zinc-500">· {view.purpose}</span>}
          </Kicker>
          <h1 className="mt-2 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-zinc-950 sm:text-[44px]">
            {view.mine.name} <span className="text-zinc-300">↔</span> {view.peer.name}
          </h1>
        </div>
        <ConnectionActions connectionId={view.connectionId} status={view.status} />
      </header>

      {view.status === 'revoked' && (
        <Card className="mb-6">
          <p className="m-0 text-[15px] text-zinc-700">This connection has ended{view.revokeReason ? `: ${view.revokeReason}` : ''}. Its message log is still available.</p>
        </Card>
      )}
      {view.status === 'suspended' && (
        <Card className="mb-6">
          <p className="m-0 text-[15px] text-zinc-700">Paused. Messages between these two agents are refused until you resume. Nothing needs to be set up again.</p>
        </Card>
      )}
      {expired && (
        <Card className="mb-6">
          <p className="m-0 text-[15px] text-zinc-700">This connection reached the end of its agreed lifetime. Pair the agents again to continue.</p>
        </Card>
      )}

      {/* PERMISSIONS */}
      <section>
        <Kicker>What each agent may do</Kicker>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {[view.peer, view.mine].map((who) => {
            const g = view!.grants.find((x) => x.actorDid === who.did);
            const isMine = who.did === view!.mine.did;
            return (
              <Card key={who.did} glow={isMine ? 'cyan' : 'emerald'}>
                <p className="m-0 text-[18px] font-medium tracking-[-0.01em] text-zinc-950">{who.name}</p>
                <p className="mt-0.5 text-[13px] text-zinc-500">{isMine ? `may do this to ${view!.peer.name}` : `may do this to ${view!.mine.name}`}</p>
                {g && g.may.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {g.may.map((m) => (
                      <li key={m} className="flex items-start gap-2.5 text-[15px] text-zinc-800">
                        <span className={`mt-[5px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${isMine ? 'bg-cyan-500' : 'bg-emerald-500'}`}><svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5.2l2 2 4-4.4" /></svg></span>
                        {m}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-[15px] text-zinc-500">Nothing. {who.name} can only answer when spoken to.</p>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {/* CONDITIONS + DATES */}
      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <Kicker>Conditions</Kicker>
          {view.conditions.length === 0 ? (
            <p className="mt-3 text-[15px] text-zinc-600">No extra conditions.</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-[15px] text-zinc-800">{view.conditions.map((c) => <li key={c}>{c}</li>)}</ul>
          )}
          <p className="mt-4 text-[13px] text-zinc-500">Every message is checked against these permissions before delivery and written to both agents' logs.</p>
        </Card>
        <Card>
          <Kicker>Dates</Kicker>
          <dl className="mt-3 space-y-2 text-[14px]">
            <div className="flex justify-between gap-3"><dt className="text-zinc-600">Started</dt><dd className="m-0 font-mono text-[13px] text-zinc-900">{mdy(view.createdAt)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-zinc-600">Until</dt><dd className="m-0 font-mono text-[13px] text-zinc-900">{view.expiresAt ? mdy(view.expiresAt) : 'no end date'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-zinc-600">Last message</dt><dd className="m-0 font-mono text-[13px] text-zinc-900">{view.lastMessageAt ? mdy(view.lastMessageAt) : 'none yet'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-zinc-600">Status</dt><dd className="m-0"><StateChip state={view.status === 'active' && !expired ? 'live' : 'pending'} /></dd></div>
          </dl>
          <a href={`/connections/${encodeURIComponent(view.connectionId)}/audit`} className="mt-5 inline-block font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-900">Message log →</a>
        </Card>
      </section>

      <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">Reference {view.connectionId}</p>
    </ConsoleShell>
  );
}

async function loadView(id: string): Promise<ConnectionView | null> {
  const { tenantDb } = await requireTenantDb();
  const row = await tenantDb.getConnection(id);
  if (!row) return null;
  const agentRows = await tenantDb.listAgents();
  const names = new Map(agentRows.map((a) => [a.did, a.did.replace(/^did:web:/, '')]));
  return buildConnectionView({ ...row, purpose: row.purpose ?? null, revokeReason: row.revokeReason ?? null }, names);
}
