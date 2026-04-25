import { beforeEach, describe, expect, it } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { multibaseEd25519ToRaw } from '@kybernesis/arp-transport';

/**
 * Phase 10/10d: HKDF v1 → v2 principal-key rotation in the owner-app
 * browser module. Mirrors the cloud's tests:
 *   - new accounts mint v2 by default (different DID than v1 would yield)
 *   - rotateToV2 derives a fresh v2 key from the existing v1 entropy and
 *     keeps the v1 entropy in localStorage so legacy audit signatures
 *     remain reproducible until the grace window expires server-side.
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
  if (
    typeof globalThis.crypto === 'undefined' ||
    typeof globalThis.crypto.getRandomValues !== 'function'
  ) {
    throw new Error('expected globalThis.crypto.getRandomValues to be available in Node 24+');
  }
}

function clearBrowserGlobals(): void {
  delete (globalThis as Partial<{ window: unknown; localStorage: unknown }>).window;
  delete (globalThis as Partial<{ window: unknown; localStorage: unknown }>).localStorage;
}

async function importModule(): Promise<typeof import('../../lib/principal-key-browser')> {
  return await import('../../lib/principal-key-browser');
}

describe('principal-key-browser v2 + rotation', () => {
  beforeEach(() => {
    clearBrowserGlobals();
    installBrowserGlobals();
  });

  it('new accounts default to v2 (HKDF derivation)', async () => {
    const mod = await importModule();
    await mod.getOrCreatePrincipalKey();
    expect(await mod.principalKeyVersion()).toBe('v2');
  });

  it('rotateToV2 throws when no v1 key exists', async () => {
    const mod = await importModule();
    // Mint v2 directly — no v1 anywhere.
    await mod.getOrCreatePrincipalKey();
    await expect(mod.rotateToV2()).rejects.toThrow(/no v1 principal key/);
  });

  it('rotateToV2 promotes v1 entropy into a v2 key, returning both DIDs', async () => {
    const mod = await importModule();
    // Stage a v1-only state by importing a phrase under v1 explicitly.
    // Mint a fresh v2 first to learn a valid mnemonic, then move it to v1
    // and clear v2.
    await mod.getOrCreatePrincipalKey();
    const phrase = await mod.exportRecoveryPhrase();
    await mod.clearPrincipalKey();
    await mod.importFromRecoveryPhrase(phrase, { version: 'v1' });
    expect(await mod.principalKeyVersion()).toBe('v1');

    const result = await mod.rotateToV2();
    expect(result.oldDid).toMatch(/^did:key:z/);
    expect(result.newDid).toMatch(/^did:key:z/);
    expect(result.oldDid).not.toBe(result.newDid);
    expect(result.newPublicKeyMultibase.startsWith('z')).toBe(true);

    // After rotation v2 wins on lookup; v1 entropy stays for legacy audit.
    expect(await mod.principalKeyVersion()).toBe('v2');
    const active = await mod.getOrCreatePrincipalKey();
    expect(active.did).toBe(result.newDid);

    // The new public key actually verifies a fresh signature.
    const payload = new TextEncoder().encode('post-rotation payload');
    const sig = await active.sign(payload);
    const pub = multibaseEd25519ToRaw(result.newPublicKeyMultibase);
    expect(await ed25519.verifyAsync(sig, payload, pub)).toBe(true);
  });

  it('rotateToV2 is idempotent — second call returns the same v2 DID', async () => {
    const mod = await importModule();
    await mod.getOrCreatePrincipalKey();
    const phrase = await mod.exportRecoveryPhrase();
    await mod.clearPrincipalKey();
    await mod.importFromRecoveryPhrase(phrase, { version: 'v1' });
    const first = await mod.rotateToV2();
    const second = await mod.rotateToV2();
    expect(second.newDid).toBe(first.newDid);
    expect(second.oldDid).toBe(first.oldDid);
  });
});
