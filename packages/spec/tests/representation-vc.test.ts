import { describe, it, expect } from 'vitest';
import { RepresentationVcSchema } from '../src/index.js';
import { VALID_REPRESENTATION_VC, clone } from './fixtures.js';

describe('RepresentationVcSchema', () => {
  it('accepts the reference VC', () => {
    expect(RepresentationVcSchema.safeParse(VALID_REPRESENTATION_VC).success).toBe(true);
  });

  it('rejects iat as a string', () => {
    const bad = clone(VALID_REPRESENTATION_VC) as unknown as { iat: unknown };
    bad.iat = '2026-04-22T00:00:00Z';
    expect(RepresentationVcSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects missing AgentRepresentation type', () => {
    const bad = clone(VALID_REPRESENTATION_VC);
    bad.vc.type = ['VerifiableCredential'];
    expect(RepresentationVcSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts scope=scoped', () => {
    const ok = clone(VALID_REPRESENTATION_VC);
    ok.vc.credentialSubject.scope = 'scoped';
    expect(RepresentationVcSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects negative maxConcurrentConnections', () => {
    const bad = clone(VALID_REPRESENTATION_VC);
    bad.vc.credentialSubject.constraints.maxConcurrentConnections = -1;
    expect(RepresentationVcSchema.safeParse(bad).success).toBe(false);
  });
});
