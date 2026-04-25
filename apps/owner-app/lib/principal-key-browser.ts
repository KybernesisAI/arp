/**
 * Browser-only principal key module. Generates an Ed25519 keypair on first
 * visit, persists the 16-byte BIP-39 entropy in `localStorage`, and exposes
 * sign + recovery-phrase round-trip helpers.
 *
 * Phase 8.5 design: the user's principal identity is a `did:key` living in
 * their browser. Zero pasting, zero server-held secrets. The recovery phrase
 * uses a BIP-39-style 12-word mnemonic (English wordlist).
 *
 * Phase 10/10d adds an HKDF-SHA256-derived seed (v2). New accounts default to
 * v2; existing v1 accounts keep working until they opt into rotation via
 * {@link rotateToV2}. Domain-separated via salt=`arp-v2` + info=`principal-key`.
 *
 * All exports are no-ops when `window`/`localStorage` is not available so
 * this module stays safe to import from RSC boundaries. Every function that
 * actually needs the browser throws a clear error if called server-side.
 */
import * as ed25519 from '@noble/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import {
  entropyToMnemonic,
  mnemonicToEntropy,
  mnemonicToSeed,
  validateMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport/browser';

// v1 — Phase 8.5 PBKDF2-via-bip39 derivation. Retained for back-compat.
const STORAGE_KEY = 'arp.principalKey.v1';
// v2 — Phase 10/10d HKDF-SHA256 derivation. Default for new accounts.
export const STORAGE_KEY_V2 = 'arp.principalKey.v2';
const HKDF_SALT_V2 = new TextEncoder().encode('arp-v2');
const HKDF_INFO_V2 = new TextEncoder().encode('principal-key');
/** BIP-39 entropy size for 12 words: 128 bits = 16 bytes. */
const ENTROPY_BYTES = 16;

export type KeyVersion = 'v1' | 'v2';

export interface PrincipalKey {
  did: string;
  publicKeyMultibase: string;
  sign(bytes: Uint8Array): Promise<Uint8Array>;
}

interface StoredKey {
  /** base64-encoded 16-byte BIP-39 entropy. */
  entropyB64: string;
}

function assertBrowser(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    throw new Error(
      'principal-key-browser: this module is browser-only; called in a non-browser context',
    );
  }
}

function storageKeyFor(version: KeyVersion): string {
  return version === 'v2' ? STORAGE_KEY_V2 : STORAGE_KEY;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function readStored(version: KeyVersion): StoredKey | null {
  const raw = localStorage.getItem(storageKeyFor(version));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).entropyB64 === 'string'
    ) {
      return parsed as StoredKey;
    }
  } catch {
    // fall through to null
  }
  return null;
}

function writeStored(entropy: Uint8Array, version: KeyVersion): void {
  const payload: StoredKey = { entropyB64: bytesToB64(entropy) };
  localStorage.setItem(storageKeyFor(version), JSON.stringify(payload));
}

function randomEntropy(): Uint8Array {
  const buf = new Uint8Array(ENTROPY_BYTES);
  crypto.getRandomValues(buf);
  return buf;
}

/** v1 — BIP-39 PBKDF2 → first 32 bytes of the seed. */
async function entropyToPrivateKeyV1(entropy: Uint8Array): Promise<Uint8Array> {
  const mnemonic = entropyToMnemonic(entropy, wordlist);
  const seed = await mnemonicToSeed(mnemonic);
  return seed.slice(0, 32);
}

/** v2 — HKDF-SHA256 with `arp-v2` salt + `principal-key` info. */
function entropyToPrivateKeyV2(entropy: Uint8Array): Uint8Array {
  return hkdf(sha256, entropy, HKDF_SALT_V2, HKDF_INFO_V2, 32);
}

async function buildPrincipalKey(
  entropy: Uint8Array,
  version: KeyVersion,
): Promise<PrincipalKey> {
  const privateKey =
    version === 'v2'
      ? entropyToPrivateKeyV2(entropy)
      : await entropyToPrivateKeyV1(entropy);
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  const publicKeyMultibase = ed25519RawToMultibase(publicKey);
  const did = `did:key:${publicKeyMultibase}`;
  return {
    did,
    publicKeyMultibase,
    async sign(bytes: Uint8Array): Promise<Uint8Array> {
      return ed25519.signAsync(bytes, privateKey);
    },
  };
}

