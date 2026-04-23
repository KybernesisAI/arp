import { describe, it, expect } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { DidDocumentSchema } from '@kybernesis/arp-spec';
import {
  parseDidKey,
  didKeyToDidDocument,
  ed25519PublicKeyToDidKey,
} from '../src/did-key.js';
import { createResolver } from '../src/resolver.js';

describe('parseDidKey', () => {
  it('round-trips a freshly-generated Ed25519 keypair', async () => {
    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = await ed25519.getPublicKeyAsync(privateKey);
    const did = ed25519PublicKeyToDidKey(publicKey);
    expect(did.startsWith('did:key:z')).toBe(true);

    const parsed = parseDidKey(did);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.publicKey).toEqual(publicKey);
      expect(parsed.multibase.startsWith('z')).toBe(true);
    }
  });

  it('rejects a did:web DID with unsupported_method', () => {
    const r = parseDidKey('did:web:samantha.agent');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unsupported_method');
  });

  it('rejects a did:key payload without the z multibase prefix', () => {
    // Swap z-prefix for x-prefix (a real base58btc char but wrong multibase).
    const r = parseDidKey('did:key:x6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid_did');
      expect(r.error.message).toMatch(/base58btc/);
    }
  });

  it('rejects an empty did:key body', () => {
    const r = parseDidKey('did:key:');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_did');
  });

  it('rejects a non-Ed25519 multicodec prefix', () => {
    // Craft 34 bytes with multicodec 0x12 0x00 (sha2-256, not Ed25519-pub)
    // followed by 32 bytes of zero. Hand-encode to base58btc by borrowing
    // the encoder from a known correct output — or just synthesise a random
    // 34-byte payload and override the prefix.
    const bogus = new Uint8Array(34);
    bogus[0] = 0x12;
    bogus[1] = 0x00;
    // bytes 2..33 stay zero.
    const encoded = base58btcEncode(bogus);
    const did = `did:key:z${encoded}`;
    const r = parseDidKey(did);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('unsupported_method');
      expect(r.error.message).toMatch(/0x12 0x00/);
    }
  });

  it('rejects a truncated did:key payload', () => {
    // 33 bytes (not 34 → prefix + 32) — malformed length.
    const short = new Uint8Array(33);
    short[0] = 0xed;
    short[1] = 0x01;
    const did = `did:key:z${base58btcEncode(short)}`;
    const r = parseDidKey(did);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_did');
  });
});

describe('didKeyToDidDocument', () => {
  it('produces a document that validates against DidDocumentSchema', async () => {
    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = await ed25519.getPublicKeyAsync(privateKey);
    const did = ed25519PublicKeyToDidKey(publicKey);

    const r = didKeyToDidDocument(did);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toBe(did);
      expect(r.value.controller).toBe(did);
      expect(r.value.verificationMethod).toHaveLength(1);
      expect(r.value.verificationMethod[0]!.type).toBe('Ed25519VerificationKey2020');
      expect(r.value.verificationMethod[0]!.id).toBe(`${did}#key-1`);
      expect(r.value.authentication).toEqual([`${did}#key-1`]);
      expect(r.value.assertionMethod).toEqual([`${did}#key-1`]);
      expect(r.value.keyAgreement).toEqual([`${did}#key-1`]);

      // Hard check: schema validation (per task brief acceptance criterion).
      const check = DidDocumentSchema.safeParse(r.value);
      expect(check.success).toBe(true);
    }
  });

  it('returns unsupported_method when given a did:web DID', () => {
    const r = didKeyToDidDocument('did:web:samantha.agent');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unsupported_method');
  });
});

describe('Resolver.resolveDid', () => {
  it('dispatches did:key without making any network call', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('fetch must not be called for did:key');
    };
    const resolver = createResolver({
      fetchImpl,
      dohClient: { query: async () => [] },
    });

    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = await ed25519.getPublicKeyAsync(privateKey);
    const did = ed25519PublicKeyToDidKey(publicKey);

    expect(resolver.resolveDid).toBeDefined();
    const r = await resolver.resolveDid!(did);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.id).toBe(did);
  });

  it('returns unsupported_method for unknown DID methods', async () => {
    const resolver = createResolver({
      dohClient: { query: async () => [] },
    });
    const r = await resolver.resolveDid!('did:example:foo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unsupported_method');
  });
});

/* ---- local base58btc encoder for test-fixture synthesis ---- */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58btcEncode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const digits: number[] = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i]!;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let leadingZeros = '';
  for (let k = 0; k < bytes.length && bytes[k] === 0; k++) {
    leadingZeros += '1';
  }
  let out = '';
  for (let q = digits.length - 1; q >= 0; q--) {
    out += BASE58_ALPHABET[digits[q]!]!;
  }
  return leadingZeros + out;
}
