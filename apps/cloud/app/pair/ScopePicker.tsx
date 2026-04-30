'use client';

import type * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button } from '@/components/ui';
import type { ScopeTemplate } from '@kybernesis/arp-spec';

/**
 * Per-scope picker + per-parameter editor.
 *
 * Replaces the bundle-only dropdown. The issuer (Mythos when offering)
 * or whoever is editing a connection picks each scope individually and
 * fills in its parameters — `project_id="alpha"`, `days_ahead=7`,
 * `attribute_allowlist=['name','email']`, etc. Bundles are still
 * offered as "load this preset" shortcuts: clicking applies the
 * bundle's scope set + non-`<user-picks>` defaults; the user can then
 * adjust anything before signing.
 *
 * Emits two values up to the parent on change:
 *   - selectedScopeIds: in iteration order across categories
 *   - paramsMap: { [scopeId]: { [paramName]: value } }
 *
 * Validation:
 *   - required params with empty values block the parent's submit
 *   - integer / decimal / enum / duration / DID validations enforced
 *     per type as the user types (red inline message)
 *   - the parent is told whether the picker is "valid" via onValidChange
 */

export interface BundlePreset {
  id: string;
  label: string;
  description: string;
  scopes: Array<{ id: string; params?: Record<string, unknown> }>;
  needsParams?: boolean;
}

export interface ScopePickerProps {
  catalog: ScopeTemplate[];
  bundles: BundlePreset[];
  initialSelected?: string[];
  initialParams?: Record<string, Record<string, unknown>>;
  onChange: (state: ScopePickerState) => void;
}

export interface ScopePickerState {
  selectedIds: string[];
  paramsMap: Record<string, Record<string, unknown>>;
  valid: boolean;
  /** Per-scope validation errors keyed by scopeId.paramName. */
  errors: Record<string, string>;
}

const RISK_TONE: Record<string, 'paper' | 'yellow' | 'red' | 'ink'> = {
  low: 'paper',
  medium: 'yellow',
  high: 'red',
  critical: 'red',
};

