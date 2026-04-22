import { describe, it, expect } from 'vitest';
import { ConnectionTokenSchema } from '../src/index.js';
import { VALID_CONNECTION_TOKEN, clone } from './fixtures.js';

describe('ConnectionTokenSchema', () => {
  it('accepts the reference token', () => {
    expect(ConnectionTokenSchema.safeParse(VALID_CONNECTION_TOKEN).success).toBe(true);
  });

  it('rejects a bare id without the conn_ prefix', () => {
    const bad = clone(VALID_CONNECTION_TOKEN);
    bad.connection_id = '7a3f00112233';
    expect(ConnectionTokenSchema.safeParse(bad).success).toBe(false);
  });

  it('requires at least 2 signatures', () => {
    const bad = clone(VALID_CONNECTION_TOKEN);
    bad.sigs = { ian: 'only-one' };
    expect(ConnectionTokenSchema.safeParse(bad).success).toBe(false);
  });

  it('requires at least one cedar policy', () => {
    const bad = clone(VALID_CONNECTION_TOKEN);
    bad.cedar_policies = [];
    expect(ConnectionTokenSchema.safeParse(bad).success).toBe(false);
  });

  it('defaults obligations to []', () => {
    const input: Record<string, unknown> = clone(VALID_CONNECTION_TOKEN);
    delete input.obligations;
    const parsed = ConnectionTokenSchema.parse(input);
    expect(parsed.obligations).toEqual([]);
  });
});
