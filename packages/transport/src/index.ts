/**
 * @kybernesis/arp-transport — DIDComm v2 signed messaging over HTTPS.
 *
 * This is the ONLY ARP package allowed to depend on DIDComm wire-format
 * libraries. Everything downstream (runtime, PDP, registry, audit, resolver,
 * tls) talks to the `Transport` interface exported from here. That isolation
 * keeps alt-transports (A2A, cloud mailbox, etc.) a drop-in swap rather than
 * a cross-package rewrite.
 *
 * v0 ships the DIDComm-v2 *signed* envelope only (JWM + JWS EdDSA). The full
 * JWE encryption layer lands alongside the cloud transport in Phase 7.
 */

export { createTransport, type Transport, type TransportOptions } from './transport.js';
export {
  signEnvelope,
  verifyEnvelope,
  base64urlDecode,
  base64urlEncode,
  multibaseEd25519ToRaw,
  ed25519RawToMultibase,
  type SignedEnvelope,
  type SignedEnvelopeHeader,
} from './envelope.js';
export {
  createInMemoryKeyStore,
  createFileKeyStore,
  generateEd25519Pair,
} from './keystore.js';
export { openMailbox, type Mailbox, MAILBOX_SCHEMA } from './mailbox.js';
export { createResolverAdapter, extractPrimaryEd25519Key } from './resolver-adapter.js';
export {
  transportError,
  type DidCommMessage,
  type MessageHandler,
  type MessageMeta,
  type TransportError,
  type TransportErrorCode,
  type TransportKeyStore,
  type TransportResolver,
} from './types.js';
