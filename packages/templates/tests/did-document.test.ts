import { describe, it, expect } from 'vitest';
import { DidDocumentSchema } from '@kybernesis/arp-spec';
import { buildDidDocument, TemplateValidationError } from '../src/index.js';
import { seededRng, randomDidWeb, randomMultibaseKey, randomHttps } from './helpers.js';

describe('buildDidDocument', () => {
  it('produces a schema-valid document for the reference inputs', () => {
    const doc = buildDidDocument({
      agentDid: 'did:web:samantha.agent',
      controllerDid: 'did:web:ian.example.agent',
      publicKeyMultibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
      endpoints: {
        didcomm: 'https://samantha.agent/didcomm',
        agentCard: 'https://samantha.agent/.well-known/agent-card.json',
      },
      representationVcUrl: 'https://ian.samantha.agent/.well-known/representation.jwt',
    });
    expect(DidDocumentSchema.safeParse(doc).success).toBe(true);
    expect(doc.id).toBe('did:web:samantha.agent');
    expect(doc.verificationMethod[0]?.id).toBe('did:web:samantha.agent#key-1');
  });

  it('uses a caller-supplied keyId', () => {
    const doc = buildDidDocument({
      agentDid: 'did:web:samantha.agent',
      controllerDid: 'did:web:ian.example.agent',
      publicKeyMultibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
      endpoints: {
        didcomm: 'https://samantha.agent/didcomm',
        agentCard: 'https://samantha.agent/.well-known/agent-card.json',
      },
      representationVcUrl: 'https://ian.samantha.agent/.well-known/representation.jwt',
      keyId: 'ed25519-0',
    });
    expect(doc.verificationMethod[0]?.id).toBe('did:web:samantha.agent#ed25519-0');
    expect(doc.authentication[0]).toBe('did:web:samantha.agent#ed25519-0');
  });

  it('throws TemplateValidationError on invalid input shape', () => {
    expect(() =>
      buildDidDocument({
        agentDid: 'not-a-did',
        controllerDid: 'did:web:ian.example.agent',
        publicKeyMultibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
        endpoints: {
          didcomm: 'https://samantha.agent/didcomm',
          agentCard: 'https://samantha.agent/.well-known/agent-card.json',
        },
        representationVcUrl: 'https://ian.samantha.agent/.well-known/representation.jwt',
      })
    ).toThrow(TemplateValidationError);
  });

  // Property-based: 15 random valid inputs must always pass schema validation.
  const rng = seededRng(0xa51c);
  for (let i = 0; i < 15; i += 1) {
    const agentDid = randomDidWeb(rng);
    const controllerDid = randomDidWeb(rng);
    const multibase = randomMultibaseKey(rng);
    const didcomm = randomHttps(rng, '/didcomm');
    const agentCard = randomHttps(rng, '/.well-known/agent-card.json');
    const repUrl = randomHttps(rng, '/.well-known/representation.jwt');

    it(`property #${i + 1}: random valid inputs produce schema-valid DID docs`, () => {
      const doc = buildDidDocument({
        agentDid,
        controllerDid,
        publicKeyMultibase: multibase,
        endpoints: { didcomm, agentCard },
        representationVcUrl: repUrl,
      });
      const parsed = DidDocumentSchema.safeParse(doc);
      expect(parsed.success).toBe(true);
      expect(doc.service).toHaveLength(2);
      expect(doc.keyAgreement[0]).toBe(`${agentDid}#key-1`);
    });
  }
});
