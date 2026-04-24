'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Code, Link } from '@/components/ui';

export interface AuditEntry {
  id: string;
  seq: number;
  msgId: string;
  direction: string;
  decision: string;
  reason: string | null;
  obligations: unknown[];
  policiesFired: string[];
  timestamp: string;
  peerDid: string;
  spendDeltaCents: number;
}

type DirectionFilter = 'all' | 'inbound' | 'outbound';
type DecisionFilter = 'all' | 'allow' | 'deny' | 'revoke';

function decisionTone(d: string): 'blue' | 'red' | 'yellow' | 'muted' {
  if (d === 'allow') return 'blue';
  if (d === 'deny') return 'red';
  if (d === 'revoke') return 'yellow';
  return 'muted';
}

function directionArrow(d: string): string {
  if (d === 'inbound') return '←';
  if (d === 'outbound') return '→';
  return '•';
}

export function AuditViewer({
  connectionId,
  initialEntries,
  initialCursor,
  agentDid,
  peerDid,
  connectionStatus,
  pageSize,
}: {
  connectionId: string;
  initialEntries: AuditEntry[];
  initialCursor: string | null;
  agentDid: string;
  peerDid: string;
  connectionStatus: string;
  pageSize: number;
}): React.JSX.Element {
  const [entries, setEntries] = useState<AuditEntry[]>(initialEntries);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [decision, setDecision] = useState<DecisionFilter>('all');
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  // On first paint, re-fetch so `direction` is resolved from the messages
  // table (the server-side seed assigns `system` to every row; the API
  // returns the proper inbound/outbound tag per row).
  const [refreshed, setRefreshed] = useState(false);

  const baseParams = useCallback(
    (withCursor: string | null): URLSearchParams => {
      const params = new URLSearchParams({
        limit: String(pageSize),
      });
      if (direction !== 'all') params.set('direction', direction);
      if (decision !== 'all') params.set('decision', decision);
      if (withCursor) params.set('cursor', withCursor);
      return params;
    },
    [direction, decision, pageSize],
  );

  const fetchPage = useCallback(
    async (append: boolean, useCursor: string | null) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/connections/${encodeURIComponent(connectionId)}/audit?${baseParams(useCursor).toString()}`,
        );
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        const body = (await res.json()) as {
          entries: AuditEntry[];
          nextCursor: string | null;
        };
        setEntries((prev) => (append ? [...prev, ...body.entries] : body.entries));
        setCursor(body.nextCursor);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [baseParams, connectionId],
  );

  useEffect(() => {
    if (refreshed) return;
    setRefreshed(true);
    void fetchPage(false, null);
  }, [refreshed, fetchPage]);

  const applyFilter = useCallback(
    (next: { direction?: DirectionFilter; decision?: DecisionFilter }) => {
      if (next.direction) setDirection(next.direction);
      if (next.decision) setDecision(next.decision);
      // fetchPage reads the latest filter state on next render; drive it
      // via a microtask so state is committed first.
      queueMicrotask(() => {
        void fetchPage(false, null);
      });
    },
    [fetchPage],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4 items-center pb-4 border-b border-rule">
        <div className="flex items-center gap-2">
          <span className="font-mono text-kicker uppercase text-muted">DIR</span>
          {(['all', 'inbound', 'outbound'] as DirectionFilter[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => applyFilter({ direction: d })}
              className={`font-mono text-kicker uppercase px-3 py-2 border ${
                direction === d
                  ? 'border-ink bg-ink text-paper'
                  : 'border-rule bg-paper text-muted hover:text-ink'
              }`}
              data-testid={`audit-direction-${d}`}
            >
              {d === 'all' ? 'ALL' : d.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-kicker uppercase text-muted">DEC</span>
          {(['all', 'allow', 'deny', 'revoke'] as DecisionFilter[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => applyFilter({ decision: d })}
              className={`font-mono text-kicker uppercase px-3 py-2 border ${
                decision === d
                  ? 'border-ink bg-ink text-paper'
                  : 'border-rule bg-paper text-muted hover:text-ink'
              }`}
              data-testid={`audit-decision-${d}`}
            >
              {d.toUpperCase()}
            </button>
          ))}
        </div>
        {busy && (
          <span className="font-mono text-kicker uppercase text-muted" data-testid="audit-busy">
            LOADING…
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 border border-signal-red bg-paper p-3 font-mono text-kicker uppercase text-signal-red">
          ERROR: {error}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="border border-rule bg-paper p-7">
          <Badge tone="muted" className="mb-3">NO ENTRIES</Badge>
          <p className="text-body">
            No audit entries match these filters. Entries are appended whenever
            your agent receives, emits, or is told to revoke something against
            this connection.
          </p>
          <p className="mt-4 text-body-sm">
            Connection status:{' '}
            <Badge tone={connectionStatus === 'active' ? 'blue' : 'red'}>
              {connectionStatus.toUpperCase()}
            </Badge>
          </p>
        </div>
      ) : (
        <ul className="list-none p-0 m-0 border-t border-rule" data-testid="audit-list">
          {entries.map((e) => {
            const open = openEntry === e.id;
            return (
              <li
                key={e.id}
                className="border-b border-rule"
              >
                <button
                  type="button"
                  onClick={() => setOpenEntry(open ? null : e.id)}
                  className="w-full text-left py-3 grid grid-cols-12 gap-4 items-baseline hover:bg-paper-2"
                  aria-expanded={open}
                  data-testid={`audit-row-${e.seq}`}
                >
                  <div className="col-span-6 md:col-span-2 font-mono text-kicker uppercase text-muted">
                    seq {e.seq}
                  </div>
                  <div className="col-span-6 md:col-span-1 font-mono text-kicker uppercase text-ink">
                    {directionArrow(e.direction)} {e.direction.toUpperCase()}
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Badge tone={decisionTone(e.decision)}>
                      {e.decision.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="col-span-12 md:col-span-4 text-body-sm text-ink-2 break-all">
                    {e.reason ?? '—'}
                  </div>
                  <div className="col-span-12 md:col-span-3 md:text-right font-mono text-kicker uppercase text-muted">
                    {new Date(e.timestamp).toLocaleString()}
                  </div>
                </button>
                {open && (
                  <div className="px-2 pb-4 pt-1 grid grid-cols-12 gap-4">
                    <div className="col-span-12 md:col-span-6">
                      <div className="font-mono text-kicker uppercase text-muted">
                        MSG ID
                      </div>
                      <div className="text-body-sm break-all">
                        <Code>{e.msgId}</Code>
                      </div>
                    </div>
                    <div className="col-span-12 md:col-span-6">
                      <div className="font-mono text-kicker uppercase text-muted">
                        PEER
                      </div>
                      <div className="text-body-sm break-all">
                        <Code>{e.peerDid}</Code>
                      </div>
                    </div>
                    {e.policiesFired.length > 0 && (
                      <div className="col-span-12">
                        <div className="font-mono text-kicker uppercase text-muted">
                          POLICIES FIRED
                        </div>
                        <ul className="mt-1 text-body-sm text-ink-2">
                          {e.policiesFired.map((p) => (
                            <li key={p} className="font-mono">{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {e.obligations.length > 0 && (
                      <div className="col-span-12">
                        <div className="font-mono text-kicker uppercase text-muted">
                          OBLIGATIONS
                        </div>
                        <pre className="mt-1 text-body-sm text-ink-2 whitespace-pre-wrap break-all">
                          {JSON.stringify(e.obligations, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {cursor && (
        <div className="mt-6">
          <Button
            variant="default"
            onClick={() => void fetchPage(true, cursor)}
            disabled={busy}
            data-testid="audit-load-more"
          >
            {busy ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}

      <div className="mt-8 pt-4 border-t border-rule font-mono text-kicker uppercase text-muted">
        <Link
          href={`/connections/${encodeURIComponent(connectionId)}`}
          variant="mono"
        >
          ← BACK TO CONNECTION
        </Link>
        {' · '}
        <span>AGENT {agentDid.slice(0, 20)}…</span>
        {' · '}
        <span>PEER {peerDid.slice(0, 20)}…</span>
      </div>
    </div>
  );
}
