import { describe, expect, it } from 'vitest';
import { didResolutionProbe } from '../src/probes/did-resolution.js';

const validDidDoc = {
  '@context': ['https://www.w3.org/ns/did/v1'],
  id: 'did:web:samantha.agent',
  controller: 'did:web:ian.example.agent',
  verificationMethod: [
    {
      id: 'did:web:samantha.agent#key-1',
      type: 'Ed25519VerificationKey2020',
      controller: 'did:web:samantha.agent',
      publicKeyMultibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
    },
  ],
  authentication: ['did:web:samantha.agent#key-1'],
  assertionMethod: ['did:web:samantha.agent#key-1'],
  keyAgreement: ['did:web:samantha.agent#key-1'],
  service: [
    {
      id: 'did:web:samantha.agent#didcomm',
      type: 'DIDCommMessaging',
      serviceEndpoint: 'https://samantha.agent/didcomm',
      accept: ['didcomm/v2'],
    },
  ],
  principal: {
    did: 'did:web:ian.example.agent',
    representationVC: 'https://ian.samantha.agent/.well-known/representation.jwt',
  },
};

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })) as typeof fetch;
}

describe('didResolutionProbe', () => {
  it('passes on a valid DID document whose id matches target', async () => {
    const r = await didResolutionProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      fetchImpl: fakeFetch(validDidDoc),
    });
    expect(r.pass).toBe(true);
    expect(r.details['did']).toBe('did:web:samantha.agent');
  });

  it('fails when doc.id does not match the target-derived DID', async () => {
    const r = await didResolutionProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      fetchImpl: fakeFetch({ ...validDidDoc, id: 'did:web:other.agent' }),
    });
    expect(r.pass).toBe(false);
  });

  it('fails when HTTP is non-200', async () => {
    const r = await didResolutionProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      fetchImpl: fakeFetch({}, 500),
    });
    expect(r.pass).toBe(false);
  });

  it('fails when DIDComm service is missing', async () => {
    const r = await didResolutionProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      fetchImpl: fakeFetch({
        ...validDidDoc,
        service: [
          {
            id: 'did:web:samantha.agent#agent-card',
            type: 'AgentCard',
            serviceEndpoint: 'https://samantha.agent/.well-known/agent-card.json',
          },
        ],
      }),
    });
    expect(r.pass).toBe(false);
  });

  it('passes without target-derived-DID assertion when target is localhost', async () => {
    const r = await didResolutionProbe({
      target: 'localhost:4501',
      baseUrl: 'http://127.0.0.1:4501',
      fetchImpl: fakeFetch(validDidDoc),
    });
    expect(r.pass).toBe(true);
  });
});
