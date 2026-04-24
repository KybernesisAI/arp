import { describe, expect, it } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import {
  createRepresentationJwtSignerBindingProbe,
  representationJwtSignerBindingProbe,
} from '../src/probes/representation-jwt-signer-binding.js';
import { base64urlEncode, ed25519RawToMultibase } from '@kybernesis/arp-transport';
import type { Resolver } from '@kybernesis/arp-resolver';
import type { DidDocument } from '@kybernesis/arp-spec';

async function signJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: Uint8Array,
): Promise<string> {
  const enc = (obj: unknown): string =>
    base64urlEncode(new TextEncoder().encode(JSON.stringify(obj)));
  const headerB64 = enc(header);
  const payloadB64 = enc(payload);
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = await ed25519.signAsync(signingInput, privateKey);
  return `${headerB64}.${payloadB64}.${base64urlEncode(sig)}`;
}

function jwtFetch(jwt: string, status = 200): typeof fetch {
  return (async () =>
    new Response(jwt, {
      status,
      headers: { 'content-type': 'application/jwt' },
    })) as typeof fetch;
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

async function freshKeypair(): Promise<{
  priv: Uint8Array;
  pub: Uint8Array;
  multibase: string;
}> {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  return { priv, pub, multibase: ed25519RawToMultibase(pub) };
}

describe('representationJwtSignerBindingProbe', () => {
  it('skips when target is localhost', async () => {
    const r = await representationJwtSignerBindingProbe({
      target: 'localhost:4501',
      baseUrl: 'http://127.0.0.1:4501',
      ownerLabel: 'ian',
    });
    expect(r.skipped).toBe(true);
    expect(r.pass).toBe(true);
  });

  it('skips when ownerLabel is not provided', async () => {
    const r = await representationJwtSignerBindingProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
    });
    expect(r.skipped).toBe(true);
    expect(r.pass).toBe(true);
  });

  it('passes when kid matches a verificationMethod and signature verifies', async () => {
    const { priv, multibase } = await freshKeypair();
    const iss = 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp';
    const kid = `${iss}#key-1`;
    const jwt = await signJwt(
      { alg: 'EdDSA', kid, typ: 'JWT' },
      { iss, sub: 'did:web:samantha.agent', iat: 1_700_000_000 },
      priv,
    );

    const doc: DidDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: iss,
      controller: iss,
      verificationMethod: [
        {
          id: kid,
          type: 'Ed25519VerificationKey2020',
          controller: iss,
          publicKeyMultibase: multibase,
        },
      ],
      authentication: [kid],
      assertionMethod: [kid],
      keyAgreement: [kid],
    };

    const probe = createRepresentationJwtSignerBindingProbe({ resolver: okResolver(doc) });
    const r = await probe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      ownerLabel: 'ian',
      fetchImpl: jwtFetch(jwt),
    });
    expect(r.pass).toBe(true);
    expect(r.details['kid']).toBe(kid);
    expect(r.details['iss']).toBe(iss);
  });

  it('fails when the signing key does not match the DID doc', async () => {
    // Signing key A; DID doc publishes key B. Signature must fail.
    const signer = await freshKeypair();
    const other = await freshKeypair();
    const iss = 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp';
    const kid = `${iss}#key-1`;
    const jwt = await signJwt(
      { alg: 'EdDSA', kid },
      { iss },
      signer.priv,
    );
    const doc: DidDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: iss,
      controller: iss,
      verificationMethod: [
        {
          id: kid,
          type: 'Ed25519VerificationKey2020',
          controller: iss,
          publicKeyMultibase: other.multibase,
        },
      ],
      authentication: [kid],
      assertionMethod: [kid],
      keyAgreement: [kid],
    };
    const probe = createRepresentationJwtSignerBindingProbe({ resolver: okResolver(doc) });
    const r = await probe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      ownerLabel: 'ian',
      fetchImpl: jwtFetch(jwt),
    });
    expect(r.pass).toBe(false);
    expect(r.error?.message).toMatch(/signature verification failed/i);
  });

  it('fails when kid does not match any verificationMethod', async () => {
    const { priv, multibase } = await freshKeypair();
    const iss = 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp';
    const wrongKid = `${iss}#nonexistent`;
    const jwt = await signJwt({ alg: 'EdDSA', kid: wrongKid }, { iss }, priv);
    const doc: DidDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: iss,
      controller: iss,
      verificationMethod: [
        {
          id: `${iss}#key-1`,
          type: 'Ed25519VerificationKey2020',
          controller: iss,
          publicKeyMultibase: multibase,
        },
      ],
      authentication: [`${iss}#key-1`],
      assertionMethod: [`${iss}#key-1`],
      keyAgreement: [`${iss}#key-1`],
    };
    const probe = createRepresentationJwtSignerBindingProbe({ resolver: okResolver(doc) });
    const r = await probe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      ownerLabel: 'ian',
      fetchImpl: jwtFetch(jwt),
    });
    expect(r.pass).toBe(false);
    expect(r.error?.message).toMatch(/no verificationMethod/);
  });

  it('fails when the representation JWT endpoint 404s', async () => {
    const r = await representationJwtSignerBindingProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      ownerLabel: 'ian',
      fetchImpl: jwtFetch('not found', 404),
    });
    expect(r.pass).toBe(false);
    expect(r.error?.message).toMatch(/HTTP 404/);
  });

  it('fails when the response is not a compact JWS', async () => {
    const r = await representationJwtSignerBindingProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      ownerLabel: 'ian',
      fetchImpl: jwtFetch('notajwt'),
    });
    expect(r.pass).toBe(false);
    expect(r.error?.message).toMatch(/compact JWS/);
  });

  it('fails when alg is not EdDSA', async () => {
    const { priv } = await freshKeypair();
    const iss = 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp';
    const jwt = await signJwt({ alg: 'RS256', kid: `${iss}#key-1` }, { iss }, priv);
    const r = await representationJwtSignerBindingProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      ownerLabel: 'ian',
      fetchImpl: jwtFetch(jwt),
    });
    expect(r.pass).toBe(false);
    expect(r.error?.message).toMatch(/unsupported alg/);
  });
});
