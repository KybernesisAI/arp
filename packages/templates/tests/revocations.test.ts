import { describe, it, expect } from 'vitest';
import { RevocationsSchema } from '@kybernesis/arp-spec';
import { buildRevocations } from '../src/index.js';
import { seededRng, randomDidWeb } from './helpers.js';

describe('buildRevocations', () => {
  it('produces a schema-valid empty list', () => {
    const doc = buildRevocations({
      issuer: 'did:web:ian.example.agent',
      signature: { kid: 'did:web:ian.example.agent#key-1', value: 'ZmFrZQ' },
    });
    expect(RevocationsSchema.safeParse(doc).success).toBe(true);
    expect(doc.revocations).toEqual([]);
  });

  it('passes through connection + key revocations', () => {
    const doc = buildRevocations({
      issuer: 'did:web:ian.example.agent',
      signature: { kid: 'did:web:ian.example.agent#key-1', value: 'ZmFrZQ' },
      revocations: [
        {
          type: 'connection',
          id: 'conn_abcd1234',
          revoked_at: '2026-04-22T10:00:00Z',
          reason: 'user_requested',
        },
        {
          type: 'key',
          fingerprint: 'sha256:0011223344556677',
          revoked_at: '2026-04-15T08:00:00Z',
        },
      ],
    });
    expect(doc.revocations).toHaveLength(2);
    expect(RevocationsSchema.safeParse(doc).success).toBe(true);
  });

  it('defaults updated_at to now when not supplied', () => {
    const before = Date.now();
    const doc = buildRevocations({
      issuer: 'did:web:ian.example.agent',
      signature: { kid: 'did:web:ian.example.agent#key-1', value: 'ZmFrZQ' },
    });
    const parsedAt = Date.parse(doc.updated_at);
    expect(parsedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(parsedAt).toBeLessThanOrEqual(Date.now() + 1000);
  });

  const rng = seededRng(0xc0ffee);
  for (let i = 0; i < 10; i += 1) {
    const issuer = randomDidWeb(rng, 'example.agent');
    it(`property #${i + 1}: random issuer yields valid revocation doc`, () => {
      const doc = buildRevocations({
        issuer,
        signature: { kid: `${issuer}#key-1`, value: 'ZmFrZQ' },
      });
      expect(RevocationsSchema.safeParse(doc).success).toBe(true);
    });
  }
});
