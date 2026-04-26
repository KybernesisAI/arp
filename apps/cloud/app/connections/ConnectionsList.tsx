'use client';

import { useCallback, useMemo, useState } from 'react';
import { Badge, Button, Card, Code, Dot, Link } from '@/components/ui';

export interface AgentOption {
  did: string;
  name: string;
}

export interface ConnectionRow {
  connectionId: string;
  agentDid: string;
  peerDid: string;
  purpose: string | null;
  status: string;
  scopesCount: number;
  obligationsCount: number;
  createdAt: string;
  lastMessageAt: string | null;
}

type StatusFilter = 'active' | 'revoked' | 'all';

const STATUS_LABELS: Record<StatusFilter, string> = {
  active: 'Active',
  revoked: 'Revoked',
  all: 'All',
};

function statusTone(status: string): 'green' | 'yellow' | 'red' | 'ink' {
  if (status === 'active') return 'green';
  if (status === 'revoked') return 'red';
  if (status === 'suspended') return 'yellow';
  return 'ink';
}

function statusBadgeTone(
  status: string,
): 'paper' | 'red' | 'yellow' | 'blue' | 'muted' {
  if (status === 'active') return 'blue';
  if (status === 'revoked') return 'red';
  if (status === 'suspended') return 'yellow';
  return 'muted';
}

function truncateDid(did: string): string {
  if (did.length <= 40) return did;
  return `${did.slice(0, 22)}…${did.slice(-12)}`;
}

export function ConnectionsList({
  agents,
  initialRows,
  initialCursor,
  selectedAgent,
  selectedStatus,
  pageSize,
}: {
  agents: AgentOption[];
  initialRows: ConnectionRow[];
  initialCursor: string | null;
  selectedAgent: string | null;
  selectedStatus: string;
  pageSize: number;
}): React.JSX.Element {
  const [rows, setRows] = useState<ConnectionRow[]>(initialRows);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>(selectedAgent ?? '');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    (selectedStatus as StatusFilter) ?? 'active',
  );

  const applyFilters = useCallback(
    async (nextAgent: string, nextStatus: StatusFilter) => {
      setBusy(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          status: nextStatus,
          limit: String(pageSize),
        });
        if (nextAgent) params.set('agentDid', nextAgent);
        const res = await fetch(`/api/connections?${params.toString()}`);
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        const body = (await res.json()) as {
          connections: ConnectionRow[];
          nextCursor: string | null;
        };
        setRows(body.connections);
        setCursor(body.nextCursor);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [pageSize],
  );

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        limit: String(pageSize),
        cursor,
      });
      if (agentFilter) params.set('agentDid', agentFilter);
      const res = await fetch(`/api/connections?${params.toString()}`);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const body = (await res.json()) as {
        connections: ConnectionRow[];
        nextCursor: string | null;
      };
      setRows((prev) => [...prev, ...body.connections]);
      setCursor(body.nextCursor);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [agentFilter, cursor, pageSize, statusFilter]);

  const statusTabs = useMemo<StatusFilter[]>(() => ['active', 'revoked', 'all'], []);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4 pb-4 border-b border-rule">
        <div className="flex items-center gap-2">
          <label
            htmlFor="connections-agent-filter"
            className="font-mono text-kicker uppercase text-muted"
          >
            AGENT
          </label>
          <select
            id="connections-agent-filter"
            className="border border-rule bg-paper px-3 py-2 font-mono text-sm"
            value={agentFilter}
            onChange={(e) => {
              setAgentFilter(e.target.value);
              void applyFilters(e.target.value, statusFilter);
            }}
            data-testid="connections-agent-filter"
          >
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.did} value={a.did}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {statusTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setStatusFilter(tab);
                void applyFilters(agentFilter, tab);
              }}
              className={`font-mono text-kicker uppercase px-3 py-2 border ${
                statusFilter === tab
                  ? 'border-ink bg-ink text-paper'
                  : 'border-rule bg-paper text-muted hover:text-ink'
              }`}
              data-testid={`connections-status-${tab}`}
            >
              {STATUS_LABELS[tab]}
            </button>
          ))}
        </div>
        {busy && (
          <span className="font-mono text-kicker uppercase text-muted" data-testid="connections-busy">
            LOADING…
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 border border-signal-red bg-paper p-3 font-mono text-kicker uppercase text-signal-red">
          ERROR: {error}
        </div>
      )}

      {rows.length === 0 ? (
        <Card tone="paper-2" padded className="border border-rule">
          <Badge tone="muted" className="mb-3 text-[9px] px-2 py-0.5">NO RESULTS</Badge>
          <p className="text-body">No connections match these filters.</p>
        </Card>
      ) : (
        <Card tone="paper-2" padded={false} className="border border-rule">
          <ul className="list-none p-0 m-0" data-testid="connections-list">
            {rows.map((row, i) => (
              <li
                key={`${row.agentDid}::${row.connectionId}`}
                className={
                  'grid grid-cols-12 gap-4 px-5 py-4 items-baseline ' +
                  (i === rows.length - 1 ? '' : 'border-b border-rule')
                }
              >
                <div className="col-span-12 md:col-span-3 font-mono text-kicker uppercase text-ink">
                  <Link
                    href={`/connections/${encodeURIComponent(row.connectionId)}`}
                    variant="mono"
                  >
                    {row.connectionId.slice(0, 18)}
                    {row.connectionId.length > 18 ? '…' : ''}
                  </Link>
                </div>
                <div className="col-span-12 md:col-span-4 text-body-sm text-ink-2 break-all">
                  → <Code>{truncateDid(row.peerDid)}</Code>
                </div>
                <div className="col-span-6 md:col-span-2 font-mono text-kicker uppercase inline-flex items-center gap-2">
                  <Dot tone={statusTone(row.status)} />
                  <Badge tone={statusBadgeTone(row.status)} className="text-[9px] px-2 py-0.5">
                    {row.status.toUpperCase()}
                  </Badge>
                </div>
                <div className="col-span-6 md:col-span-1 font-mono text-kicker uppercase text-muted">
                  {row.scopesCount} scope{row.scopesCount === 1 ? '' : 's'}
                </div>
                <div className="col-span-12 md:col-span-2 md:text-right font-mono text-kicker uppercase text-muted">
                  {new Date(row.createdAt).toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {cursor && (
        <div className="mt-6">
          <Button
            variant="default"
            onClick={() => void loadMore()}
            disabled={busy}
            data-testid="connections-load-more"
          >
            {busy ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
