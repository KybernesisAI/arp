/** S6d: a session never mints a key; the phrase unlocks exactly the account's key on a new device. */
import { beforeEach, describe, expect, it } from 'vitest';

// Same localStorage shim as principal-key-browser.test.ts; installed before the module loads.
const store = new Map<string, string>();
const fakeLs = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); }, clear: () => { store.clear(); } };
(globalThis as unknown as { window: unknown }).window = { localStorage: fakeLs };
(globalThis as unknown as { localStorage: unknown }).localStorage = fakeLs;

const {
  KeyNotOnDeviceError,
  deriveKeysFromRecoveryPhrase,
  getOrCreatePrincipalKey,
  exportRecoveryPhrase,
  clearPrincipalKey,
  loadPrincipalKeyFor,
  requirePrincipalKey,
  unlockKeyFromPhrase,
  importFromRecoveryPhrase,
  exportStoredKeyFor,
  installTransferredKey,
} = await import('../lib/principal-key-browser');

describe('device key for a signed-in account', () => {
  beforeEach(async () => { await clearPrincipalKey(); });

  it('a device without the key reports it instead of minting one', async () => {
    expect(await loadPrincipalKeyFor('did:key:z6MkSomeoneElse')).toBeNull();
    await expect(requirePrincipalKey('did:key:z6MkSomeoneElse')).rejects.toBeInstanceOf(KeyNotOnDeviceError);
    expect(localStorage.getItem('arp.cloud.principalKey.v2')).toBeNull();
  });

  it('a stray key on the device is not the account key', async () => {
    const stray = await getOrCreatePrincipalKey();
    expect(await loadPrincipalKeyFor(stray.did)).not.toBeNull();
    expect(await loadPrincipalKeyFor('did:key:z6MkTheAccount')).toBeNull();
  });

  it('the phrase unlocks the account key and replaces a stray one', async () => {
    const account = await getOrCreatePrincipalKey();
    const phrase = await exportRecoveryPhrase();
    await clearPrincipalKey();
    const stray = await getOrCreatePrincipalKey();
    expect(stray.did).not.toBe(account.did);
    const key = await unlockKeyFromPhrase(phrase, account.did);
    expect(key.did).toBe(account.did);
    expect((await loadPrincipalKeyFor(account.did))?.did).toBe(account.did);
    expect(await loadPrincipalKeyFor(stray.did)).toBeNull();
    // Signing works with the unlocked key.
    const sig = await key.sign(new TextEncoder().encode('hello'));
    expect(sig.length).toBe(64);
  });

  it('a v1 account unlocks as v1', async () => {
    const account = await getOrCreatePrincipalKey();
    const phrase = await exportRecoveryPhrase();
    const { v1 } = await deriveKeysFromRecoveryPhrase(phrase);
    await clearPrincipalKey();
    const key = await unlockKeyFromPhrase(phrase, v1.key.did);
    expect(key.did).toBe(v1.key.did);
    expect(key.did).not.toBe(account.did);
    expect(localStorage.getItem('arp.cloud.principalKey.v1')).not.toBeNull();
    expect(localStorage.getItem('arp.cloud.principalKey.v2')).toBeNull();
  });

  it('wrong phrase, wrong account, wrong length → plain-words errors', async () => {
    await getOrCreatePrincipalKey();
    const phrase = await exportRecoveryPhrase();
    await expect(unlockKeyFromPhrase('one two three', 'did:key:z6Mkx')).rejects.toThrow(/12 words/);
    await expect(unlockKeyFromPhrase('abandon '.repeat(12).trim() + 'x', 'did:key:z6Mkx')).rejects.toThrow(/not a valid recovery phrase/);
    await expect(unlockKeyFromPhrase(phrase, 'did:key:z6MkDifferentAccount')).rejects.toThrow(/different account/);
  });

  it('a v1 key stored without its words rebuilds the phrase from the key', async () => {
    const PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    await importFromRecoveryPhrase(PHRASE, { version: 'v1' });
    localStorage.removeItem('arp.cloud.principalKey.v1.phrase');
    localStorage.removeItem('arp.cloud.principalKey.v2.phrase');
    expect(await exportRecoveryPhrase()).toBe(PHRASE);
    // …and it is remembered from now on.
    expect(localStorage.getItem('arp.cloud.principalKey.v1.phrase')).toBe(PHRASE);
  });

  it('a v2 key stored without its words cannot be rebuilt and says so plainly', async () => {
    await getOrCreatePrincipalKey();
    localStorage.removeItem('arp.cloud.principalKey.v2.phrase');
    await expect(exportRecoveryPhrase()).rejects.toThrow(/cannot be rebuilt/);
  });

  it('export for a device link carries the phrase; install keeps only a key that matches the account', async () => {
    const account = await getOrCreatePrincipalKey();
    const phrase = await exportRecoveryPhrase();
    const out = exportStoredKeyFor(account.did);
    expect(out).toMatchObject({ did: account.did, version: 'v2', phrase });
    expect(exportStoredKeyFor('did:key:z6MkNotMe')).toBeNull();
    await clearPrincipalKey();
    await getOrCreatePrincipalKey(); // stray
    await expect(installTransferredKey(out!, 'did:key:z6MkNotMe')).rejects.toThrow(/different account/);
    await expect(installTransferredKey({ ...out!, privateKeyHex: 'ab'.repeat(32) }, account.did)).rejects.toThrow(/does not match/);
    const key = await installTransferredKey(out!, account.did);
    expect(key.did).toBe(account.did);
    expect((await loadPrincipalKeyFor(account.did))?.did).toBe(account.did);
    expect(await exportRecoveryPhrase()).toBe(phrase);
  });
});
