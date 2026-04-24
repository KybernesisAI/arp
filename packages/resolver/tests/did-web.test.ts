import { describe, it, expect } from 'vitest';
import { didWebToUrl, fetchAndParseDidDocument } from '../src/did-web.js';

describe('didWebToUrl', () => {
  it('maps did:web:<host> to /.well-known/did.json', () => {
    const r = didWebToUrl('did:web:samantha.agent');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url.toString()).toBe('https://samantha.agent/.well-known/did.json');
      expect(r.host).toBe('samantha.agent');
    }
  });

  it('maps nested paths to /<path>/did.json', () => {
    const r = didWebToUrl('did:web:example.com:user:alice');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url.toString()).toBe('https://example.com/user/alice/did.json');
    }
  });

  it('rejects non did:web DIDs', () => {
    const r = didWebToUrl('did:key:z6Mk...');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('unsupported_method');
    }
  });

  it('rejects an empty body', () => {
    const r = didWebToUrl('did:web:');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_did');
  });

  it('rejects invalid hosts', () => {
    const r = didWebToUrl('did:web:bad host');
    expect(r.ok).toBe(false);
  });
});

describe('fetchAndParseDidDocument', () => {
  const sampleDoc = {
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

  it('parses a valid document', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(sampleDoc), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const r = await fetchAndParseDidDocument(
      new URL('https://samantha.agent/.well-known/did.json'),
      { fetchImpl },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.id).toBe('did:web:samantha.agent');
  });

  it('reports HTTP failures', async () => {
    const fetchImpl: typeof fetch = async () => new Response('nope', { status: 404 });
    const r = await fetchAndParseDidDocument(
      new URL('https://samantha.agent/.well-known/did.json'),
      { fetchImpl },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_found');
  });

  it('reports parse failures on malformed JSON', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ not: 'a did doc' }), { status: 200 });
    const r = await fetchAndParseDidDocument(
      new URL('https://samantha.agent/.well-known/did.json'),
      { fetchImpl },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('parse_failure');
  });
});
