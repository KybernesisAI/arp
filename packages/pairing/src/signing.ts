import * as ed25519 from '@noble/ed25519';
import {
  base64urlDecode,
  base64urlEncode,
  multibaseEd25519ToRaw,
} from '@kybernesis/arp-transport';
import type { DidDocument } from '@kybernesis/arp-spec';
import type { SignatureEntry } from './types.js';

export interface KeyPair {
  /** Raw 32-byte Ed25519 seed. */
  privateKey: Uint8Array;
  /** Verification-method id — e.g. `did:web:ian.example.agent#key-1`. */
  kid: string;
}

/**
 * Sign `bytes` with `key` and wrap the result in the on-wire signature entry.
 */
export async function signBytes(
  bytes: Uint8Array,
  key: KeyPair,
): Promise<SignatureEntry> {
  if (key.privateKey.length !== 32) {
    throw new Error('Ed25519 private key must be 32 raw bytes');
  }
  const sig = await ed25519.signAsync(bytes, key.privateKey);
  return { alg: 'EdDSA', kid: key.kid, value: base64urlEncode(sig) };
}

/**
 * Verify a signature entry against `bytes` using the public key derived from
 * `didDocument`. Matches the verificationMethod by `kid` when known, else
 * tries every ed25519 key in the DID doc until one verifies (covers the
 * bare-base64url ConnectionToken shape where `kid` is lost).
 */
export async function verifyBytes(
  bytes: Uint8Array,
  sig: SignatureEntry,
  didDocument: DidDocument,
  opts: { matchKid?: boolean } = { matchKid: true },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (sig.alg !== 'EdDSA') return { ok: false, reason: `unsupported alg ${sig.alg}` };
  let sigBytes: Uint8Array;
  try {
    sigBytes = base64urlDecode(sig.value);
  } catch (err) {
    return { ok: false, reason: `signature decode failed: ${(err as Error).message}` };
  }

  const vms = opts.matchKid
    ? didDocument.verificationMethod.filter(
        (vm) => vm.id === sig.kid || vm.id.endsWith(sig.kid),
      )
    : didDocument.verificationMethod;
  if (vms.length === 0) {
    return {
      ok: false,
      reason: `no verificationMethod matches kid ${sig.kid} in ${didDocument.id}`,
    };
  }

  let lastReason = 'signature does not verify against any key';
  for (const vm of vms) {
    let publicKey: Uint8Array;
    try {
      publicKey = multibaseEd25519ToRaw(vm.publicKeyMultibase);
    } catch (err) {
      lastReason = `multibase decode failed for ${vm.id}: ${(err as Error).message}`;
      continue;
    }
    try {
      const ok = await ed25519.verifyAsync(sigBytes, bytes, publicKey);
      if (ok) return { ok: true };
    } catch (err) {
      lastReason = `verify threw for ${vm.id}: ${(err as Error).message}`;
      continue;
    }
  }
  return { ok: false, reason: lastReason };
}
