import { randomBytes } from 'node:crypto';
import * as ed25519 from '@noble/ed25519';

/**
 * Static test principal. The owner app reads the public key from
 * `tests/e2e/principals.json` at boot; the private key is re-derived from the
 * same seed here so the e2e test can sign challenges without having to load
 * the JSON itself.
 */
export const TEST_PRINCIPAL_PRIVATE_HEX =
  '4a1b1a1b1a1b1a1b1a1b1a1b1a1b1a1b1a1b1a1b1a1b1a1b1a1b1a1b1a1b1a1b';

export const TEST_PRINCIPAL_DID = 'did:web:ian.self.xyz';

export function privateKeyBytes(): Uint8Array {
  return new Uint8Array(Buffer.from(TEST_PRINCIPAL_PRIVATE_HEX, 'hex'));
}

export async function publicKeyHex(): Promise<string> {
  const pub = await ed25519.getPublicKeyAsync(privateKeyBytes());
  return Buffer.from(pub).toString('hex');
}

export async function signUtf8(nonce: string): Promise<string> {
  const bytes = new TextEncoder().encode(nonce);
  const sig = await ed25519.signAsync(bytes, privateKeyBytes());
  return Buffer.from(sig).toString('base64url');
}

void randomBytes;
