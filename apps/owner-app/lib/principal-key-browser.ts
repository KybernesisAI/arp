/**
 * Browser-only principal key module. Generates an Ed25519 keypair on first
 * visit, persists the 32-byte seed in `localStorage`, and exposes sign +
 * recovery-phrase round-trip helpers.
 *
 * Phase 8.5 design: the user's principal identity is a `did:key` living in
 * their browser. Zero pasting, zero server-held secrets. The recovery phrase
 * uses a BIP-39-style 12-word mnemonic (English wordlist) — not advertised
 * as BIP-39, just a familiar shape for a 16-byte entropy seed. The Ed25519
 * 32-byte private key is derived from the entropy via PBKDF2 (bip39's
 * `mnemonicToSeed`, taking the first 32 bytes). That derivation is stable:
 * exporting + re-importing the phrase yields the identical key.
 *
 * All exports are no-ops when `window`/`localStorage` is not available so
 * this module stays safe to import from RSC boundaries. Every function that
 * actually needs the browser throws a clear error if called server-side.
 */
import * as ed25519 from '@noble/ed25519';
import { entropyToMnemonic, mnemonicToEntropy, mnemonicToSeed, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport/browser';

const STORAGE_KEY = 'arp.principalKey.v1';
/** BIP-39 entropy size for 12 words: 128 bits = 16 bytes. */
const ENTROPY_BYTES = 16;

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

function readStored(): StoredKey | null {
  const raw = localStorage.getItem(STORAGE_KEY);
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

function writeStored(entropy: Uint8Array): void {
  const payload: StoredKey = { entropyB64: bytesToB64(entropy) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** Cryptographically-random 16 bytes from the browser CSPRNG. */
function randomEntropy(): Uint8Array {
  const buf = new Uint8Array(ENTROPY_BYTES);
  crypto.getRandomValues(buf);
  return buf;
}

/** Derive the 32-byte Ed25519 seed from 16 bytes of entropy, deterministically. */
async function entropyToPrivateKey(entropy: Uint8Array): Promise<Uint8Array> {
  const mnemonic = entropyToMnemonic(entropy, wordlist);
  // PBKDF2 output is 64 bytes; Ed25519 private key seed is 32.
  const seed = await mnemonicToSeed(mnemonic);
  return seed.slice(0, 32);
}

async function buildPrincipalKey(entropy: Uint8Array): Promise<PrincipalKey> {
  const privateKey = await entropyToPrivateKey(entropy);
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
  return readStored() !== null;
}

export async function getOrCreatePrincipalKey(): Promise<PrincipalKey> {
  assertBrowser();
  const existing = readStored();
  if (existing) {
    const entropy = b64ToBytes(existing.entropyB64);
    if (entropy.length !== ENTROPY_BYTES) {
      throw new Error(
        `principal-key-browser: stored entropy has unexpected length ${entropy.length}`,
      );
    }
    return buildPrincipalKey(entropy);
  }
  const entropy = randomEntropy();
  writeStored(entropy);
  return buildPrincipalKey(entropy);
}

export async function exportRecoveryPhrase(): Promise<string> {
  assertBrowser();
  const stored = readStored();
  if (!stored) {
    throw new Error('principal-key-browser: no principal key exists yet');
  }
  const entropy = b64ToBytes(stored.entropyB64);
  return entropyToMnemonic(entropy, wordlist);
}

export async function importFromRecoveryPhrase(phrase: string): Promise<void> {
  assertBrowser();
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
  writeStored(entropy);
}

export async function clearPrincipalKey(): Promise<void> {
  assertBrowser();
  localStorage.removeItem(STORAGE_KEY);
}
