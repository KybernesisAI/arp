import * as ed25519 from '@noble/ed25519';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TransportKeyStore } from './types.js';

/**
 * In-memory keystore over a pair of raw Ed25519 byte arrays. Convenient for
 * tests and for runtime binaries that load the key material from disk at
 * boot. Never persists across restarts unless the caller snapshots via
 * `exportRaw`.
 */
export function createInMemoryKeyStore(
  did: string,
  privateKey: Uint8Array,
): TransportKeyStore & { publicKey(): Promise<Uint8Array> } {
  if (privateKey.length !== 32) {
    throw new Error('Ed25519 private key must be 32 raw bytes');
  }
  return {
    did,
    async privateKeyRaw() {
      return privateKey;
    },
    async publicKeyRaw() {
      return ed25519.getPublicKeyAsync(privateKey);
    },
    async publicKey() {
      return ed25519.getPublicKeyAsync(privateKey);
    },
  };
}

/**
 * File-backed keystore — raw 32-byte Ed25519 private key at `path`. Generates
 * a fresh key if the file doesn't exist, returns the same bytes otherwise.
 * The directory is created if missing; permissions default to 0600.
 */
export function createFileKeyStore(params: {
  did: string;
  path: string;
}): TransportKeyStore {
  const { did, path } = params;
  let privateKey: Uint8Array;
  if (existsSync(path)) {
    const raw = readFileSync(path);
    if (raw.length !== 32) {
      throw new Error(`keystore file ${path} must be 32 bytes, got ${raw.length}`);
    }
    privateKey = new Uint8Array(raw);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    privateKey = ed25519.utils.randomPrivateKey();
    writeFileSync(path, privateKey, { mode: 0o600 });
  }
  return createInMemoryKeyStore(did, privateKey);
}

export async function generateEd25519Pair(): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}> {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  return { privateKey, publicKey };
}
