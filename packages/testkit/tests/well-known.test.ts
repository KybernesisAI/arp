import { describe, expect, it } from 'vitest';
import { wellKnownProbe } from '../src/probes/well-known.js';

function fakeFetch(
  docs: {
    did?: unknown;
    agentCard?: unknown;
    arpJson?: unknown;
    status?: Partial<Record<'did' | 'agentCard' | 'arpJson', number>>;
    contentType?: Partial<Record<'did' | 'agentCard' | 'arpJson', string>>;
  },
): typeof fetch {
  return (async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith('/did.json')) {
      return json(docs.did, docs.status?.did ?? 200, docs.contentType?.did);
    }
    if (url.endsWith('/agent-card.json')) {
      return json(docs.agentCard, docs.status?.agentCard ?? 200, docs.contentType?.agentCard);
    }
    if (url.endsWith('/arp.json')) {
      return json(docs.arpJson, docs.status?.arpJson ?? 200, docs.contentType?.arpJson);
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

function json(body: unknown, status: number, ct?: string): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': ct ?? 'application/json; charset=utf-8' },
  });
}

const validDidDoc = {
  '@context': ['https://www.w3.org/ns/did/v1'],
  id: 'did:web:samantha.agent',
  controller: 'did:web:ian.self.xyz',
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
    did: 'did:web:ian.self.xyz',
    representationVC: 'https://ian.samantha.agent/.well-known/representation.jwt',
  },
};

const validAgentCard = {
  arp_version: '0.1',
  name: 'Samantha',
  did: 'did:web:samantha.agent',
  description: 'Personal agent',
  created_at: '2026-04-22T00:00:00Z',
  endpoints: {
    didcomm: 'https://samantha.agent/didcomm',
    pairing: 'https://samantha.agent/pair',
  },
  accepted_protocols: ['didcomm/v2'],
  supported_scopes: [],
  payment: { x402_enabled: false, currencies: [], pricing_url: null },
  vc_requirements: [],
  policy: { engine: 'cedar', schema: 'https://samantha.agent/.well-known/policy-schema.json' },
};

const validArpJson = {
  version: '0.1',
  capabilities: ['didcomm-v2', 'cedar-pdp'],
  scope_catalog_url: 'https://samantha.agent/.well-known/scope-catalog.json',
  policy_schema_url: 'https://samantha.agent/.well-known/policy-schema.json',
};

describe('wellKnownProbe', () => {
  it('passes when all three docs serve valid JSON', async () => {
    const result = await wellKnownProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      fetchImpl: fakeFetch({
        did: validDidDoc,
        agentCard: validAgentCard,
        arpJson: validArpJson,
      }),
    });
    expect(result.pass).toBe(true);
  });

  it('fails when did.json is missing', async () => {
    const result = await wellKnownProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      fetchImpl: fakeFetch({
        agentCard: validAgentCard,
        arpJson: validArpJson,
        status: { did: 404 },
      }),
    });
    expect(result.pass).toBe(false);
    expect(result.details['failures']).toBeDefined();
  });

  it('fails when agent-card schema is invalid', async () => {
    const result = await wellKnownProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      fetchImpl: fakeFetch({
        did: validDidDoc,
        agentCard: { ...validAgentCard, did: 'not-a-did' },
        arpJson: validArpJson,
      }),
    });
    expect(result.pass).toBe(false);
  });

  it('fails when content-type is HTML', async () => {
    const result = await wellKnownProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      fetchImpl: fakeFetch({
        did: validDidDoc,
        agentCard: validAgentCard,
        arpJson: validArpJson,
        contentType: { did: 'text/html' },
      }),
    });
    expect(result.pass).toBe(false);
  });
});
