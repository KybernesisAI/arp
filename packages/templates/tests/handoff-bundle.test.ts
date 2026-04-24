import { describe, it, expect } from 'vitest';
import { HandoffBundleSchema } from '@kybernesis/arp-spec';
import { buildHandoffBundle } from '../src/index.js';
import { seededRng, randomDidWeb, randomMultibaseKey, randomHttps } from './helpers.js';

describe('buildHandoffBundle', () => {
  it('produces a schema-valid bundle with derived well-known URLs', () => {
    const bundle = buildHandoffBundle({
      agentDid: 'did:web:samantha.agent',
      principalDid: 'did:web:ian.example.agent',
      publicKeyMultibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
      agentOrigin: 'https://samantha.agent',
      dnsRecordsPublished: [
        'A',
        'AAAA',
        '_arp TXT',
        '_did TXT',
        '_didcomm TXT',
        '_revocation TXT',
        '_principal TXT',
      ],
      certExpiresAt: '2026-07-22T00:00:00Z',
      bootstrapToken: 'eyJhbGciOiJFZERTQSJ9.payload.sig',
    });
    expect(HandoffBundleSchema.safeParse(bundle).success).toBe(true);
    expect(bundle.well_known_urls.did).toBe('https://samantha.agent/.well-known/did.json');
  });

  it('round-trips through JSON', () => {
    const bundle = buildHandoffBundle({
      agentDid: 'did:web:samantha.agent',
      principalDid: 'did:web:ian.example.agent',
      publicKeyMultibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
      agentOrigin: 'https://samantha.agent',
      dnsRecordsPublished: ['A', '_did TXT'],
      certExpiresAt: '2026-07-22T00:00:00Z',
      bootstrapToken: 'eyJhbGciOiJFZERTQSJ9.p.s',
    });
    const roundtrip = JSON.parse(JSON.stringify(bundle));
    expect(HandoffBundleSchema.parse(roundtrip)).toEqual(bundle);
  });

  it('honors explicit well-known URL overrides', () => {
    const bundle = buildHandoffBundle({
      agentDid: 'did:web:samantha.agent',
      principalDid: 'did:web:ian.example.agent',
      publicKeyMultibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
      agentOrigin: 'https://samantha.agent',
      wellKnownUrls: {
        did: 'https://cdn.arp.spec/did/samantha.json',
      },
      dnsRecordsPublished: ['A'],
      certExpiresAt: '2026-07-22T00:00:00Z',
      bootstrapToken: 'tok',
    });
    expect(bundle.well_known_urls.did).toBe('https://cdn.arp.spec/did/samantha.json');
    // other URLs still derive from agentOrigin:
    expect(bundle.well_known_urls.arp).toBe('https://samantha.agent/.well-known/arp.json');
  });

  const rng = seededRng(0xfeedbeef);
  for (let i = 0; i < 10; i += 1) {
    const agentDid = randomDidWeb(rng);
    const principalDid = randomDidWeb(rng, 'example.agent');
    const origin = randomHttps(rng, '').replace(/\/$/, '');
    const multibase = randomMultibaseKey(rng);
    it(`property #${i + 1}: random inputs yield valid bundles`, () => {
      const bundle = buildHandoffBundle({
        agentDid,
        principalDid,
        publicKeyMultibase: multibase,
        agentOrigin: origin,
        dnsRecordsPublished: ['A', '_did TXT'],
        certExpiresAt: '2026-07-22T00:00:00Z',
        bootstrapToken: 'tok',
      });
      expect(HandoffBundleSchema.safeParse(bundle).success).toBe(true);
    });
  }
});
