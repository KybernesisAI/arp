/**
 * @kybernesis/arp-tls — self-signed Ed25519 X.509 cert generation +
 * DID-pinned fingerprint validation.
 *
 * The ARP TLS model replaces web PKI with a DID-doc-pinned fingerprint.
 * Agents generate a long-lived cert at first boot, publish the SHA-256 of
 * its DER encoding in their DID document, and peers validate against that
 * pin rather than a CA chain.
 *
 * See `docs/ARP-hns-resolution.md §4` and `docs/ARP-phase-2-runtime-core.md
 * §4 Task 2` for the strategy.
 */

export {
  generateAgentCert,
  computeFingerprint,
  validatePinnedCert,
  validatePinnedDer,
  parseCertificatePem,
  extractHostFromDid,
  CERT_VALIDITY_MS,
  type GeneratedCert,
  type GenerateAgentCertOptions,
} from './cert.js';
export { toTlsServerOptions, toTlsClientOptions } from './server.js';
export { tlsError, type TlsError, type TlsErrorCode } from './errors.js';
