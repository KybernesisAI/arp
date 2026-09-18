/**
 * A2A agent-card signing (AgentID S5 / A1), per A2A spec §8.4.
 *
 * Payload = the card minus `signatures`, with default-valued optional fields
 * removed, canonicalized with RFC 8785 (JCS). Signature = JWS over
 * `<base64url(protected)>.<base64url(payload)>`. We sign with the identity's
 * Ed25519 key (`alg: EdDSA`, `kid: <did>#key-1`, `jku: <mirror>/.well-known/jwks.json`)
 * and verify EdDSA (OKP) or ES256 (EC) keys from a JWKS.
 */

import canonicalize from 'canonicalize';
import * as ed25519 from '@noble/ed25519';
import { base64urlDecode, base64urlEncode } from './envelope.js';

export interface CardSignature {
  protected: string;
  signature: string;
  header?: Record<string, unknown>;
}

/** Drop `signatures`, then remove empty arrays / empty strings / false on optional fields, recursively. */
export function canonicalizeAgentCard(card: Record<string, unknown>): string {
  const { signatures: _s, ...rest } = card;
  const cleaned = strip(rest, true) as Record<string, unknown>;
  const out = canonicalize(cleaned);
  if (typeof out !== 'string') throw new Error('canonicalizeAgentCard: canonicalization failed');
  return out;
}

const REQUIRED_TOP = new Set(['name', 'description', 'supportedInterfaces', 'version', 'capabilities', 'defaultInputModes', 'defaultOutputModes', 'skills']);

function strip(value: unknown, top: boolean): unknown {
  if (Array.isArray(value)) return value.map((v) => strip(v, false));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const keep = top && REQUIRED_TOP.has(k);
      if (v === undefined || v === null) continue;
      // proto3 presence: unset optionals are absent already; default-valued
      // non-required fields (empty repeated, empty string) are omitted;
      // explicitly-present booleans (optional bool) are kept — the spec's
      // own example keeps `streaming: false`.
      if (!keep) {
        if (Array.isArray(v) && v.length === 0) continue;
        if (v === '') continue;
      }
      out[k] = strip(v, false);
    }
    return out;
  }
  return value;
}

export async function signAgentCard(
  card: Record<string, unknown>,
  opts: { privateKey: Uint8Array; kid: string; jku?: string },
): Promise<CardSignature> {
  const payload = base64urlEncode(new TextEncoder().encode(canonicalizeAgentCard(card)));
  const header: Record<string, unknown> = { alg: 'EdDSA', typ: 'JOSE', kid: opts.kid, ...(opts.jku ? { jku: opts.jku } : {}) };
  const prot = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const sig = await ed25519.signAsync(new TextEncoder().encode(`${prot}.${payload}`), opts.privateKey);
  return { protected: prot, signature: base64urlEncode(sig) };
}

export interface Jwk {
  kty: string;
  kid?: string;
  crv?: string;
  x?: string;
  y?: string;
  alg?: string;
}

/** Ed25519 raw public key → OKP JWK (for the identity's /.well-known/jwks.json). */
export function ed25519ToJwk(publicKeyRaw: Uint8Array, kid: string): Jwk {
  return { kty: 'OKP', crv: 'Ed25519', x: base64urlEncode(publicKeyRaw), kid, alg: 'EdDSA' };
}

export type CardVerifyResult =
  | { ok: true; kid: string; alg: string }
  | { ok: false; reason: 'no_signature' | 'bad_header' | 'unknown_key' | 'unsupported_alg' | 'bad_signature' };

/**
 * Verify the first signature whose `kid` is found in `jwks`. EdDSA (OKP/Ed25519)
 * is verified here; ES256 is delegated to `verifyEs256` when supplied so the
 * transport package stays free of a P-256 dependency.
 */
export async function verifyAgentCardSignature(
  card: Record<string, unknown>,
  jwks: { keys: Jwk[] },
  opts: { verifyEs256?: (data: Uint8Array, sig: Uint8Array, jwk: Jwk) => Promise<boolean> } = {},
): Promise<CardVerifyResult> {
  const sigs = card['signatures'];
  if (!Array.isArray(sigs) || sigs.length === 0) return { ok: false, reason: 'no_signature' };
  const payload = base64urlEncode(new TextEncoder().encode(canonicalizeAgentCard(card)));
  let last: CardVerifyResult = { ok: false, reason: 'unknown_key' };
  for (const s of sigs as CardSignature[]) {
    let header: { alg?: string; kid?: string };
    try {
      header = JSON.parse(new TextDecoder().decode(base64urlDecode(s.protected))) as { alg?: string; kid?: string };
    } catch {
      last = { ok: false, reason: 'bad_header' };
      continue;
    }
    const jwk = jwks.keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      last = { ok: false, reason: 'unknown_key' };
      continue;
    }
    const data = new TextEncoder().encode(`${s.protected}.${payload}`);
    const sig = base64urlDecode(s.signature);
    let valid = false;
    if (header.alg === 'EdDSA' && jwk.kty === 'OKP' && jwk.crv === 'Ed25519' && jwk.x) {
      try {
        valid = await ed25519.verifyAsync(sig, data, base64urlDecode(jwk.x));
      } catch {
        valid = false;
      }
    } else if (header.alg === 'ES256' && opts.verifyEs256) {
      valid = await opts.verifyEs256(data, sig, jwk);
    } else {
      last = { ok: false, reason: 'unsupported_alg' };
      continue;
    }
    if (valid) return { ok: true, kid: String(header.kid), alg: String(header.alg) };
    last = { ok: false, reason: 'bad_signature' };
  }
  return last;
}
