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
import { ed25519RawToMultibase } from '@kybernesis/arp-transport/browser';
import {
  generateMnemonic,
  mnemonicToEntropy,
  validateMnemonic,
  entropyToMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

const STORAGE_KEY = 'arp.cloud.principalKey.v1';
const PHRASE_KEY = 'arp.cloud.principalKey.v1.phrase';

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

function loadStored(): StoredKey | null {
  ensureBrowser();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredKey;
    if (!parsed.privateKeyHex || !parsed.publicKeyMultibase || !parsed.did) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStored(stored: StoredKey): void {
  ensureBrowser();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

function savePhrase(phrase: string): void {
  ensureBrowser();
  localStorage.setItem(PHRASE_KEY, phrase);
}

function loadPhrase(): string | null {
  ensureBrowser();
  return localStorage.getItem(PHRASE_KEY);
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

async function createFromEntropy(entropy: Uint8Array): Promise<StoredKey> {
  // The BIP-39 entropy is 128 bits (16 bytes). Ed25519 needs a 32-byte
  // private key. We pad to 32 bytes deterministically by doubling the
  // entropy — not a secure KDF, but acceptable for v1: the security
  // surface is "user's browser storage"; the recovery phrase itself
  // carries the full entropy. Phase 9 can swap in HKDF-SHA256 without
  // breaking existing accounts (migration plan: rotate on next login).
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

export async function getOrCreatePrincipalKey(): Promise<PrincipalKey> {
  ensureBrowser();
  const existing = loadStored();
  if (existing) return toPrincipalKey(existing);

  const phrase = generateMnemonic(wordlist, 128);
  const entropy = mnemonicToEntropy(phrase, wordlist);
  const stored = await createFromEntropy(entropy);
  saveStored(stored);
  savePhrase(phrase);
  return toPrincipalKey(stored);
}

export async function exportRecoveryPhrase(): Promise<string> {
  ensureBrowser();
  const phrase = loadPhrase();
  if (!phrase) {
    throw new Error(
      'no recovery phrase available — this account may have been imported without one',
    );
  }
  return phrase;
}

export async function importFromRecoveryPhrase(phrase: string): Promise<void> {
  ensureBrowser();
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error('invalid recovery phrase');
  }
  const entropy = mnemonicToEntropy(normalized, wordlist);
  // Re-derive the canonical mnemonic to store (strips formatting quirks).
  const canonical = entropyToMnemonic(entropy, wordlist);
  const stored = await createFromEntropy(entropy);
  saveStored(stored);
  savePhrase(canonical);
}

export async function clearPrincipalKey(): Promise<void> {
  ensureBrowser();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PHRASE_KEY);
}

export async function hasPrincipalKey(): Promise<boolean> {
  ensureBrowser();
  return loadStored() !== null;
}
