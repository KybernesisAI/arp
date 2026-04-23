import { describe, expect, it } from 'vitest';
import { applyObligations } from '../src/obligations.js';
import type { Obligation } from '../src/types.js';

describe('applyObligations', () => {
  it('redact_fields removes named top-level paths', () => {
    const obl: Obligation[] = [
      { type: 'redact_fields', params: { fields: ['client.email', 'client.phone'] } },
    ];
    const out = applyObligations(
      { client: { name: 'X', email: 'a@b', phone: '555' } },
      obl,
    ) as { client: Record<string, unknown> };
    expect(out.client.name).toBe('X');
    expect(out.client.email).toBeUndefined();
    expect(out.client.phone).toBeUndefined();
  });

  it('redact_fields_except keeps only named top-level keys', () => {
    const obl: Obligation[] = [
      { type: 'redact_fields_except', params: { fields: ['summary'] } },
    ];
    const out = applyObligations(
      { summary: 'ok', internal: 'hidden' },
      obl,
    ) as Record<string, unknown>;
    expect(out.summary).toBe('ok');
    expect(out.internal).toBeUndefined();
  });

  it('redact_regex replaces substrings matching the pattern', () => {
    const obl: Obligation[] = [
      { type: 'redact_regex', params: { pattern: '\\d{3}-\\d{4}', replacement: '[ssn]' } },
    ];
    const out = applyObligations({ note: 'call 555-1234 asap' }, obl) as Record<string, unknown>;
    expect(out.note).toBe('call [ssn] asap');
  });

  it('summarize_only caps the payload to N words', () => {
    const obl: Obligation[] = [
      { type: 'summarize_only', params: { max_words: 3 } },
    ];
    const out = applyObligations('one two three four five', obl) as {
      summary: string;
    };
    expect(out.summary).toBe('one two three');
  });

  it('aggregate_only replaces arrays with a count', () => {
    const obl: Obligation[] = [{ type: 'aggregate_only', params: {} }];
    const out = applyObligations([1, 2, 3], obl) as { count: number };
    expect(out.count).toBe(3);
  });

  it('insert_watermark adds a _watermark field', () => {
    const obl: Obligation[] = [
      { type: 'insert_watermark', params: { tag: 'conn_abc' } },
    ];
    const out = applyObligations({ hello: 'world' }, obl) as Record<string, unknown>;
    expect(out.hello).toBe('world');
    expect(out._watermark).toEqual({ tag: 'conn_abc' });
  });

  it('unknown obligations pass through unchanged and invoke onUnknown', () => {
    const seen: string[] = [];
    const obl: Obligation[] = [
      { type: 'fancy_new_obligation', params: {} },
    ];
    const out = applyObligations({ x: 1 }, obl, {
      onUnknown: (t) => seen.push(t),
    }) as Record<string, unknown>;
    expect(out.x).toBe(1);
    expect(seen).toEqual(['fancy_new_obligation']);
  });

  it('non-payload obligations (rate_limit, charge_usd) pass through silently', () => {
    const obl: Obligation[] = [
      { type: 'rate_limit', params: { max_requests_per_hour: 10 } },
      { type: 'charge_usd', params: { amount_cents: 50 } },
    ];
    const out = applyObligations({ a: 1 }, obl) as Record<string, unknown>;
    expect(out).toEqual({ a: 1 });
  });
});
