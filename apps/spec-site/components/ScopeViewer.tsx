'use client';

import { useMemo, useState } from 'react';
import type * as React from 'react';

import { cn } from '@/lib/cn';
import type { Scope } from '@/lib/scope-catalog';

export type ScopeViewerProps = {
  scopes: Scope[];
  yaml: Record<string, string>;
};

type RiskFilter = 'all' | 'low' | 'medium' | 'high' | 'critical';

const RISK_TONES: Record<string, string> = {
  low: 'bg-signal-green/20 text-signal-green border-signal-green',
  medium: 'bg-signal-yellow/20 text-ink border-signal-yellow',
  high: 'bg-signal-red/20 text-signal-red border-signal-red',
  critical: 'bg-ink text-paper border-ink',
};

export function ScopeViewer({
  scopes,
  yaml,
}: ScopeViewerProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [risk, setRisk] = useState<RiskFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of scopes) set.add(s.category);
    return ['all', ...Array.from(set).sort()];
  }, [scopes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scopes.filter((s) => {
      if (category !== 'all' && s.category !== category) return false;
      if (risk !== 'all' && s.risk !== risk) return false;
      if (!q) return true;
      return (
        s.id.toLowerCase().includes(q) ||
        s.label.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      );
    });
  }, [scopes, query, category, risk]);

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-rule pb-6 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-1 flex-col gap-2">
          <label
            htmlFor="scope-search"
            className="font-mono text-kicker uppercase tracking-[0.14em] text-muted"
          >
            SEARCH
          </label>
          <input
            id="scope-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. calendar, read, audit"
            className="border border-rule bg-paper-2 px-3 py-2 font-sans text-body text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
            CATEGORY
          </span>
          <div className="flex flex-wrap gap-1">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  'border px-3 py-1 font-mono text-kicker uppercase tracking-[0.14em]',
                  c === category
                    ? 'border-ink bg-ink text-paper'
                    : 'border-rule bg-paper text-ink-2 hover:bg-paper-2',
                )}
              >
                {c.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
            RISK
          </span>
          <div className="flex flex-wrap gap-1">
            {(['all', 'low', 'medium', 'high', 'critical'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRisk(r)}
                className={cn(
                  'border px-3 py-1 font-mono text-kicker uppercase tracking-[0.14em]',
                  r === risk
                    ? 'border-ink bg-ink text-paper'
                    : 'border-rule bg-paper text-ink-2 hover:bg-paper-2',
                )}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pt-4 pb-2 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
        SHOWING {filtered.length} / {scopes.length}
      </div>

      <ul className="divide-y divide-rule border-y border-rule">
        {filtered.map((scope) => (
          <ScopeRow
            key={scope.id}
            scope={scope}
            yaml={yaml[scope.id]}
            open={openId === scope.id}
            onToggle={() =>
              setOpenId((cur) => (cur === scope.id ? null : scope.id))
            }
          />
        ))}
      </ul>

      {filtered.length === 0 ? (
        <div className="py-16 text-center font-mono text-kicker uppercase tracking-[0.14em] text-muted">
          NO SCOPES MATCH — TRY A WIDER SEARCH
        </div>
      ) : null}
    </div>
  );
}

function ScopeRow({
  scope,
  yaml,
  open,
  onToggle,
}: {
  scope: Scope;
  yaml: string | undefined;
  open: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'grid w-full grid-cols-12 gap-4 px-2 py-5 text-left',
          'hover:bg-paper-2',
        )}
        aria-expanded={open}
      >
        <div className="col-span-12 flex items-center gap-3 md:col-span-1">
          <span
            className={cn(
              'border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]',
              RISK_TONES[scope.risk] ?? 'border-rule text-muted',
            )}
          >
            {scope.risk}
          </span>
        </div>
        <div className="col-span-12 md:col-span-4">
          <div className="font-mono text-body-sm text-ink">{scope.id}</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            v{scope.version} · {scope.category}
          </div>
        </div>
        <div className="col-span-12 md:col-span-6">
          <div className="font-display text-[17px] leading-snug text-ink">
            {scope.label}
          </div>
          <div className="mt-1 font-sans text-body-sm text-ink-2">
            {scope.description}
          </div>
        </div>
        <div className="col-span-12 flex items-center justify-end font-mono text-kicker uppercase tracking-[0.14em] text-muted md:col-span-1">
          {open ? 'CLOSE −' : 'OPEN +'}
        </div>
      </button>

      {open ? (
        <div className="grid grid-cols-12 gap-4 border-t border-rule bg-paper-2 px-2 py-6">
          <div className="col-span-12 md:col-span-6">
            <h3 className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
              CONSENT TEXT
            </h3>
            <p className="mt-2 font-sans text-body-sm text-ink-2">
              {scope.consent_text_template}
            </p>

            {scope.parameters.length > 0 ? (
              <>
                <h3 className="mt-6 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
                  PARAMETERS
                </h3>
                <ul className="mt-2 space-y-1 font-mono text-body-sm text-ink-2">
                  {scope.parameters.map((p) => (
                    <li key={p.name}>
                      <span className="text-ink">{p.name}</span>
                      <span className="text-muted">
                        {' '}
                        : {p.type}
                        {p.default !== undefined
                          ? ` = ${JSON.stringify(p.default)}`
                          : ''}
                        {p.validation ? ` [${p.validation}]` : ''}
                        {p.required ? ' · required' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {scope.obligations_forced.length > 0 ? (
              <>
                <h3 className="mt-6 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
                  FORCED OBLIGATIONS
                </h3>
                <ul className="mt-2 space-y-1 font-mono text-body-sm text-ink-2">
                  {scope.obligations_forced.map((o, i) => (
                    <li key={`${o.type}-${i}`}>
                      <span className="text-ink">{o.type}</span>
                      {o.params && Object.keys(o.params).length > 0 ? (
                        <span className="text-muted">
                          {' '}
                          {JSON.stringify(o.params)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {scope.implies.length > 0 ? (
              <>
                <h3 className="mt-6 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
                  IMPLIES
                </h3>
                <ul className="mt-2 font-mono text-body-sm text-ink-2">
                  {scope.implies.map((id) => (
                    <li key={id}>{id}</li>
                  ))}
                </ul>
              </>
            ) : null}

            {scope.step_up_required ? (
              <div className="mt-6 border border-signal-red bg-signal-red/10 px-3 py-2 font-mono text-kicker uppercase tracking-[0.14em] text-signal-red">
                STEP-UP AUTH REQUIRED
              </div>
            ) : null}
          </div>

          <div className="col-span-12 md:col-span-6">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
                CEDAR TEMPLATE
              </h3>
            </div>
            <pre className="mt-2 max-h-80 overflow-auto border border-rule bg-paper px-3 py-2 font-mono text-[12px] leading-relaxed text-ink">
              {scope.cedar_template}
            </pre>

            {yaml ? (
              <>
                <div className="mt-6 flex items-center justify-between">
                  <h3 className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
                    SOURCE YAML
                  </h3>
                  <CopyYamlButton yaml={yaml} />
                </div>
                <pre className="mt-2 max-h-80 overflow-auto border border-rule bg-paper px-3 py-2 font-mono text-[12px] leading-relaxed text-ink">
                  {yaml}
                </pre>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function CopyYamlButton({ yaml }: { yaml: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(yaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API may be blocked in sandboxed contexts; UI just stays
      // at rest — we don't fall back to execCommand (deprecated).
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'border border-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]',
        copied ? 'bg-ink text-paper' : 'text-ink hover:bg-ink hover:text-paper',
      )}
    >
      {copied ? 'COPIED ✓' : 'COPY YAML'}
    </button>
  );
}
