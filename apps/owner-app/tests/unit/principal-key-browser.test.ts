import { beforeEach, describe, expect, it } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { multibaseEd25519ToRaw } from '@kybernesis/arp-transport';

/**
 * The principal-key-browser module runs in the browser. For unit testing we
 * install minimal globals (`window`, `localStorage`, `crypto`, `atob`, `btoa`)
 * before importing the module, then verify:
 *   - a fresh key generates a did:key whose pubkey decodes cleanly,
 *   - sign()/verifyAsync round-trip works,
 *   - export + re-import of the recovery phrase restores the identical key,
 *   - clearPrincipalKey wipes storage and hasPrincipalKey flips false.
 */
function installBrowserGlobals(): void {
  const store = new Map<string, string>();
  const fakeLocalStorage: Storage = {
    get length() {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
  };
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
  (globalThis as unknown as { localStorage: Storage }).localStorage = fakeLocalStorage;
  if (typeof globalThis.atob === 'undefined') {
    globalThis.atob = (b64: string) => Buffer.from(b64, 'base64').toString('binary');
    globalThis.btoa = (bin: string) => Buffer.from(bin, 'binary').toString('base64');
  }
  // Node 24 has globalThis.crypto with getRandomValues; assert it for safety.
  if (
    typeof globalThis.crypto === 'undefined' ||
    typeof globalThis.crypto.getRandomValues !== 'function'
  ) {
    throw new Error('expected globalThis.crypto.getRandomValues to be available in Node 24+');
  }
}

async function importModule(): Promise<typeof import('../../lib/principal-key-browser')> {
  // Re-import fresh each test so the module re-reads the installed globals.
  return await import('../../lib/principal-key-browser');
}

function clearBrowserGlobals(): void {
  delete (globalThis as Partial<{ window: unknown; localStorage: unknown }>).window;
  delete (globalThis as Partial<{ window: unknown; localStorage: unknown }>).localStorage;
}

describe('principal-key-browser', () => {
  beforeEach(() => {
    clearBrowserGlobals();
    installBrowserGlobals();
  });

  it('generates a did:key whose public key decodes from the identifier', async () => {
    const mod = await importModule();
    expect(await mod.hasPrincipalKey()).toBe(false);
    const key = await mod.getOrCreatePrincipalKey();
    expect(await mod.hasPrincipalKey()).toBe(true);
    expect(key.did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);

    const multibase = key.did.slice('did:key:'.length);
    const raw = multibaseEd25519ToRaw(multibase);
    expect(raw).toHaveLength(32);

    // Second call returns the same key (persisted in localStorage).
    const key2 = await mod.getOrCreatePrincipalKey();
    expect(key2.did).toBe(key.did);
  });

  it('signs a payload that verifies against the embedded public key', async () => {
    const mod = await importModule();
    const key = await mod.getOrCreatePrincipalKey();
    const payload = new TextEncoder().encode('hello from a phase 8.5 browser');
    const sig = await key.sign(payload);
    const pub = multibaseEd25519ToRaw(key.did.slice('did:key:'.length));
    expect(await ed25519.verifyAsync(sig, payload, pub)).toBe(true);
  });

  it('exports + re-imports a 12-word recovery phrase that restores the identical key', async () => {
    const mod = await importModule();
    const original = await mod.getOrCreatePrincipalKey();
    const phrase = await mod.exportRecoveryPhrase();
    expect(phrase.split(/\s+/)).toHaveLength(12);

    const payload = new TextEncoder().encode('round-trip payload');
    const sigBefore = await original.sign(payload);

    await mod.clearPrincipalKey();
    expect(await mod.hasPrincipalKey()).toBe(false);

    await mod.importFromRecoveryPhrase(phrase);
    const restored = await mod.getOrCreatePrincipalKey();
    expect(restored.did).toBe(original.did);

    const sigAfter = await restored.sign(payload);
    // Ed25519 is deterministic — same payload + same private key produces the same signature.
    expect(Buffer.from(sigAfter).toString('hex')).toBe(
      Buffer.from(sigBefore).toString('hex'),
    );

    const pub = multibaseEd25519ToRaw(restored.did.slice('did:key:'.length));
    expect(await ed25519.verifyAsync(sigAfter, payload, pub)).toBe(true);
  });

  it('rejects an invalid recovery phrase', async () => {
    const mod = await importModule();
    await expect(
      mod.importFromRecoveryPhrase('not a valid mnemonic at all at all at all'),
    ).rejects.toThrow(/invalid_recovery_phrase/);
  });

  it('clearPrincipalKey removes the stored key', async () => {
    const mod = await importModule();
    await mod.getOrCreatePrincipalKey();
    expect(await mod.hasPrincipalKey()).toBe(true);
    await mod.clearPrincipalKey();
    expect(await mod.hasPrincipalKey()).toBe(false);
  });
});
