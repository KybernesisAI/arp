import { describe, expect, it } from 'vitest';
import {
  createPrincipalIdentityMethodProbe,
  principalIdentityMethodProbe,
} from '../src/probes/principal-identity-method.js';
import type { Resolver } from '@kybernesis/arp-resolver';
import type { DidDocument } from '@kybernesis/arp-spec';

function mockDohFetch(
  mapping: Record<string, Array<{ name: string; type: number; data: string }>>,
): typeof fetch {
  return (async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const u = new URL(url);
    const name = u.searchParams.get('name') ?? '';
    const typeStr = u.searchParams.get('type') ?? 'A';
    const answers = mapping[`${name}|${typeStr}`] ?? [];
    return new Response(JSON.stringify({ Status: 0, Answer: answers }), {
      status: 200,
      headers: { 'content-type': 'application/dns-json' },
    });
  }) as typeof fetch;
}

function okResolver(value: DidDocument): Resolver {
  return {
    async resolveHns() {
      return { a: [], aaaa: [], txt: {} };
    },
    async resolveDidWeb() {
      return { ok: true, value };
    },
    async resolveDid() {
      return { ok: true, value };
    },
    clearCache() {},
  };
}

function errResolver(code: string, msg: string): Resolver {
  return {
    async resolveHns() {
      return { a: [], aaaa: [], txt: {} };
    },
    async resolveDidWeb() {
      return { ok: false, error: { code: code as never, message: msg } };
    },
    async resolveDid() {
      return { ok: false, error: { code: code as never, message: msg } };
    },
    clearCache() {},
  };
}

const VALID_DID_DOC: DidDocument = {
  '@context': ['https://www.w3.org/ns/did/v1'],
  id: 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
  controller: 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
  verificationMethod: [
    {
      id: 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp#key-1',
      type: 'Ed25519VerificationKey2020',
      controller: 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
      publicKeyMultibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
    },
  ],
  authentication: ['did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp#key-1'],
  assertionMethod: ['did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp#key-1'],
  keyAgreement: ['did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp#key-1'],
};

describe('principalIdentityMethodProbe', () => {
  it('skips when target is localhost', async () => {
    const r = await principalIdentityMethodProbe({
      target: 'localhost:4501',
      baseUrl: 'http://127.0.0.1:4501',
      ownerLabel: 'ian',
    });
    expect(r.skipped).toBe(true);
    expect(r.pass).toBe(true);
  });

  it('skips when ownerLabel is not provided', async () => {
    const r = await principalIdentityMethodProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
    });
    expect(r.skipped).toBe(true);
    expect(r.pass).toBe(true);
  });

  it('passes for a did:key value that resolves cleanly', async () => {
    const probe = createPrincipalIdentityMethodProbe({
      resolver: okResolver(VALID_DID_DOC),
    });
    const apex = 'samantha.agent';
    const did = 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp';
    const r = await probe({
      target: apex,
      baseUrl: `https://${apex}`,
      ownerLabel: 'ian',
      dohEndpoint: 'https://hnsdoh.example/dns-query',
      fetchImpl: mockDohFetch({
        [`ian.${apex}|A`]: [{ name: `ian.${apex}`, type: 1, data: '1.2.3.4' }],
        [`ian.${apex}|AAAA`]: [],
        [`_principal.ian.${apex}|TXT`]: [
          {
            name: `_principal.ian.${apex}`,
            type: 16,
            data: `"did=${did}; rep=https://ian.${apex}/.well-known/representation.jwt"`,
          },
        ],
      }),
    });
    expect(r.pass).toBe(true);
    expect(r.skipped).toBeFalsy();
    expect(r.details['method']).toBe('key');
    expect(r.details['did']).toBe(did);
  });

  it('passes for a did:web value (both methods accepted)', async () => {
    const probe = createPrincipalIdentityMethodProbe({
      resolver: okResolver({
        ...VALID_DID_DOC,
        id: 'did:web:ian.example.agent',
      }),
    });
    const apex = 'samantha.agent';
    const did = 'did:web:ian.example.agent';
    const r = await probe({
      target: apex,
      baseUrl: `https://${apex}`,
      ownerLabel: 'ian',
      dohEndpoint: 'https://hnsdoh.example/dns-query',
      fetchImpl: mockDohFetch({
        [`_principal.ian.${apex}|TXT`]: [
          {
            name: `_principal.ian.${apex}`,
            type: 16,
            data: `"did=${did}; rep=https://ian.${apex}/.well-known/representation.jwt"`,
          },
        ],
      }),
    });
    expect(r.pass).toBe(true);
    expect(r.details['method']).toBe('web');
  });

  it('fails when _principal TXT record is missing', async () => {
    const probe = createPrincipalIdentityMethodProbe({
      resolver: okResolver(VALID_DID_DOC),
    });
    const apex = 'samantha.agent';
    const r = await probe({
      target: apex,
      baseUrl: `https://${apex}`,
      ownerLabel: 'ian',
      dohEndpoint: 'https://hnsdoh.example/dns-query',
      fetchImpl: mockDohFetch({}),
    });
    expect(r.pass).toBe(false);
    expect(r.error?.code).toBe('principal_identity_failed');
  });

  it('fails when the TXT value has no did=', async () => {
    const probe = createPrincipalIdentityMethodProbe({
      resolver: okResolver(VALID_DID_DOC),
    });
    const apex = 'samantha.agent';
    const r = await probe({
      target: apex,
      baseUrl: `https://${apex}`,
      ownerLabel: 'ian',
      dohEndpoint: 'https://hnsdoh.example/dns-query',
      fetchImpl: mockDohFetch({
        [`_principal.ian.${apex}|TXT`]: [
          {
            name: `_principal.ian.${apex}`,
            type: 16,
            data: `"rep=https://ian.${apex}/.well-known/representation.jwt"`,
          },
        ],
      }),
    });
    expect(r.pass).toBe(false);
  });

  it('fails when the resolver rejects the DID', async () => {
    const probe = createPrincipalIdentityMethodProbe({
      resolver: errResolver('unsupported_method', 'no resolver for did:foo:'),
    });
    const apex = 'samantha.agent';
    const r = await probe({
      target: apex,
      baseUrl: `https://${apex}`,
      ownerLabel: 'ian',
      dohEndpoint: 'https://hnsdoh.example/dns-query',
      fetchImpl: mockDohFetch({
        [`_principal.ian.${apex}|TXT`]: [
          {
            name: `_principal.ian.${apex}`,
            type: 16,
            data: `"did=did:foo:bar; rep=https://ian.${apex}/.well-known/representation.jwt"`,
          },
        ],
      }),
    });
    expect(r.pass).toBe(false);
    expect(r.details['code']).toBe('unsupported_method');
  });
});
