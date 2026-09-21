/**
 * Device-link crypto (S6d). Runs in both browsers (and Node 24 for tests) on
 * WebCrypto only: ECDH P-256 → HKDF-SHA256 → AES-256-GCM. The receiver's
 * private key never leaves its browser; the sender's ephemeral key is used
 * once. Payload = the stored account key + the recovery phrase, if any.
 */

export interface KeyTransferPayload {
  privateKeyHex: string;
  publicKeyMultibase: string;
  did: string;
  version: 'v1' | 'v2';
  phrase: string | null;
}

export interface SealedTransfer {
  ciphertext: string;
  iv: string;
  senderPub: string;
}

const INFO = new TextEncoder().encode('arp-device-link-v1');

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('WebCrypto is not available here.');
  return c.subtle;
}

export function b64u(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (t.length % 4)) % 4;
  const bin = atob(t.padEnd(t.length + pad, '='));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Receiver (new device): make the ephemeral pair; publish `pub`, keep `privateKey` in memory. */
export async function createReceiver(): Promise<{ pub: string; privateKey: CryptoKey }> {
  const kp = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const raw = await subtle().exportKey('raw', kp.publicKey);
  return { pub: b64u(raw), privateKey: kp.privateKey };
}

async function importPub(pub: string): Promise<CryptoKey> {
  const raw = unb64u(pub);
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('bad receiver key');
  return subtle().importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

async function aesKey(privateKey: CryptoKey, peerPub: CryptoKey, salt: Uint8Array): Promise<CryptoKey> {
  const shared = await subtle().deriveBits({ name: 'ECDH', public: peerPub }, privateKey, 256);
  const hk = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: INFO }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Sender (device with the key): encrypt the payload to the receiver's public key. */
export async function sealForReceiver(receiverPub: string, payload: KeyTransferPayload): Promise<SealedTransfer> {
  const peer = await importPub(receiverPub);
  const eph = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const senderRaw = new Uint8Array(await subtle().exportKey('raw', eph.publicKey));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // Salt = receiver pub || sender pub, so the key is bound to this exact pair.
  const salt = new Uint8Array([...unb64u(receiverPub), ...senderRaw]);
  const key = await aesKey(eph.privateKey, peer, salt);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
  return { ciphertext: b64u(ct), iv: b64u(iv), senderPub: b64u(senderRaw) };
}

/** Receiver: open the sealed payload with the private key kept from `createReceiver`. */
export async function openFromSender(privateKey: CryptoKey, receiverPub: string, sealed: SealedTransfer): Promise<KeyTransferPayload> {
  const peer = await importPub(sealed.senderPub);
  const salt = new Uint8Array([...unb64u(receiverPub), ...unb64u(sealed.senderPub)]);
  const key = await aesKey(privateKey, peer, salt);
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64u(sealed.iv) }, key, unb64u(sealed.ciphertext));
  const parsed = JSON.parse(new TextDecoder().decode(pt)) as KeyTransferPayload;
  if (!parsed.privateKeyHex || !parsed.did || !parsed.publicKeyMultibase || (parsed.version !== 'v1' && parsed.version !== 'v2')) throw new Error('bad payload');
  return parsed;
}