export function ScopePicker({
  catalog,
  bundles,
  initialSelected = [],
  initialParams = {},
  onChange,
}: ScopePickerProps): React.JSX.Element {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelected),
  );
  const [paramsMap, setParamsMap] = useState<Record<string, Record<string, unknown>>>(
    () => ({ ...initialParams }),
  );
  const [filter, setFilter] = useState('');

  const byCategory = useMemo(() => {
    const out: Record<string, ScopeTemplate[]> = {};
    for (const s of catalog) {
      if (!out[s.category]) out[s.category] = [];
      out[s.category]!.push(s);
    }
    for (const k of Object.keys(out)) {
      out[k]!.sort((a, b) => a.label.localeCompare(b.label));
    }
    return out;
  }, [catalog]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return byCategory;
    const q = filter.trim().toLowerCase();
    const out: Record<string, ScopeTemplate[]> = {};
    for (const [cat, list] of Object.entries(byCategory)) {
      const matches = list.filter(
        (s) =>
          s.id.includes(q) ||
          s.label.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
      );
      if (matches.length > 0) out[cat] = matches;
    }
    return out;
  }, [byCategory, filter]);

  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const id of selectedIds) {
      const tpl = catalog.find((s) => s.id === id);
      if (!tpl) continue;
      const params = paramsMap[id] ?? {};
      for (const p of tpl.parameters) {
        const v = params[p.name];
        if (p.required && (v === undefined || v === '' || v === null)) {
          out[`${id}.${p.name}`] = 'required';
          continue;
        }
        const err = validateValue(p.type, p.validation, v);
        if (err) out[`${id}.${p.name}`] = err;
      }
    }
    return out;
  }, [selectedIds, paramsMap, catalog]);

  const valid = selectedIds.size > 0 && Object.keys(errors).length === 0;

  // notify parent on every change. We stash onChange in a ref so the
  // effect doesn't refire when the parent re-renders with a fresh
  // closure — only when our actual state changes.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onChangeRef.current({
      selectedIds: Array.from(selectedIds),
      paramsMap,
      valid,
      errors,
    });
  }, [selectedIds, paramsMap, valid, errors]);

  function toggle(id: string): void {
    const tpl = catalog.find((s) => s.id === id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Don't auto-clear params — user might re-toggle and we should
        // remember what they typed.
      } else {
        next.add(id);
        // Fill in default values for any params that don't have a value yet
        if (tpl) {
          setParamsMap((p) => {
            const own = { ...(p[id] ?? {}) };
            for (const param of tpl.parameters) {
              if (own[param.name] === undefined && param.default !== undefined) {
                own[param.name] = param.default;
              }
            }
            return { ...p, [id]: own };
          });
        }
        // Auto-include implied scopes
        if (tpl?.implies?.length) {
          for (const impliedId of tpl.implies) {
            if (catalog.some((s) => s.id === impliedId)) {
              next.add(impliedId);
            }
          }
        }
      }
      return next;
    });
  }

  function applyPreset(bundle: BundlePreset): void {
    const nextSelected = new Set<string>();
    const nextParams: Record<string, Record<string, unknown>> = {};
    for (const s of bundle.scopes) {
      nextSelected.add(s.id);
      const own: Record<string, unknown> = {};
      const tpl = catalog.find((t) => t.id === s.id);
      // 1. Start with template defaults
      if (tpl) {
        for (const p of tpl.parameters) {
          if (p.default !== undefined) own[p.name] = p.default;
        }
      }
      // 2. Overlay bundle's pre-baked params (skip <user-picks> markers)
      if (s.params) {
        for (const [k, v] of Object.entries(s.params)) {
          if (v !== '<user-picks>') own[k] = v;
        }
      }
      nextParams[s.id] = own;
    }
    setSelectedIds(nextSelected);
    setParamsMap(nextParams);
  }

  function setParam(scopeId: string, paramName: string, value: unknown): void {
    setParamsMap((prev) => ({
      ...prev,
      [scopeId]: { ...(prev[scopeId] ?? {}), [paramName]: value },
    }));
  }

  return (
    <div className="space-y-4">
      {/* Bundle presets — collapsed by default into a kicker + button row. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <span className="font-mono text-kicker uppercase text-muted">
          PRESETS
        </span>
        {bundles.map((b) => (
          <Button
            key={b.id}
            variant="default"
            size="sm"
            onClick={() => applyPreset(b)}
            title={b.description + (b.needsParams ? ' (needs user-specific inputs)' : '')}
          >
            {b.label}
            {b.needsParams ? ' *' : ''}
          </Button>
        ))}
      </div>

      {/* Search + selected counter */}
      <div className="flex items-baseline justify-between gap-4 pb-1 border-b border-rule">
        <span className="font-mono text-kicker uppercase text-muted">
          {selectedIds.size} SELECTED · {Object.keys(errors).length} ERRORS
        </span>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter…"
          className="font-mono text-sm border border-rule bg-paper px-2 py-1 w-40"
        />
      </div>

      {/* Categories */}
      <div className="space-y-5">
        {Object.entries(filtered).map(([category, scopes]) => {
          const inCat = scopes.filter((s) => selectedIds.has(s.id)).length;
          return (
            <div key={category}>
              <div className="font-mono text-kicker uppercase text-muted mb-2 pb-1 border-b border-rule">
                {category} <span className="text-ink ml-1">{inCat}/{scopes.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {scopes.map((scope) => (
                  <ScopeRow
                    key={scope.id}
                    scope={scope}
                    selected={selectedIds.has(scope.id)}
                    params={paramsMap[scope.id] ?? {}}
                    errors={errors}
                    onToggle={() => toggle(scope.id)}
                    onParamChange={(name, value) => setParam(scope.id, name, value)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- single scope row ----------------------------------------------------

function ScopeRow({
  scope,
  selected,
  params,
  errors,
  onToggle,
  onParamChange,
}: {
  scope: ScopeTemplate;
  selected: boolean;
  params: Record<string, unknown>;
  errors: Record<string, string>;
  onToggle: () => void;
  onParamChange: (paramName: string, value: unknown) => void;
}): React.JSX.Element {
  const riskTone = RISK_TONE[scope.risk] ?? 'paper';
  const idForCheckbox = `scope-${scope.id}`;
  return (
    <label
      htmlFor={idForCheckbox}
      className={
        'block border border-rule p-3 cursor-pointer ' +
        (selected ? 'bg-paper' : 'bg-paper-2')
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <input
            id={idForCheckbox}
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="mt-0.5"
          />
          <span className="font-display font-medium text-h5">{scope.label}</span>
        </div>
        <Badge tone={riskTone} className="text-[9px] px-2 py-0.5">
          {scope.risk.toUpperCase()}
        </Badge>
      </div>
      <p className="text-body-sm text-ink-2 mt-1 ml-6">{scope.description}</p>

      {selected && scope.parameters.length > 0 && (
        <div className="mt-3 ml-6 space-y-2 pl-3 border-l-2 border-rule">
          {scope.parameters.map((p) => (
            <ParameterInput
              key={p.name}
              scopeId={scope.id}
              parameter={p}
              value={params[p.name]}
              error={errors[`${scope.id}.${p.name}`]}
              onChange={(v) => onParamChange(p.name, v)}
            />
          ))}
        </div>
      )}
    </label>
  );
}

// ---- parameter input -----------------------------------------------------

function ParameterInput({
  scopeId,
  parameter,
  value,
  error,
  onChange,
}: {
  scopeId: string;
  parameter: ScopeTemplate['parameters'][number];
  value: unknown;
  error: string | undefined;
  onChange: (value: unknown) => void;
}): React.JSX.Element {
  const { name, type, required, validation } = parameter;
  const id = `${scopeId}-${name}`;
  const labelText = `${name}${required ? ' *' : ''} (${type})`;

  // Multi-string types render as a comma-separated input that we split.
  const isMulti =
    type === 'AttributeList' ||
    type === 'AgentDIDList' ||
    type === 'ToolIDList' ||
    type === 'EmailList';

  if (type === 'Enum') {
    const choices: string[] = Array.isArray(validation) ? validation : [];
    return (
      <div>
        <label htmlFor={id} className="font-mono text-kicker uppercase text-muted block">
          {labelText}
        </label>
        <select
          id={id}
          className="mt-1 w-full border border-rule bg-paper px-2 py-1 font-mono text-sm"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— pick one —</option>
          {choices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {error && <span className="text-signal-red text-body-sm">{error}</span>}
      </div>
    );
  }

  if (type === 'Integer' || type === 'Decimal') {
    const range = typeof validation === 'string' ? parseRange(validation) : null;
    return (
      <div>
        <label htmlFor={id} className="font-mono text-kicker uppercase text-muted block">
          {labelText} {range ? <>· {range.min}…{range.max}</> : null}
        </label>
        <input
          id={id}
          type="number"
          step={type === 'Integer' ? 1 : 'any'}
          className="mt-1 w-full border border-rule bg-paper px-2 py-1 font-mono text-sm"
          value={(value as number | string | undefined) ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onChange(undefined);
            const n = type === 'Integer' ? parseInt(raw, 10) : Number(raw);
            onChange(Number.isFinite(n) ? n : raw);
          }}
        />
        {error && <span className="text-signal-red text-body-sm">{error}</span>}
      </div>
    );
  }

  if (isMulti) {
    return (
      <MultiStringInput
        id={id}
        labelText={labelText}
        value={value}
        type={type}
        error={error}
        onChange={onChange}
      />
    );
  }

  // Default: text input. Covers ProjectID, AgentDID (single), Duration,
  // Timezone, IANATimezone — each with type-specific validation in
  // validateValue() which surfaces the error inline.
  return (
    <div>
      <label htmlFor={id} className="font-mono text-kicker uppercase text-muted block">
        {labelText}
      </label>
      <input
        id={id}
        type="text"
        className="mt-1 w-full border border-rule bg-paper px-2 py-1 font-mono text-sm"
        value={(value as string | undefined) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholderFor(type)}
      />
      {error && <span className="text-signal-red text-body-sm">{error}</span>}
    </div>
  );
}

/**
 * Comma-separated multi-string input. The parent stores the value as
 * `string[]` (so the proposal carries the right shape), but if we
 * naïvely render `arr.join(', ')` and re-split on every keystroke,
 * trailing commas + spaces vanish mid-typing and the user can't enter
 * more than one item. We keep a local `draft` string that mirrors what
 * the user actually typed, only re-syncing it from the parent value
 * when an external change (e.g., preset apply) lands.
 */
function MultiStringInput({
  id,
  labelText,
  value,
  type,
  error,
  onChange,
}: {
  id: string;
  labelText: string;
  value: unknown;
  type: string;
  error: string | undefined;
  onChange: (value: unknown) => void;
}): React.JSX.Element {
  const arr = Array.isArray(value) ? (value as string[]) : [];
  const [draft, setDraft] = useState(arr.join(', '));
  const lastEmittedRef = useRef(draft);
  // External value change (preset apply, initialParams) → reset draft.
  useEffect(() => {
    const formatted = arr.join(', ');
    if (formatted !== lastEmittedRef.current) {
      setDraft(formatted);
      lastEmittedRef.current = formatted;
    }
    // intentionally only depend on the array contents
  }, [arr.join('|')]);
  return (
    <div>
      <label htmlFor={id} className="font-mono text-kicker uppercase text-muted block">
        {labelText} · COMMA-SEPARATED
      </label>
      <input
        id={id}
        type="text"
        className="mt-1 w-full border border-rule bg-paper px-2 py-1 font-mono text-sm"
        value={draft}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const split = raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          lastEmittedRef.current = split.join(', ');
          onChange(split);
        }}
        placeholder={
          type === 'AttributeList'
            ? 'name, email, company'
            : type === 'EmailList'
              ? 'a@example.com, b@example.com'
              : 'did:web:foo.agent, did:web:bar.agent'
        }
      />
      {error && <span className="text-signal-red text-body-sm">{error}</span>}
    </div>
  );
}

// ---- helpers -------------------------------------------------------------

function parseRange(spec: string): { min: number; max: number } | null {
  const m = spec.match(/^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return { min: Number(m[1]), max: Number(m[2]) };
}

function placeholderFor(type: string): string {
  switch (type) {
    case 'ProjectID':
      return 'alpha';
    case 'AgentDID':
      return 'did:web:peer.agent';
    case 'Duration':
      return 'P30D · P1H30M';
    case 'IANATimezone':
    case 'Timezone':
      return 'Asia/Bangkok';
    default:
      return '';
  }
}

function validateValue(
  type: string,
  validation: string | string[] | undefined,
  value: unknown,
): string | null {
  if (value === undefined || value === '' || value === null) return null;
  switch (type) {
    case 'Integer': {
      if (!Number.isInteger(value)) return 'must be an integer';
      if (typeof validation === 'string') {
        const r = parseRange(validation);
        if (r && (typeof value === 'number') && (value < r.min || value > r.max)) {
          return `must be ${r.min}…${r.max}`;
        }
      }
      return null;
    }
    case 'Decimal': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 'must be a number';
      }
      if (typeof validation === 'string') {
        const r = parseRange(validation);
        if (r && (value < r.min || value > r.max)) {
          return `must be ${r.min}…${r.max}`;
        }
      }
      return null;
    }
    case 'Enum': {
      if (Array.isArray(validation) && !validation.includes(String(value))) {
        return `must be one of ${validation.join(', ')}`;
      }
      return null;
    }
    case 'ProjectID': {
      if (typeof value !== 'string' || !/^[A-Za-z0-9._-]+$/.test(value)) {
        return 'must be alphanumeric (._- allowed)';
      }
      return null;
    }
    case 'AgentDID': {
      if (typeof value !== 'string' || !/^did:[a-z0-9]+:.+/.test(value)) {
        return 'must be a did: URI';
      }
      return null;
    }
    case 'AgentDIDList':
    case 'ToolIDList':
    case 'AttributeList':
    case 'EmailList': {
      if (!Array.isArray(value) || value.length === 0) return 'list cannot be empty';
      if (type === 'EmailList') {
        for (const v of value) {
          if (typeof v !== 'string' || !v.includes('@')) {
            return `not an email: ${String(v)}`;
          }
        }
      }
      if (type === 'AgentDIDList') {
        for (const v of value) {
          if (typeof v !== 'string' || !/^did:[a-z0-9]+:.+/.test(v)) {
            return `not a did: URI: ${String(v)}`;
          }
        }
      }
      return null;
    }
    case 'Duration': {
      if (typeof value !== 'string' || !/^P/.test(value)) {
        return 'ISO-8601 duration (e.g. P30D, PT60M)';
      }
      return null;
    }
    case 'IANATimezone':
    case 'Timezone': {
      if (typeof value !== 'string' || !value.includes('/')) {
        return 'must look like Region/City';
      }
      return null;
    }
    default:
      return null;
  }
}

