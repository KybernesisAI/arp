import { describe, expect, it } from 'vitest';
import { parseObligationPolicy } from '../src/obligations.js';

describe('parseObligationPolicy', () => {
  it('extracts type + object-literal params', () => {
    const text = `
@obligation("redact_fields")
@obligation_params({ "fields": ["client.name", "client.email"] })
permit (principal, action, resource);
`;
    const r = parseObligationPolicy(text, 'o_0');
    expect(r.obligationType).toBe('redact_fields');
    expect(r.params).toEqual({ fields: ['client.name', 'client.email'] });
    expect(r.cleanedText).not.toContain('@obligation');
    expect(r.cleanedText).toContain('@id("o_0")');
  });

  it('extracts type + JSON-string params', () => {
    const text = `
@obligation("rate_limit")
@obligation_params("{\\"max_requests_per_hour\\":60}")
permit (principal, action, resource);
`;
    const r = parseObligationPolicy(text, 'o_0');
    expect(r.obligationType).toBe('rate_limit');
    expect(r.params).toEqual({ max_requests_per_hour: 60 });
  });

  it('accepts bare keys + single-quoted strings in the param literal', () => {
    const text = `
@obligation("require_fresh_consent")
@obligation_params({ max_age_seconds: 300, prompt: 'ghost requests bulk export' })
permit (principal, action, resource);
`;
    const r = parseObligationPolicy(text, 'o_0');
    expect(r.params).toEqual({
      max_age_seconds: 300,
      prompt: 'ghost requests bulk export',
    });
  });

  it('throws on a missing @obligation annotation', () => {
    const text = `permit (principal, action, resource);`;
    expect(() => parseObligationPolicy(text, 'o_0')).toThrow(/@obligation/);
  });

  it('preserves an existing @id', () => {
    const text = `
@id("my_custom")
@obligation("redact_fields")
@obligation_params({ "fields": ["x"] })
permit (principal, action, resource);
`;
    const r = parseObligationPolicy(text, 'o_0');
    expect(r.id).toBe('my_custom');
  });
});
