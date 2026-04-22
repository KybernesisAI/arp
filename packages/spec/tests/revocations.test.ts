import { describe, it, expect } from 'vitest';
import { RevocationsSchema } from '../src/index.js';
import { VALID_REVOCATIONS, clone } from './fixtures.js';

describe('RevocationsSchema', () => {
  it('accepts the reference list', () => {
    expect(RevocationsSchema.safeParse(VALID_REVOCATIONS).success).toBe(true);
  });

  it('accepts an empty revocations array', () => {
    const ok = clone(VALID_REVOCATIONS);
    ok.revocations = [];
    expect(RevocationsSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects unknown revocation types (discriminated union)', () => {
    const bad = clone(VALID_REVOCATIONS) as unknown as {
      revocations: Array<{ type: string; [k: string]: unknown }>;
    };
    bad.revocations[0] = { type: 'wallet', id: 'x', revoked_at: '2026-04-22T00:00:00Z' };
    expect(RevocationsSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects key-revocation with bad fingerprint format', () => {
    const bad = clone(VALID_REVOCATIONS) as unknown as {
      revocations: Array<{ type: string; fingerprint: string; revoked_at: string }>;
    };
    bad.revocations[1] = {
      type: 'key',
      fingerprint: 'md5:short',
      revoked_at: '2026-04-15T08:00:00Z',
    };
    expect(RevocationsSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-EdDSA signature alg', () => {
    const bad = clone(VALID_REVOCATIONS);
    (bad.signature as { alg: string }).alg = 'RS256';
    expect(RevocationsSchema.safeParse(bad).success).toBe(false);
  });
});
