import { describe, it, expect } from 'vitest';
import { RepresentationVcSchema } from '@kybernesis/arp-spec';
import { buildRepresentationVc } from '../src/index.js';
import { seededRng, randomDidWeb } from './helpers.js';

describe('buildRepresentationVc', () => {
  it('produces a schema-valid VC with defaults', () => {
    const vc = buildRepresentationVc({
      principalDid: 'did:web:ian.self.xyz',
      agentDid: 'did:web:samantha.agent',
    });
    expect(RepresentationVcSchema.safeParse(vc).success).toBe(true);
    expect(vc.vc.credentialSubject.scope).toBe('full');
    expect(vc.exp).toBeGreaterThan(vc.iat);
  });

  it('accepts explicit iat + exp', () => {
    const vc = buildRepresentationVc({
      principalDid: 'did:web:ian.self.xyz',
      agentDid: 'did:web:samantha.agent',
      iat: 1_700_000_000,
      exp: 1_800_000_000,
    });
    expect(vc.iat).toBe(1_700_000_000);
    expect(vc.exp).toBe(1_800_000_000);
  });

  it('supports scoped representation', () => {
    const vc = buildRepresentationVc({
      principalDid: 'did:web:ian.self.xyz',
      agentDid: 'did:web:samantha.agent',
      scope: 'scoped',
    });
    expect(vc.vc.credentialSubject.scope).toBe('scoped');
  });

  it('applies default constraints', () => {
    const vc = buildRepresentationVc({
      principalDid: 'did:web:ian.self.xyz',
      agentDid: 'did:web:samantha.agent',
    });
    expect(vc.vc.credentialSubject.constraints.maxConcurrentConnections).toBe(100);
    expect(vc.vc.credentialSubject.constraints.allowedTransferOfOwnership).toBe(false);
  });

  const rng = seededRng(0x1de01);
  for (let i = 0; i < 12; i += 1) {
    const principal = randomDidWeb(rng, 'self.xyz');
    const agent = randomDidWeb(rng, 'agent');
    it(`property #${i + 1}: random DIDs produce valid VCs`, () => {
      const vc = buildRepresentationVc({ principalDid: principal, agentDid: agent });
      expect(RepresentationVcSchema.safeParse(vc).success).toBe(true);
      expect(vc.vc.credentialSubject.id).toBe(agent);
      expect(vc.vc.credentialSubject.representedBy).toBe(principal);
    });
  }
});