export async function hasPrincipalKey(): Promise<boolean> {
  assertBrowser();
  return readStored('v2') !== null || readStored('v1') !== null;
}

/**
 * Active version of the user's principal key, or null if no key is stored.
 * Used by the rotation UI to decide what banner / call-to-action to show.
 */
export async function principalKeyVersion(): Promise<KeyVersion | null> {
  assertBrowser();
  if (readStored('v2')) return 'v2';
  if (readStored('v1')) return 'v1';
  return null;
}

/**
 * Return the active principal key. New accounts default to v2 (HKDF);
 * existing v1 accounts stay on v1 until the user explicitly rotates.
 */
export async function getOrCreatePrincipalKey(): Promise<PrincipalKey> {
  assertBrowser();
  const v2 = readStored('v2');
  if (v2) return buildPrincipalKey(b64ToBytes(v2.entropyB64), 'v2');
  const v1 = readStored('v1');
  if (v1) return buildPrincipalKey(b64ToBytes(v1.entropyB64), 'v1');
  const entropy = randomEntropy();
  writeStored(entropy, 'v2');
  return buildPrincipalKey(entropy, 'v2');
}

export async function exportRecoveryPhrase(): Promise<string> {
  assertBrowser();
  const stored = readStored('v2') ?? readStored('v1');
  if (!stored) {
    throw new Error('principal-key-browser: no principal key exists yet');
  }
  const entropy = b64ToBytes(stored.entropyB64);
  return entropyToMnemonic(entropy, wordlist);
}

export async function importFromRecoveryPhrase(
  phrase: string,
  opts: { version?: KeyVersion } = {},
): Promise<void> {
  assertBrowser();
  const version = opts.version ?? 'v2';
  const trimmed = phrase.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!validateMnemonic(trimmed, wordlist)) {
    throw new Error('invalid_recovery_phrase');
  }
  const entropy = mnemonicToEntropy(trimmed, wordlist);
  if (entropy.length !== ENTROPY_BYTES) {
    throw new Error(
      `unsupported_phrase_length: expected ${ENTROPY_BYTES}-byte entropy, got ${entropy.length}`,
    );
  }
  writeStored(entropy, version);
}

export async function clearPrincipalKey(): Promise<void> {
  assertBrowser();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY_V2);
}

export interface RotationResult {
  oldDid: string;
  newDid: string;
  newPublicKeyMultibase: string;
}

/**
 * Derive a fresh v2 key from the existing v1 entropy and persist it as the
 * active key. Returns both the old and new DIDs so the caller can submit
 * them to `POST /api/keys/rotate-v2` (which proxies to the sidecar).
 *
 * Caller is responsible for the server round-trip; this function only
 * mutates localStorage.
 */
export async function rotateToV2(): Promise<RotationResult> {
  assertBrowser();
  const v1 = readStored('v1');
  if (!v1) {
    throw new Error(
      'no v1 principal key found — rotation is only available for existing v1 accounts',
    );
  }
  const v2Existing = readStored('v2');
  if (v2Existing) {
    const oldKey = await buildPrincipalKey(b64ToBytes(v1.entropyB64), 'v1');
    const newKey = await buildPrincipalKey(b64ToBytes(v2Existing.entropyB64), 'v2');
    return {
      oldDid: oldKey.did,
      newDid: newKey.did,
      newPublicKeyMultibase: newKey.publicKeyMultibase,
    };
  }
  const entropy = b64ToBytes(v1.entropyB64);
  writeStored(entropy, 'v2');
  const oldKey = await buildPrincipalKey(entropy, 'v1');
  const newKey = await buildPrincipalKey(entropy, 'v2');
  return {
    oldDid: oldKey.did,
    newDid: newKey.did,
    newPublicKeyMultibase: newKey.publicKeyMultibase,
  };
}
