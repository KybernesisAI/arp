/**
 * Unit tests for v1/v2 principal-key derivation — ensures HKDF-v2 produces
 * a different (deterministic) seed from the same entropy than v1 did.
 *
 * Shims `window` + `localStorage` at module scope so principal-key-browser's
 * ensureBrowser() guard passes. The tested functions (createFromEntropyV1 /
 * createFromEntropyV2) are pure and don't write to storage themselves.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

beforeAll(() => {
  const store = new Map<string, string>();
  const fakeLs = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage: fakeLs };
  (globalThis as unknown as { localStorage: unknown }).localStorage = fakeLs;
});

// Stable 12-word phrase from BIP-39 wordlist. Deterministic: 16 bytes of
// 0x00-indexed entropy produces `abandon abandon … about`.
const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Import after the globalThis shim above so ensureBrowser() passes.
let createFromEntropyV1: (e: Uint8Array) => Promise<{ did: string; publicKeyMultibase: string; privateKeyHex: string }>;
let createFromEntropyV2: (e: Uint8Array) => Promise<{ did: string; publicKeyMultibase: string; privateKeyHex: string }>;

beforeAll(async () => {
  const mod = await import('../lib/principal-key-browser');
  createFromEntropyV1 = mod.createFromEntropyV1;
  createFromEntropyV2 = mod.createFromEntropyV2;
});

describe('principal-key-browser derivation', () => {
  it('v1 and v2 disagree on the same entropy', async () => {
    const entropy = mnemonicToEntropy(PHRASE, wordlist);
    const v1 = await createFromEntropyV1(entropy);
    const v2 = await createFromEntropyV2(entropy);
    expect(v1.did).not.toBe(v2.did);
    expect(v1.publicKeyMultibase).not.toBe(v2.publicKeyMultibase);
    expect(v1.privateKeyHex).not.toBe(v2.privateKeyHex);
  });

  it('v2 is deterministic for the same entropy', async () => {
    const entropy = mnemonicToEntropy(PHRASE, wordlist);
    const a = await createFromEntropyV2(entropy);
    const b = await createFromEntropyV2(entropy);
    expect(a.did).toBe(b.did);
    expect(a.publicKeyMultibase).toBe(b.publicKeyMultibase);
    expect(a.privateKeyHex).toBe(b.privateKeyHex);
  });

  it('v2 produces a 32-byte seed (the HKDF output size)', async () => {
    const entropy = mnemonicToEntropy(PHRASE, wordlist);
    const v2 = await createFromEntropyV2(entropy);
    expect(v2.privateKeyHex.length).toBe(64); // 32 bytes = 64 hex chars
  });

  it('v1 rejects non-16-byte entropy', async () => {
    await expect(createFromEntropyV1(new Uint8Array(12))).rejects.toThrow();
  });

  it('v2 rejects non-16-byte entropy', async () => {
    await expect(createFromEntropyV2(new Uint8Array(12))).rejects.toThrow();
  });

  it('v1 matches the Phase-8.5 entropy-padded reference value', async () => {
    // Stability test: if createFromEntropyV1 ever changes output for a given
    // entropy, existing v1 users lose account access. This fixture is the
    // regression gate.
    const entropy = mnemonicToEntropy(PHRASE, wordlist);
    const v1 = await createFromEntropyV1(entropy);
    // v1 seed = entropy || entropy = 16 bytes of 0 then 16 bytes of 0 = 32
    // bytes of 0, which produces the Ed25519 pubkey for seed=0x00 repeated.
    // We don't hard-code the base58 multibase here; we just pin the fact
    // that the seed is 32 bytes of zeros.
    expect(v1.privateKeyHex).toBe('0'.repeat(64));
  });
});
