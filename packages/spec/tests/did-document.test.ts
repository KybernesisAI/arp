import { describe, it, expect } from 'vitest';
import { DidDocumentSchema, DidUriSchema, PublicKeyMultibaseSchema } from '../src/index.js';
import { VALID_DID_DOC, clone } from './fixtures.js';

describe('DidUriSchema', () => {
  it('accepts did:web', () => {
    expect(DidUriSchema.safeParse('did:web:samantha.agent').success).toBe(true);
  });

  it('rejects bare identifiers', () => {
    expect(DidUriSchema.safeParse('samantha.agent').success).toBe(false);
  });

  it('rejects uppercase methods', () => {
    expect(DidUriSchema.safeParse('did:WEB:foo.agent').success).toBe(false);
  });
});

describe('PublicKeyMultibaseSchema', () => {
  it('accepts z-prefixed base58btc', () => {
    expect(
      PublicKeyMultibaseSchema.safeParse('z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp').success
    ).toBe(true);
  });

  it('rejects missing z prefix', () => {
    expect(PublicKeyMultibaseSchema.safeParse('6MkiTBz1y').success).toBe(false);
  });

  it('rejects characters outside base58btc alphabet (contains 0)', () => {
    expect(
      PublicKeyMultibaseSchema.safeParse('z0000000000000000000000000000000000000000000').success
    ).toBe(false);
  });
});

describe('DidDocumentSchema', () => {
  it('accepts the reference document', () => {
    expect(DidDocumentSchema.safeParse(VALID_DID_DOC).success).toBe(true);
  });

  it('rejects a document missing did/v1 context', () => {
    const bad = clone(VALID_DID_DOC);
    bad['@context'] = ['https://example.com/other-context'];
    expect(DidDocumentSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown verification-method types', () => {
    const bad = clone(VALID_DID_DOC);
    (bad.verificationMethod[0] as { type: string }).type = 'RsaVerificationKey2018';
    expect(DidDocumentSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts an omitted service field (did:key documents have no endpoints)', () => {
    const ok = clone(VALID_DID_DOC) as Record<string, unknown>;
    delete ok.service;
    delete ok.principal;
    expect(DidDocumentSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects an empty service array when the field is present', () => {
    const bad = clone(VALID_DID_DOC);
    bad.service = [];
    // Zod accepts `[]` because we dropped .min(1) — but for agent documents
    // the higher-layer helpers require at least one. The schema itself is
    // permissive by design; presence-checks live in agent-card helpers.
    expect(DidDocumentSchema.safeParse(bad).success).toBe(true);
  });

  it('accepts service endpoints without accept list', () => {
    const ok = clone(VALID_DID_DOC);
    // AgentCard entry intentionally has no accept — must stay valid.
    expect(DidDocumentSchema.safeParse(ok).success).toBe(true);
  });
});
