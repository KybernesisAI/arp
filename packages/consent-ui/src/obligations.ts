import type { Obligation } from '@kybernesis/arp-spec';

export interface ObligationRenderResult {
  /** Bullets that belong under "will not be able to". */
  willNotBeAbleTo: string[];
  /** Bullets that belong under "conditions". */
  conditions: string[];
  /** Additional things the peer must prove (VCs). */
  willProve: string[];
}

/**
 * Translate the ARP obligation types (see `ARP-policy-examples.md §7`) into
 * user-facing bullets. Unknown obligation types fall through to a generic
 * description so consent copy never silently drops a constraint.
 */
export function renderObligations(
  obligations: readonly Obligation[],
): ObligationRenderResult {
  const willNotBeAbleTo: string[] = [];
  const conditions: string[] = [];
  const willProve: string[] = [];

  for (const ob of obligations) {
    const p = ob.params ?? {};
    switch (ob.type) {
      case 'redact_fields': {
        const fields = coerceStringArray(p.fields);
        if (fields.length > 0) {
          willNotBeAbleTo.push(`See ${fields.join(', ')} in any response.`);
        } else {
          willNotBeAbleTo.push('See redacted fields.');
        }
        break;
      }
      case 'redact_regex': {
        const pattern = typeof p.pattern === 'string' ? p.pattern : 'redaction regex';
        willNotBeAbleTo.push(`See content matching ${pattern}.`);
        break;
      }
      case 'redact_fields_except': {
        const allowlist = parseAllowlist(p.allowlist);
        if (allowlist.length > 0) {
          willNotBeAbleTo.push(
            `See any fields other than: ${allowlist.join(', ')}.`,
          );
        } else {
          willNotBeAbleTo.push('See any fields outside the configured allowlist.');
        }
        break;
      }
      case 'summarize_only': {
        const words = numberOr(p.max_words, null);
        conditions.push(
          words !== null
            ? `Responses are summarized (max ${words} words).`
            : 'Responses are summary-only.',
        );
        break;
      }
      case 'aggregate_only': {
        conditions.push('Responses return counts/aggregates only, never raw rows.');
        break;
      }
      case 'rate_limit': {
        const perHour = numberOr(p.max_requests_per_hour, null);
        const perMin = numberOr(p.max_requests_per_minute, null);
        const perDay = numberOr(p.max_requests_per_day, null);
        if (perHour !== null) conditions.push(`Rate-limited to ${perHour} requests per hour.`);
        else if (perMin !== null) conditions.push(`Rate-limited to ${perMin} requests per minute.`);
        else if (perDay !== null) conditions.push(`Rate-limited to ${perDay} requests per day.`);
        else conditions.push('Rate-limited.');
        break;
      }
      case 'require_fresh_consent': {
        const prompt = typeof p.prompt === 'string' ? p.prompt : null;
        const age = numberOr(p.max_age_seconds, null);
        if (prompt) {
          conditions.push(
            age !== null
              ? `Requires your re-consent (within ${humanizeSeconds(age)}) for: ${prompt}`
              : `Requires your re-consent for: ${prompt}`,
          );
        } else {
          conditions.push(
            age !== null
              ? `Requires your re-consent within ${humanizeSeconds(age)}.`
              : 'Requires your re-consent.',
          );
        }
        break;
      }
      case 'require_vc': {
        const vc = typeof p.vc_type === 'string' ? p.vc_type : null;
        if (vc) willProve.push(vc);
        else conditions.push('Requires a verifiable credential.');
        break;
      }
      case 'log_audit_level':
      case 'audit_level': {
        const level = typeof p.level === 'string' ? p.level : 'elevated';
        conditions.push(`Audit log detail: ${level}.`);
        break;
      }
      case 'log_zk_disclosure': {
        conditions.push('ZK proof disclosures are logged.');
        break;
      }
      case 'require_principal_confirmation': {
        const age = numberOr(p.max_age_seconds, null);
        if (age === 0 || age === null) {
          conditions.push('Requires your explicit confirmation each time.');
        } else {
          conditions.push(
            `Requires your confirmation (within ${humanizeSeconds(age)}).`,
          );
        }
        break;
      }
      case 'delete_after': {
        const ttl = numberOr(p.ttl_seconds, null);
        if (ttl !== null) {
          conditions.push(
            `Responses expire after ${humanizeSeconds(ttl)} (sticky TTL).`,
          );
        } else {
          conditions.push('Responses carry a time-to-live.');
        }
        break;
      }
      case 'no_downstream_share': {
        willNotBeAbleTo.push('Re-share responses with another agent.');
        break;
      }
      case 'notify_principal': {
        conditions.push('You will be notified after each qualifying request.');
        break;
      }
      case 'charge_usd': {
        const amount = numberOr(p.amount, null);
        conditions.push(
          amount !== null
            ? `Triggers a $${amount} charge via x402.`
            : 'Triggers a charge via x402.',
        );
        break;
      }
      case 'insert_watermark': {
        conditions.push('Responses carry a traceable watermark.');
        break;
      }
      case 'spend_cap_per_txn': {
        const usd = numberOr(p.max_usd, null);
        if (usd !== null) conditions.push(`Max $${usd} per request.`);
        break;
      }
      case 'spend_cap_window': {
        const usd = numberOr(p.max_usd, null);
        const windowSec = numberOr(p.window_seconds, null);
        if (usd !== null && windowSec !== null) {
          conditions.push(
            `Max $${usd} spend per ${humanizeSeconds(windowSec)}.`,
          );
        } else if (usd !== null) {
          conditions.push(`Max $${usd} spend (rolling).`);
        }
        break;
      }
      case 'time_window': {
        const days = coerceStringArray(p.days);
        const startH = numberOr(p.start_hour, null);
        const endH = numberOr(p.end_hour, null);
        const tz = typeof p.timezone === 'string' ? p.timezone : null;
        const dayText =
          days.length === 0
            ? 'any day'
            : days.length === 5 && days.every((d) => WEEKDAYS.includes(d))
              ? 'weekdays'
              : days.join(', ');
        const hourText =
          startH !== null && endH !== null
            ? `${pad(startH)}:00–${pad(endH)}:00`
            : 'configured hours';
        conditions.push(
          tz
            ? `Access limited to ${dayText}, ${hourText} ${tz}.`
            : `Access limited to ${dayText}, ${hourText}.`,
        );
        break;
      }
      default: {
        conditions.push(formatUnknown(ob));
      }
    }
  }

  return { willNotBeAbleTo, conditions, willProve };
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function humanizeSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

function parseAllowlist(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') {
    // Catalog sometimes emits a JSON-encoded array via Handlebars helpers
    // (e.g. `allowlist: "{{attribute_allowlist_json}}"`). Best-effort parse;
    // fall back to the raw string.
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string');
      }
    } catch {
      // not JSON — keep the literal for debugging
    }
    return v ? [v] : [];
  }
  return [];
}

function coerceStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function numberOr(v: unknown, fallback: number | null): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function formatUnknown(ob: Obligation): string {
  const keys = Object.keys(ob.params ?? {});
  if (keys.length === 0) return `Custom obligation: ${ob.type}.`;
  const pairs = keys.map((k) => `${k}=${JSON.stringify(ob.params[k])}`).join(', ');
  return `Custom obligation: ${ob.type} (${pairs}).`;
}
