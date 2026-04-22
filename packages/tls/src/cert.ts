import { createHash, webcrypto, X509Certificate } from 'node:crypto';
import * as x509 from '@peculiar/x509';
import { tlsError, type TlsError } from './errors.js';

// `@peculiar/x509` accepts any Web Crypto provider; Node's `webcrypto` is
// structurally compatible but the types diverge. Cast narrows to the shape
// the library needs.
x509.cryptoProvider.set(webcrypto as unknown as Parameters<typeof x509.cryptoProvider.set>[0]);

/** 10 years in ms, matching Phase 2 Task 2 §1. */
export const CERT_VALIDITY_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export interface GeneratedCert {
  /** PEM-encoded X.509 certificate. */
  certPem: string;
  /** PEM-encoded PKCS#8 Ed25519 private key. */
  keyPem: string;
  /** SHA-256 of DER bytes, lowercase hex (no `sha256:` prefix). */
  fingerprint: string;
}

export interface GenerateAgentCertOptions {
  /** Agent DID used for the cert Common Name, e.g. `did:web:samantha.agent`. */
  did: string;
  /**
   * Multibase-encoded Ed25519 public key. Currently unused in v0 — the cert
   * is generated from a freshly-minted key pair, as Node's Web Crypto does
   * not ingest raw multibase keys directly. Retained on the signature for
   * forward compatibility with `did:web` key-reuse workflows (Phase 3+).
   */
  publicKeyMultibase?: string;
  /** Override SAN. Defaults to the host parsed out of the DID. */
  sanHostname?: string;
  /** Override validity period (ms). Defaults to 10 years. */
  validityMs?: number;
  /** Clock injection for tests. */
  now?: () => Date;
  /** Serial number override (hex). Random when omitted. */
  serialNumber?: string;
}

/**
 * Generate a self-signed Ed25519 X.509 certificate pinned to an agent DID.
 *
 * - `CN` = the agent DID
 * - `subjectAltName` = the DNS host parsed out of `did:web:<host>` (or
 *   `options.sanHostname`)
 * - validity = 10 years by default
 */
export async function generateAgentCert(
  opts: GenerateAgentCertOptions,
): Promise<{ ok: true; value: GeneratedCert } | { ok: false; error: TlsError }> {
  const host = opts.sanHostname ?? extractHostFromDid(opts.did);
  if (!host) {
    return {
      ok: false,
      error: tlsError('invalid_input', `cannot derive SAN hostname from ${opts.did}`),
    };
  }

  const now = opts.now?.() ?? new Date();
  const notAfter = new Date(now.getTime() + (opts.validityMs ?? CERT_VALIDITY_MS));
  const serial = opts.serialNumber ?? randomSerialHex();

  try {
    const keys = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, [
      'sign',
      'verify',
    ])) as { privateKey: webcrypto.CryptoKey; publicKey: webcrypto.CryptoKey };
    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      name: `CN=${escapeDn(opts.did)}`,
      notBefore: now,
      notAfter,
      serialNumber: serial,
      signingAlgorithm: { name: 'Ed25519' },
      keys,
      extensions: [
        new x509.BasicConstraintsExtension(false, undefined, true),
        new x509.KeyUsagesExtension(
          x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyCertSign,
          true,
        ),
        new x509.ExtendedKeyUsageExtension(
          [x509.ExtendedKeyUsage.serverAuth, x509.ExtendedKeyUsage.clientAuth],
          true,
        ),
        new x509.SubjectAlternativeNameExtension([{ type: 'dns', value: host }]),
      ],
    });

    const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
    const certPem = cert.toString('pem');
    const keyPem = derToPem(new Uint8Array(pkcs8), 'PRIVATE KEY');
    const fingerprint = sha256HexOfDer(cert.rawData);
    return { ok: true, value: { certPem, keyPem, fingerprint } };
  } catch (err) {
    return {
      ok: false,
      error: tlsError('cert_generation_failed', 'failed to generate ed25519 cert', err),
    };
  }
}

/**
 * SHA-256 of DER bytes, lowercase hex. Strips PEM headers if a PEM string
 * is passed in.
 */
export function computeFingerprint(certPemOrDer: string | ArrayBuffer | Uint8Array): string {
  if (typeof certPemOrDer === 'string') {
    const der = pemToDer(certPemOrDer);
    return sha256HexOfDer(der);
  }
  return sha256HexOfDer(certPemOrDer);
}

/**
 * Validate a peer certificate (PEM) against an expected fingerprint. Constant-
 * time hex compare.
 */
export function validatePinnedCert(
  peerCertPem: string,
  expectedFingerprint: string,
): boolean {
  let actual: string;
  try {
    actual = computeFingerprint(peerCertPem);
  } catch {
    return false;
  }
  const expected = normalizeFingerprint(expectedFingerprint);
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) {
    mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Validate a peer cert in DER form (as returned by Node `tls.TLSSocket`
 * `getPeerX509Certificate().raw`).
 */
export function validatePinnedDer(
  peerDer: ArrayBuffer | Uint8Array,
  expectedFingerprint: string,
): boolean {
  const actual = sha256HexOfDer(peerDer);
  const expected = normalizeFingerprint(expectedFingerprint);
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) {
    mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export function parseCertificatePem(pem: string): X509Certificate {
  return new X509Certificate(pem);
}

export function extractHostFromDid(did: string): string | null {
  if (!did.startsWith('did:web:')) return null;
  const body = did.slice('did:web:'.length);
  const first = body.split(':')[0];
  return first ? decodeURIComponent(first) : null;
}

function sha256HexOfDer(der: ArrayBuffer | Uint8Array): string {
  const buf = der instanceof Uint8Array ? der : new Uint8Array(der);
  return createHash('sha256').update(buf).digest('hex');
}

function pemToDer(pem: string): Uint8Array {
  const match = pem.match(/-----BEGIN [^-]+-----([\s\S]+?)-----END [^-]+-----/);
  if (!match || !match[1]) {
    throw new Error('invalid PEM input');
  }
  const b64 = match[1].replace(/\s+/g, '');
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function derToPem(der: Uint8Array, label: string): string {
  const b64 = Buffer.from(der).toString('base64');
  const wrapped = b64.replace(/(.{64})/g, '$1\n').replace(/\n$/, '');
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
}

function normalizeFingerprint(value: string): string {
  return value.trim().toLowerCase().replace(/^sha-?256:/, '').replace(/:/g, '');
}

function randomSerialHex(): string {
  const bytes = new Uint8Array(16);
  webcrypto.getRandomValues(bytes);
  // Serial must be positive. Force MSB=0 to keep it unambiguously positive.
  if (bytes[0] !== undefined) {
    bytes[0] = bytes[0] & 0x7f;
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function escapeDn(value: string): string {
  // RFC 4514 special chars: , + " \ < > ; # (leading) and spaces (leading/trailing)
  return value.replace(/([,+"\\<>;#=])/g, '\\$1');
}
