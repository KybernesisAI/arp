/**
 * Browser-held principal key module for the ARP Cloud app.
 *
 * Phase 8.5 shift: the user's principal identity is an Ed25519 keypair that
 * lives in the browser (localStorage). The public key is encoded as a
 * `did:key:z6Mk...` DID; the private key never leaves the client.
 *
 * Storage key is `arp.cloud.principalKey.v1` — distinct from the owner-app's
 * `arp.principalKey.v1` so a user running both apps locally does not collide.
 *
 * Recovery uses a 12-word phrase from the BIP-39 English wordlist; we do not
 * advertise wallet-grade BIP-39 semantics (no passphrase, no HD derivation) —
 * the entropy (128 bits) is hashed to form the Ed25519 private key seed.
 *
 * This module is client-only. Every function is guarded with a browser check
 * so accidental server-side imports fail loudly instead of silently.
 */

import * as ed25519 from '@noble/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport/browser';
import {
  generateMnemonic,
  mnemonicToEntropy,
  validateMnemonic,
  entropyToMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

// v1: entropy-padded seed (Phase 8.5). Kept live for migration reads.
const STORAGE_KEY = 'arp.cloud.principalKey.v1';
const PHRASE_KEY = 'arp.cloud.principalKey.v1.phrase';
// v2: HKDF-SHA256-derived seed (Phase 9d). New accounts default here.
export const STORAGE_KEY_V2 = 'arp.cloud.principalKey.v2';
export const PHRASE_KEY_V2 = 'arp.cloud.principalKey.v2.phrase';
// HKDF domain separation — baked into the derivation so a future v3
// doesn't accidentally collide with a v2 seed from the same entropy.
const HKDF_SALT_V2 = new TextEncoder().encode('arp-v2');
const HKDF_INFO_V2 = new TextEncoder().encode('principal-key');

export interface PrincipalKey {
  did: string;
  publicKeyMultibase: string;
  sign(bytes: Uint8Array): Promise<Uint8Array>;
}

interface StoredKey {
  privateKeyHex: string;
  publicKeyMultibase: string;
  did: string;
}

function ensureBrowser(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    throw new Error(
      'principal-key-browser must be used in the browser; do not import from server components',
    );
  }
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('bad hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

type KeyVersion = 'v1' | 'v2';

function storageKeysFor(version: KeyVersion): { keyKey: string; phraseKey: string } {
  return version === 'v2'
    ? { keyKey: STORAGE_KEY_V2, phraseKey: PHRASE_KEY_V2 }
    : { keyKey: STORAGE_KEY, phraseKey: PHRASE_KEY };
}

function loadStored(version: KeyVersion = 'v1'): StoredKey | null {
  ensureBrowser();
  const { keyKey } = storageKeysFor(version);
  const raw = localStorage.getItem(keyKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredKey;
    if (!parsed.privateKeyHex || !parsed.publicKeyMultibase || !parsed.did) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStored(stored: StoredKey, version: KeyVersion = 'v1'): void {
  ensureBrowser();
  const { keyKey } = storageKeysFor(version);
  localStorage.setItem(keyKey, JSON.stringify(stored));
}

function savePhrase(phrase: string, version: KeyVersion = 'v1'): void {
  ensureBrowser();
  const { phraseKey } = storageKeysFor(version);
  localStorage.setItem(phraseKey, phrase);
}

function loadPhrase(version: KeyVersion = 'v1'): string | null {
  ensureBrowser();
  const { phraseKey } = storageKeysFor(version);
  return localStorage.getItem(phraseKey);
}

function toPrincipalKey(stored: StoredKey): PrincipalKey {
  return {
    did: stored.did,
    publicKeyMultibase: stored.publicKeyMultibase,
    async sign(bytes: Uint8Array): Promise<Uint8Array> {
      return ed25519.signAsync(bytes, fromHex(stored.privateKeyHex));
    },
  };
}

/**
 * v1 seed derivation — BIP-39 entropy doubled to form a 32-byte Ed25519
 * seed. Retained for backward compat; new accounts use {@link createFromEntropyV2}.
 * Phase 9d rotation migrates users off this.
 */
async function createFromEntropyV1(entropy: Uint8Array): Promise<StoredKey> {
  if (entropy.length !== 16) {
    throw new Error(`expected 16-byte entropy, got ${entropy.length}`);
  }
  const seed = new Uint8Array(32);
  seed.set(entropy, 0);
  seed.set(entropy, 16);
  const publicKey = await ed25519.getPublicKeyAsync(seed);
  const publicKeyMultibase = ed25519RawToMultibase(publicKey);
  const did = `did:key:${publicKeyMultibase}`;
  return {
    privateKeyHex: toHex(seed),
    publicKeyMultibase,
    did,
  };
}

/**
 * v2 seed derivation — HKDF-SHA256 over BIP-39 entropy. Defaults for new
 * accounts from Phase 9d onward. Domain-separated via salt=`arp-v2` +
 * info=`principal-key` so a future v3 can't collide with a v2 key from the
 * same entropy.
 *
 * Accepts 16-byte BIP-39 entropy; HKDF tolerates any IKM length, but we
 * pin to 16 to match the wordlist we hand users.
 */
async function createFromEntropyV2(entropy: Uint8Array): Promise<StoredKey> {
  if (entropy.length !== 16) {
    throw new Error(`expected 16-byte entropy, got ${entropy.length}`);
  }
  const seed = hkdf(sha256, entropy, HKDF_SALT_V2, HKDF_INFO_V2, 32);
  const publicKey = await ed25519.getPublicKeyAsync(seed);
  const publicKeyMultibase = ed25519RawToMultibase(publicKey);
  const did = `did:key:${publicKeyMultibase}`;
  return {
    privateKeyHex: toHex(seed),
    publicKeyMultibase,
    did,
  };
}

/**
 * Preserved under the old name for internal call sites that already default
 * to v1; external consumers should not rely on it for new code.
 * @deprecated Use createFromEntropyV2 for new accounts.
 */
async function createFromEntropy(entropy: Uint8Array): Promise<StoredKey> {
  return createFromEntropyV1(entropy);
}

/**
 * Return the tenant's active principal key. New accounts default to v2 (HKDF);
 * existing v1 accounts keep working unchanged until the user opts into rotation
 * via {@link rotateToV2}.
 *
 * Lookup order:
 *   1. v2 store (post-9d)        → return v2
 *   2. v1 store (pre-9d)         → return v1 (user stays on v1 until rotate)
 *   3. nothing → mint a NEW v2 key
 */
export async function getOrCreatePrincipalKey(): Promise<PrincipalKey> {
  ensureBrowser();
  const v2 = loadStored('v2');
  if (v2) return toPrincipalKey(v2);
  const v1 = loadStored('v1');
  if (v1) return toPrincipalKey(v1);

  const phrase = generateMnemonic(wordlist, 128);
  const entropy = mnemonicToEntropy(phrase, wordlist);
  const stored = await createFromEntropyV2(entropy);
  saveStored(stored, 'v2');
  savePhrase(phrase, 'v2');
  return toPrincipalKey(stored);
}

/**
 * Return the active principal key's version label (v1 or v2) without
 * exposing the underlying private material. Used by rotation UI + status
 * banners.
 */
export async function principalKeyVersion(): Promise<KeyVersion | null> {
  ensureBrowser();
  if (loadStored('v2')) return 'v2';
  if (loadStored('v1')) return 'v1';
  return null;
}

export async function exportRecoveryPhrase(): Promise<string> {
  ensureBrowser();
  const phrase = loadPhrase('v2') ?? loadPhrase('v1');
  if (!phrase) {
    throw new Error(
      'no recovery phrase available — this account may have been imported without one',
    );
  }
  return phrase;
}

/**
 * Import a recovery phrase. New imports default to v2 since that's what
 * matches the server-side DID document for accounts created after 9d;
 * callers migrating an existing v1 account should use {@link rotateToV2}
 * which explicitly issues a rotation on the server.
 */
export async function importFromRecoveryPhrase(
  phrase: string,
  opts: { version?: KeyVersion } = {},
): Promise<void> {
  ensureBrowser();
  const version = opts.version ?? 'v2';
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error('invalid recovery phrase');
  }
  const entropy = mnemonicToEntropy(normalized, wordlist);
  // Re-derive the canonical mnemonic to store (strips formatting quirks).
  const canonical = entropyToMnemonic(entropy, wordlist);
  const stored =
    version === 'v2'
      ? await createFromEntropyV2(entropy)
      : await createFromEntropyV1(entropy);
  saveStored(stored, version);
  savePhrase(canonical, version);
}

/**
 * Derive both v1 and v2 PrincipalKey objects from a recovery phrase
 * WITHOUT writing them to localStorage. Used by the login flow when we
 * don't yet know which version the user's tenant was registered under
 * — we try v2 against the server, fall back to v1, then persist
 * whichever succeeded via {@link persistDerivedKey}.
 *
 * The phrase is the canonical 12-word BIP-39 string. Throws on
 * malformed input; never touches localStorage.
 */
export async function deriveKeysFromRecoveryPhrase(
  phrase: string,
): Promise<{
  canonicalPhrase: string;
  v1: { key: PrincipalKey; stored: StoredKey };
  v2: { key: PrincipalKey; stored: StoredKey };
}> {
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error('invalid recovery phrase');
  }
  const entropy = mnemonicToEntropy(normalized, wordlist);
  const canonical = entropyToMnemonic(entropy, wordlist);
  const v1Stored = await createFromEntropyV1(entropy);
  const v2Stored = await createFromEntropyV2(entropy);
  return {
    canonicalPhrase: canonical,
    v1: { key: toPrincipalKey(v1Stored), stored: v1Stored },
    v2: { key: toPrincipalKey(v2Stored), stored: v2Stored },
  };
}

/**
 * Persist a previously-derived key + phrase to localStorage. Pairs with
 * {@link deriveKeysFromRecoveryPhrase} — the login form derives both
 * versions, finds which one the server recognises, then calls this
 * with the winning version.
 */
export function persistDerivedKey(
  stored: StoredKey,
  phrase: string,
  version: KeyVersion,
): void {
  ensureBrowser();
  saveStored(stored, version);
  savePhrase(phrase, version);
}

export async function clearPrincipalKey(): Promise<void> {
  ensureBrowser();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PHRASE_KEY);
  localStorage.removeItem(STORAGE_KEY_V2);
  localStorage.removeItem(PHRASE_KEY_V2);
}

export async function hasPrincipalKey(): Promise<boolean> {
  ensureBrowser();
  return loadStored('v2') !== null || loadStored('v1') !== null;
}

export interface RotationResult {
  oldDid: string;
  newDid: string;
  newPublicKeyMultibase: string;
}

/**
 * Derive a fresh v2 key from the existing v1 recovery phrase and persist
 * it as the active key. Returns both the old and new DIDs so the caller
 * can submit them to POST /api/tenants/rotate.
 *
 * Caller is responsible for the server round-trip; this function only
 * mutates localStorage.
 */
export async function rotateToV2(): Promise<RotationResult> {
  ensureBrowser();
  const v1 = loadStored('v1');
  const phrase = loadPhrase('v1');
  if (!v1 || !phrase) {
    throw new Error(
      'no v1 principal key found — rotation is only available for existing v1 accounts',
    );
  }
  // Already rotated? Return a no-op-ish result.
  const existingV2 = loadStored('v2');
  if (existingV2) {
    return {
      oldDid: v1.did,
      newDid: existingV2.did,
      newPublicKeyMultibase: existingV2.publicKeyMultibase,
    };
  }
  const entropy = mnemonicToEntropy(phrase, wordlist);
  const v2 = await createFromEntropyV2(entropy);
  saveStored(v2, 'v2');
  savePhrase(phrase, 'v2');
  return {
    oldDid: v1.did,
    newDid: v2.did,
    newPublicKeyMultibase: v2.publicKeyMultibase,
  };
}

/**
 * Sign a buffer with the OLD (v1) key. Used during rotation to prove control
 * of the pre-rotation DID before the server promotes the new DID.
 */
export async function signWithV1(bytes: Uint8Array): Promise<Uint8Array> {
  ensureBrowser();
  const v1 = loadStored('v1');
  if (!v1) throw new Error('no v1 key present');
  return ed25519.signAsync(bytes, fromHex(v1.privateKeyHex));
}

/**
 * Sign a buffer with the NEW (v2) key. Used during rotation to prove
 * control of the post-rotation DID (the public key the server is about to
 * publish).
 */
export async function signWithV2(bytes: Uint8Array): Promise<Uint8Array> {
  ensureBrowser();
  const v2 = loadStored('v2');
  if (!v2) throw new Error('no v2 key present');
  return ed25519.signAsync(bytes, fromHex(v2.privateKeyHex));
}

// ---------------------------------------------------- exports for tests only
// `createFromEntropy` stays available as an alias so any consumer that
// imports the old name keeps compiling. New tests should import V1/V2
// explicitly.
export {
  createFromEntropy,
  createFromEntropyV1,
  createFromEntropyV2,
};
