'use client';

import type * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface ConnectionCardData {
  connectionId: string;
  mineName: string;
  peerName: string;
  purpose: string | null;
  status: string;
  /** "sid.agent may: …" lines, mine last. */
  grants: Array<{ actorName: string; may: string[] }>;
  expiresAt: string | null;
  lastMessageAt: string | null;
}

type StatusFilter = 'active' | 'revoked' | 'all';
const TABS: Array<[StatusFilter, string]> = [['active', 'Active'], ['revoked', 'Ended'], ['all', 'All']];

function mdy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}-${d}-${y}`;
}
function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
}

const STATUS: Record<string, { label: string; dot: string; text: string }> = {
  active: { label: 'Active', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  suspended: { label: 'Paused', dot: 'bg-amber-400', text: 'text-amber-700' },
  revoked: { label: 'Ended', dot: 'bg-zinc-300', text: 'text-zinc-500' },
};

/**
 * Connections as cards: which two agents, what each may do, in words.
 * Filters are plain pills; the status tab and agent filter round-trip through
 * the URL so the server renders the right first page.
 */
export function ConnectionsList({ rows, agents, selectedAgent, selectedStatus }: { rows: ConnectionCardData[]; agents: Array<{ did: string; name: string }>; selectedAgent: string | null; selectedStatus: string }): React.JSX.Element {
  const router = useRouter();
  const [agent, setAgent] = useState(selectedAgent ?? '');
  const status = (TABS.some(([k]) => k === selectedStatus) ? selectedStatus : 'active') as StatusFilter;

  function go(next: { agent?: string; status?: StatusFilter }): void {
    const a = next.agent ?? agent;
    const s = next.status ?? status;
    const q = new URLSearchParams();
    if (a) q.set('agentDid', a);
    if (s !== 'active') q.set('status', s);
    router.push(`/connections${q.toString() ? `?${q}` : ''}`);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-zinc-200 bg-white p-1">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => go({ status: k })} className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${status === k ? 'bg-black text-white' : 'text-zinc-600 hover:text-zinc-900'}`}>
              {label}
            </button>
          ))}
        </div>
        <select value={agent} onChange={(e) => { setAgent(e.target.value); go({ agent: e.target.value }); }} aria-label="Only connections for one agent" className="rounded-full border border-zinc-300 bg-white px-3.5 py-2 text-[13px] text-zinc-900">
          <option value="">Any of my agents</option>
          {agents.map((a) => <option key={a.did} value={a.did}>{a.name}</option>)}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-[15px] text-zinc-600">Nothing here for this filter.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map((c) => {
            const st = STATUS[c.status] ?? { label: c.status, dot: 'bg-zinc-300', text: 'text-zinc-500' };
            return (
              <a key={c.connectionId} href={`/connections/${encodeURIComponent(c.connectionId)}`} className="group relative block overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-[0_1px_0_rgba(0,0,0,0.03)] transition-shadow hover:shadow-[0_24px_60px_-40px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between gap-3">
                  <span className={`inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] ${st.text}`}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{st.label}</span>
                  {c.lastMessageAt && <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">last message {ago(c.lastMessageAt)}</span>}
                </div>
                <p className="mt-4 text-[20px] font-medium tracking-[-0.01em] text-zinc-950">
                  {c.mineName} <span className="mx-1 text-zinc-300">↔</span> {c.peerName}
                </p>
                {c.purpose && <p className="mt-1 text-[14px] text-zinc-600">{c.purpose}</p>}
                <dl className="mt-4 space-y-2">
                  {c.grants.map((g) => (
                    <div key={g.actorName} className="text-[14px]">
                      <dt className="inline font-medium text-zinc-900">{g.actorName} may </dt>
                      <dd className="inline text-zinc-600">{g.may.length ? g.may.map((m) => m.toLowerCase()).join(', ') : 'nothing yet'}</dd>
                    </div>
                  ))}
                  {c.grants.length === 0 && <p className="text-[14px] text-zinc-500">No permissions granted yet.</p>}
                </dl>
                <div className="mt-5 flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 group-hover:text-zinc-900">Open →</span>
                  {c.expiresAt && <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">until {mdy(c.expiresAt)}</span>}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
