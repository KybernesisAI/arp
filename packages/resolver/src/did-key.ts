import { DidDocumentSchema, type DidDocument } from '@kybernesis/arp-spec';
import { resolverError, type ResolverError } from './errors.js';

/**
 * `did:key` resolver for Ed25519 public keys.
 *
 * Format: `did:key:z<base58btc(multicodec-prefix || raw-pubkey)>`
 *   - multibase prefix `z` → base58btc
 *   - multicodec prefix `0xed 0x01` (varint-encoded Ed25519-pub) → 2 bytes
 *   - raw Ed25519 public key → 32 bytes
 *
 * See: https://w3c-ccg.github.io/did-method-key/
 *
 * The transport package has a parallel `multibaseEd25519ToRaw` helper used by
 * verification-method decoding. We deliberately do NOT import from transport
 * here — resolver is a dependency OF transport (via `resolver-adapter`), so
 * a transport → resolver runtime import would be a cycle. This module keeps
 * its own minimal base58btc decode/encode to stay cycle-free.
 */

/** Multicodec varint-prefix for Ed25519 public keys. */
const ED25519_MULTICODEC_PREFIX = [0xed, 0x01] as const;

/** Parse a `did:key:z...` into its raw Ed25519 public key bytes. */
export function parseDidKey(
  did: string,
):
  | { ok: true; publicKey: Uint8Array; multibase: string }
  | { ok: false; error: ResolverError } {
  if (!did.startsWith('did:key:')) {
    return {
      ok: false,
      error: resolverError('unsupported_method', `not a did:key DID: ${did}`),
    };
  }
  const multibase = did.slice('did:key:'.length);
  if (!multibase) {
    return {
      ok: false,
      error: resolverError('invalid_did', `empty did:key body: ${did}`),
    };
  }
  if (!multibase.startsWith('z')) {
    return {
      ok: false,
      error: resolverError(
        'invalid_did',
        `did:key multibase must use base58btc (z-prefix): ${multibase}`,
      ),
    };
  }
  let decoded: Uint8Array;
  try {
    decoded = base58btcDecode(multibase.slice(1));
  } catch (err) {
    return {
      ok: false,
      error: resolverError(
        'invalid_did',
        `did:key base58btc decode failed: ${(err as Error).message}`,
        err,
      ),
    };
  }
  if (decoded.length !== 34) {
    return {
      ok: false,
      error: resolverError(
        'invalid_did',
        `did:key payload must be 34 bytes (2 multicodec + 32 pubkey); got ${decoded.length}`,
      ),
    };
  }
  if (
    decoded[0] !== ED25519_MULTICODEC_PREFIX[0] ||
    decoded[1] !== ED25519_MULTICODEC_PREFIX[1]
  ) {
    const actual = `0x${decoded[0]!.toString(16).padStart(2, '0')} 0x${decoded[1]!.toString(16).padStart(2, '0')}`;
    return {
      ok: false,
      error: resolverError(
        'unsupported_method',
        `did:key multicodec prefix ${actual} is not Ed25519 (expected 0xed 0x01)`,
      ),
    };
  }
  return { ok: true, publicKey: decoded.slice(2), multibase };
}

/**
 * Encode a raw 32-byte Ed25519 public key to multibase `z<base58btc(prefix||raw)>`.
 * Useful for tests that mint a fresh did:key identity from a keypair.
 *
 * This mirrors `ed25519RawToMultibase` in `@kybernesis/arp-transport` so that
 * resolver callers have a local option; keeping the helper here avoids the
 * transport → resolver circular dependency.
 */
export function ed25519PublicKeyToDidKey(raw: Uint8Array): string {
  if (raw.length !== 32) {
    throw new Error('Ed25519 public key must be 32 raw bytes');
  }
  const prefixed = new Uint8Array(34);
  prefixed[0] = ED25519_MULTICODEC_PREFIX[0];
  prefixed[1] = ED25519_MULTICODEC_PREFIX[1];
  prefixed.set(raw, 2);
  return `did:key:z${base58btcEncode(prefixed)}`;
}

/**
 * Synthesise a DID document for a `did:key` DID.
 *
 * did:key is terminal — there are no service endpoints to publish and no
 * external principal binding. Phase 8.5 relaxed `DidDocumentSchema` to make
 * `service` and `principal` optional, so owner / principal documents built
 * from a did:key are self-describing: controller = self, no services, no
 * external representation VC.
 */
export function didKeyToDidDocument(
  did: string,
): { ok: true; value: DidDocument } | { ok: false; error: ResolverError } {
  const parsed = parseDidKey(did);
  if (!parsed.ok) return parsed;

  const keyId = `${did}#key-1`;
  const doc: DidDocument = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: did,
    controller: did,
    verificationMethod: [
      {
        id: keyId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: parsed.multibase,
      },
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
    keyAgreement: [keyId],
  };

  const check = DidDocumentSchema.safeParse(doc);
  if (!check.success) {
    return {
      ok: false,
      error: resolverError(
        'parse_failure',
        `synthesised did:key document failed validation`,
        check.error.issues,
      ),
    };
  }
  return { ok: true, value: check.data };
}

/* ---- minimal base58btc (bitcoin alphabet) — kept local to avoid a
   transport → resolver circular import. Mirrors the copy in
   @kybernesis/arp-transport/src/envelope.ts. ---- */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_DECODE: Record<string, number> = {};
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_DECODE[BASE58_ALPHABET[i]!] = i;
}

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

function base58btcDecode(s: string): Uint8Array {
  if (s.length === 0) return new Uint8Array();
  const bytes: number[] = [0];
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const digit = BASE58_DECODE[c];
    if (digit === undefined) {
      throw new Error(`invalid base58btc char: ${c}`);
    }
    let carry = digit;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  for (let k = 0; k < s.length && s[k] === '1'; k++) leadingZeros++;
  const out = new Uint8Array(leadingZeros + bytes.length);
  for (let q = 0; q < bytes.length; q++) {
    out[leadingZeros + (bytes.length - 1 - q)] = bytes[q]!;
  }
  return out;
}
