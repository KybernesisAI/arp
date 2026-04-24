import { describe, it, expect } from 'vitest';
import { createResolver } from '../src/resolver.js';
import { DOH_TYPE_CODES, type DohAnswer, type DohClient } from '../src/doh.js';

function mockDohClient(store: Record<string, DohAnswer[]>): DohClient & {
  calls: Array<{ name: string; type: string }>;
} {
  const calls: Array<{ name: string; type: string }> = [];
  return {
    calls,
    async query(name, type) {
      calls.push({ name, type });
      const key = `${name}|${type}`;
      return store[key] ?? [];
    },
  };
}

const apexA: DohAnswer = { name: 'welcome.nb', type: DOH_TYPE_CODES.A, TTL: 300, data: '44.0.0.1' };
const arpTxt: DohAnswer = {
  name: '_arp.welcome.nb',
  type: DOH_TYPE_CODES.TXT,
  TTL: 300,
  data: '"v=1; caps=didcomm,a2a; pdp=cedar"',
};

describe('createResolver', () => {
  it('resolveHns groups TXT records by leading label', async () => {
    const doh = mockDohClient({
      'welcome.nb|A': [apexA],
      '_arp.welcome.nb|TXT': [arpTxt],
    });
    const resolver = createResolver({ dohClient: doh });
    const result = await resolver.resolveHns('welcome.nb');
    expect(result.a).toEqual(['44.0.0.1']);
    expect(result.txt._arp).toEqual(['v=1; caps=didcomm,a2a; pdp=cedar']);
  });

  it('resolveHns caches identical queries', async () => {
    const doh = mockDohClient({ 'foo.agent|A': [{ ...apexA, name: 'foo.agent' }] });
    const resolver = createResolver({ dohClient: doh });
    await resolver.resolveHns('foo.agent');
    await resolver.resolveHns('foo.agent');
    const aCalls = doh.calls.filter((c) => c.name === 'foo.agent' && c.type === 'A');
    expect(aCalls).toHaveLength(1);
  });

  it('resolveDidWeb returns parsed document via injected fetch', async () => {
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
    const doh = mockDohClient({
      'samantha.agent|A': [{ name: 'samantha.agent', type: DOH_TYPE_CODES.A, TTL: 300, data: '1.2.3.4' }],
    });
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(sampleDoc), { status: 200 });
    const resolver = createResolver({ dohClient: doh, fetchImpl });
    const r = await resolver.resolveDidWeb('did:web:samantha.agent');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.id).toBe('did:web:samantha.agent');
  });

  it('resolveDidWeb caches document across calls', async () => {
    const doc = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: 'did:web:example.com',
      controller: 'did:web:ian.example.agent',
      verificationMethod: [
        {
          id: 'did:web:example.com#key-1',
          type: 'Ed25519VerificationKey2020',
          controller: 'did:web:example.com',
          publicKeyMultibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
        },
      ],
      authentication: ['did:web:example.com#key-1'],
      assertionMethod: ['did:web:example.com#key-1'],
      keyAgreement: ['did:web:example.com#key-1'],
      service: [
        {
          id: 'did:web:example.com#didcomm',
          type: 'DIDCommMessaging',
          serviceEndpoint: 'https://example.com/didcomm',
          accept: ['didcomm/v2'],
        },
      ],
      principal: {
        did: 'did:web:ian.example.agent',
        representationVC: 'https://example.com/.well-known/representation.jwt',
      },
    };
    let hits = 0;
    const fetchImpl: typeof fetch = async () => {
      hits++;
      return new Response(JSON.stringify(doc), { status: 200 });
    };
    const resolver = createResolver({ dohClient: mockDohClient({}), fetchImpl });
    await resolver.resolveDidWeb('did:web:example.com');
    await resolver.resolveDidWeb('did:web:example.com');
    expect(hits).toBe(1);
  });
});
