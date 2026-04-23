import { describe, it, expect } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import {
  didKeyToDidDocument,
  ed25519PublicKeyToDidKey,
} from '@kybernesis/arp-resolver';
import { signBytes, verifyBytes } from '../src/index.js';

describe('did:key signing round-trip', () => {
  it('signs bytes with a did:key key and verifies against the synthesised DID document', async () => {
    // Generate a did:key principal keypair.
    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = await ed25519.getPublicKeyAsync(privateKey);
    const did = ed25519PublicKeyToDidKey(publicKey);
    const kid = `${did}#key-1`;

    // Trivial payload.
    const payload = new TextEncoder().encode('hello did:key world');

    // Sign with @kybernesis/arp-pairing.
    const sig = await signBytes(payload, { privateKey, kid });
    expect(sig.alg).toBe('EdDSA');
    expect(sig.kid).toBe(kid);

    // Build the DID document inline from the DID string (no network).
    const docResult = didKeyToDidDocument(did);
    expect(docResult.ok).toBe(true);
    if (!docResult.ok) return;

    // Verify.
    const verdict = await verifyBytes(payload, sig, docResult.value);
    expect(verdict).toEqual({ ok: true });
  });

  it('rejects a signature over a tampered payload', async () => {
    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = await ed25519.getPublicKeyAsync(privateKey);
    const did = ed25519PublicKeyToDidKey(publicKey);
    const kid = `${did}#key-1`;

    const original = new TextEncoder().encode('did:key payload');
    const tampered = new TextEncoder().encode('did:key PAYLOAD');

    const sig = await signBytes(original, { privateKey, kid });

    const docResult = didKeyToDidDocument(did);
    expect(docResult.ok).toBe(true);
    if (!docResult.ok) return;

    const verdict = await verifyBytes(tampered, sig, docResult.value);
    expect(verdict.ok).toBe(false);
  });
});
