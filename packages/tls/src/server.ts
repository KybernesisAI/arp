import type { SecureContextOptions } from 'node:tls';
import type { GeneratedCert } from './cert.js';

/**
 * Build the subset of TLS options Node's `createSecureContext` /
 * `tls.createServer` need to serve a DID-pinned self-signed cert.
 *
 * Usage:
 *   const srv = https.createServer(toTlsServerOptions(cert), app);
 *   tls.createServer(toTlsServerOptions(cert), ...);
 */
export function toTlsServerOptions(cert: GeneratedCert): SecureContextOptions {
  return {
    cert: cert.certPem,
    key: cert.keyPem,
  };
}

/**
 * Minimum tls.connect options for a pinning-aware client. The caller is
 * responsible for verifying the peer's fingerprint in the `secureConnect`
 * handler (use `validatePinnedDer(sock.getPeerX509Certificate().raw, fp)`).
 * `rejectUnauthorized: false` is required — the ARP PKI is DID-pinned, not
 * CA-chained.
 *
 * `servername` defaults to `host` unless `host` is a literal IP (Node rejects
 * IP-valued SNI). Pass an explicit `servername` when connecting via IP — it
 * should be the DNS name the peer's cert SAN covers.
 */
export function toTlsClientOptions(expected: {
  host: string;
  port: number;
  servername?: string;
}): {
  host: string;
  port: number;
  rejectUnauthorized: false;
  servername?: string;
} {
  const sni = expected.servername ?? (isLiteralIp(expected.host) ? undefined : expected.host);
  return {
    host: expected.host,
    port: expected.port,
    rejectUnauthorized: false,
    ...(sni ? { servername: sni } : {}),
  };
}

function isLiteralIp(host: string): boolean {
  // Cheap check — good enough for excluding IPv4/IPv6 literals from SNI.
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':');
}
