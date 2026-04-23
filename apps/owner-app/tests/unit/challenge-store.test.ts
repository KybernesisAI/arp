import { describe, it, expect } from 'vitest';
import { issueChallenge, consumeChallenge } from '../../lib/challenge-store';

describe('challenge-store', () => {
  it('consumes a freshly issued challenge exactly once', () => {
    issueChallenge('did:web:ian.self.xyz', 'nonce-1');
    expect(consumeChallenge('nonce-1')).toEqual({
      principalDid: 'did:web:ian.self.xyz',
      issuedAt: expect.any(Number),
    });
    expect(consumeChallenge('nonce-1')).toBeNull();
  });

  it('returns null for unknown nonces', () => {
    expect(consumeChallenge('never-issued')).toBeNull();
  });
});
