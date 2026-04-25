import * as ed25519 from '@noble/ed25519';
import type { DidCommMessage } from './types.js';

/**
 * JWM-style signed envelope for DIDComm v2. v0 ships the signed flavour only;
 * encryption (JWE layer) lands alongside the Cloud transport in Phase 7.
 *
 * Wire format: a compact JWS
 *   <base64url(header)> . <base64url(payload)> . <base64url(signature)>
 *
 * header = { alg: "EdDSA", typ: "application/didcomm-signed+json", kid: "<did>#<keyRef>" }
 * payload = JWM (the `DidCommMessage` shape)
 *
 * This matches the DIDComm v2 signed-message wire format closely enough that
 * a future Veramo-based packing/unpacking path can consume it unchanged.
 */

export interface SignedEnvelopeHeader {
  alg: 'EdDSA';
  typ: 'application/didcomm-signed+json';
  kid: string;
}

export interface SignedEnvelope {
  header: SignedEnvelopeHeader;
  payload: DidCommMessage;
  compact: string;
}

export async function signEnvelope(params: {
  message: DidCommMessage;
  signerDid: string;
  keyRef?: string;
  privateKey: Uint8Array;
}): Promise<SignedEnvelope> {
  const kid = `${params.signerDid}#${params.keyRef ?? 'key-1'}`;
  const header: SignedEnvelopeHeader = {
    alg: 'EdDSA',
    typ: 'application/didcomm-signed+json',
    kid,
  };
  const message: DidCommMessage = {
    ...params.message,
    from: params.signerDid,
    created_time: params.message.created_time ?? Math.floor(Date.now() / 1000),
  };
  const headerB64 = base64urlEncode(toBytes(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(toBytes(JSON.stringify(message)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await ed25519.signAsync(toBytes(signingInput), params.privateKey);
  const compact = `${signingInput}.${base64urlEncode(sig)}`;
  return { header, payload: message, compact };
}

export async function verifyEnvelope(
  compact: string,
  publicKey: Uint8Array,
): Promise<{ ok: true; message: DidCommMessage; header: SignedEnvelopeHeader }
  | { ok: false; error: string }> {
  const parts = compact.split('.');
  if (parts.length !== 3) return { ok: false, error: 'expected 3 JWS segments' };
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  let header: SignedEnvelopeHeader;
  let message: DidCommMessage;
  try {
    header = JSON.parse(fromBytes(base64urlDecode(headerB64))) as SignedEnvelopeHeader;
    message = JSON.parse(fromBytes(base64urlDecode(payloadB64))) as DidCommMessage;
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${(err as Error).message}` };
  }
  if (header.alg !== 'EdDSA') {
    return { ok: false, error: `unsupported alg: ${header.alg}` };
  }
  const sig = base64urlDecode(sigB64);
  const signingInput = `${headerB64}.${payloadB64}`;
  const ok = await ed25519.verifyAsync(sig, toBytes(signingInput), publicKey);
  if (!ok) return { ok: false, error: 'signature verification failed' };
  return { ok: true, message, header };
}

/**
 * Browser-safe base64url codec. Avoids Node's `Buffer.from(..., 'base64url')`
 * which is unavailable (or not honoured) in some webpack/Next.js client
 * bundles — symptoms include `Error: Unknown encoding: base64url` thrown
 * from the polyfilled `buffer` package. Uses btoa/atob + URL-safe alphabet
 * transformation, which works identically in Node 16+ and every modern
 * browser.
 */
export function base64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function fromBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Parse a multibase-encoded Ed25519 public key (`z`-prefixed base58btc) into
 * the raw 32-byte form. Used by resolver adapters to extract keys from a DID
 * document's `publicKeyMultibase` field.
 */
export function multibaseEd25519ToRaw(multibase: string): Uint8Array {
  if (!multibase.startsWith('z')) {
    throw new Error('expected multibase z-base58btc prefix');
  }
  const decoded = base58btcDecode(multibase.slice(1));
  // W3C Multibase + Multicodec: 0xed 0x01 prefix for ed25519-pub
  if (decoded.length === 34 && decoded[0] === 0xed && decoded[1] === 0x01) {
    return decoded.slice(2);
  }
  if (decoded.length === 32) return decoded;
  throw new Error(
    `unexpected ed25519 multibase length ${decoded.length}; expected 32 or 34 bytes`,
  );
}

/**
 * Encode a raw 32-byte Ed25519 public key to multibase `z` + multicodec-prefixed
 * base58btc. Useful for tests that mint fresh identities.
 */
export function ed25519RawToMultibase(raw: Uint8Array): string {
  if (raw.length !== 32) {
    throw new Error('ed25519 public key must be 32 bytes');
  }
  const prefixed = new Uint8Array(34);
  prefixed[0] = 0xed;
  prefixed[1] = 0x01;
  prefixed.set(raw, 2);
  return `z${base58btcEncode(prefixed)}`;
}

/* ---- minimal base58btc (bitcoin alphabet) ---- */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_DECODE: Record<string, number> = {};
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_DECODE[BASE58_ALPHABET[i]!] = i;
}

function base58btcEncode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const digits: number[] = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i]!;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let leadingZeros = '';
  for (let k = 0; k < bytes.length && bytes[k] === 0; k++) {
    leadingZeros += '1';
  }
  let out = '';
  for (let q = digits.length - 1; q >= 0; q--) {
    out += BASE58_ALPHABET[digits[q]!]!;
  }
  return leadingZeros + out;
}

function base58btcDecode(s: string): Uint8Array {
  if (s.length === 0) return new Uint8Array();
  const bytes: number[] = [0];
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const digit = BASE58_DECODE[c];
    if (digit === undefined) {
      throw new Error(`invalid base58btc char: ${c}`);
    }
    let carry = digit;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  for (let k = 0; k < s.length && s[k] === '1'; k++) leadingZeros++;
  const out = new Uint8Array(leadingZeros + bytes.length);
  for (let q = 0; q < bytes.length; q++) {
    out[leadingZeros + (bytes.length - 1 - q)] = bytes[q]!;
  }
  return out;
}
