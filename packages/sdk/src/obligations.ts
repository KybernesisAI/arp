/**
 * Egress obligation pipeline.
 *
 * Applies the obligations attached to a PDP decision (plus the static
 * Connection-Token obligations the runtime already merged in) to a reply
 * payload before it leaves the agent. The runtime does NOT currently apply
 * these obligations to outbound replies — that's the SDK's job on the
 * developer-facing `egress()` integration point.
 *
 * Supported obligation types (v0):
 *   - `redact_fields`        strip named keys (dot-path) from the payload
 *   - `redact_fields_except` keep only named keys (complement)
 *   - `redact_regex`         strip string values matching a regex
 *   - `summarize_only`       replace the payload with a `{summary}` marker
 *   - `aggregate_only`       replace rows with `{count, aggregate: 'count'}`
 *   - `insert_watermark`     attach a `_watermark` field
 *   - `no_downstream_share`  attach a `_no_downstream_share` marker
 *
 * Unknown obligation types are logged (via the caller's logger, if any) and
 * passed through — never silently dropped. Downstream adapters (or the
 * application) can layer on handling for the richer types (`rate_limit`,
 * `charge_usd`, `notify_principal`) which are not response-transforms.
 */

import type { Obligation } from '@kybernesis/arp-spec';

export interface ObligationApplyOptions {
  /** Called once per obligation type the runtime did not understand. */
  onUnknown?: (obligationType: string, params: Record<string, unknown>) => void;
}

/**
 * Apply the supplied obligations to `payload`. Returns a new object — never
 * mutates the input.
 */
export function applyObligations(
  payload: unknown,
  obligations: Obligation[],
  opts: ObligationApplyOptions = {},
): unknown {
  let current = cloneDeep(payload);
  for (const o of obligations) {
    current = applyOne(current, o, opts);
  }
  return current;
}

function applyOne(
  payload: unknown,
  obligation: Obligation,
  opts: ObligationApplyOptions,
): unknown {
  switch (obligation.type) {
    case 'redact_fields':
      return redactFields(payload, stringArray(obligation.params.fields));
    case 'redact_fields_except':
      return redactFieldsExcept(
        payload,
        stringArray(obligation.params.fields),
      );
    case 'redact_regex': {
      const pattern = typeof obligation.params.pattern === 'string'
        ? obligation.params.pattern
        : null;
      if (!pattern) return payload;
      return redactRegex(payload, pattern, typeof obligation.params.replacement === 'string'
        ? obligation.params.replacement
        : '[redacted]');
    }
    case 'summarize_only': {
      const max = typeof obligation.params.max_words === 'number'
        ? obligation.params.max_words
        : 50;
      return summarizeOnly(payload, max);
    }
    case 'aggregate_only':
      return aggregateOnly(payload);
    case 'insert_watermark':
      return insertWatermark(payload, obligation.params);
    case 'no_downstream_share':
      return addMarker(payload, '_no_downstream_share', true);
    // Non-response obligations (rate_limit, require_fresh_consent, etc.)
    // are enforced elsewhere in the pipeline; they pass through here.
    case 'rate_limit':
    case 'require_fresh_consent':
    case 'require_vc':
    case 'log_audit_level':
    case 'delete_after':
    case 'notify_principal':
    case 'charge_usd':
      return payload;
    default:
      opts.onUnknown?.(obligation.type, obligation.params);
      return payload;
  }
}

/* --------------------------- helpers --------------------------- */

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function redactFields(payload: unknown, fields: string[]): unknown {
  if (fields.length === 0) return payload;
  const out = cloneDeep(payload);
  for (const path of fields) {
    deletePath(out, path.split('.'));
  }
  return out;
}

export function redactFieldsExcept(
  payload: unknown,
  fields: string[],
): unknown {
  if (!isPlainObject(payload)) return payload;
  if (fields.length === 0) return {};
  const allow = new Set(fields);
  const keep: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (allow.has(k)) keep[k] = v;
  }
  return keep;
}

export function redactRegex(
  payload: unknown,
  pattern: string,
  replacement: string,
): unknown {
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'g');
  } catch {
    return payload;
  }
  return walkStrings(payload, (s) => s.replace(re, replacement));
}

function summarizeOnly(payload: unknown, maxWords: number): unknown {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const words = text.split(/\s+/).filter(Boolean);
  const summary = words.slice(0, maxWords).join(' ');
  return { summary, _obligation: 'summarize_only', max_words: maxWords };
}

function aggregateOnly(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return { count: payload.length, aggregate: 'count', _obligation: 'aggregate_only' };
  }
  if (isPlainObject(payload)) {
    for (const [k, v] of Object.entries(payload)) {
      if (Array.isArray(v)) {
        return { [k]: { count: v.length, aggregate: 'count' }, _obligation: 'aggregate_only' };
      }
    }
  }
  return { aggregate: 'count', count: 1, _obligation: 'aggregate_only' };
}

function insertWatermark(
  payload: unknown,
  params: Record<string, unknown>,
): unknown {
  return addMarker(payload, '_watermark', params);
}

function addMarker(payload: unknown, key: string, value: unknown): unknown {
  if (!isPlainObject(payload)) {
    return { value: payload, [key]: value };
  }
  return { ...payload, [key]: value };
}

function deletePath(target: unknown, segments: string[]): void {
  if (!isPlainObject(target) || segments.length === 0) return;
  const [head, ...rest] = segments;
  if (head === undefined) return;
  if (rest.length === 0) {
    delete (target as Record<string, unknown>)[head];
    return;
  }
  const next = (target as Record<string, unknown>)[head];
  if (Array.isArray(next)) {
    for (const item of next) deletePath(item, rest);
    return;
  }
  deletePath(next, rest);
}

function walkStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => walkStrings(v, fn));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = walkStrings(v, fn);
    return out;
  }
  return value;
}

function cloneDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneDeep) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = cloneDeep(v);
  }
  return out as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
