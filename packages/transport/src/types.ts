/**
 * Public transport surface. The rest of the ARP codebase depends on THIS
 * file only — it must never reach through to concrete DIDComm wire-format
 * libraries. That decoupling keeps A2A / alternative transports a drop-in
 * swap rather than a cross-package rewrite.
 */

/** DIDComm v2–style plaintext message (JWM body). */
export interface DidCommMessage {
  /** Unique message id (e.g. a UUID). */
  id: string;
  /** Protocol URI, e.g. `https://didcomm.org/arp/1.0/request`. */
  type: string;
  /** Sender DID. */
  from: string;
  /** Recipient DIDs (ARP uses a single element in v0). */
  to: string[];
  /** Epoch seconds. Filled in automatically when absent. */
  created_time?: number;
  /** Optional thread id (for multi-turn flows). */
  thid?: string;
  /** Arbitrary application body. */
  body: Record<string, unknown>;
}

/** Metadata produced by the transport when a message is received. */
export interface MessageMeta {
  /** Peer DID who signed the envelope. */
  peerDid: string;
  /** Did the signature verify? Transport drops unverified envelopes at ingest,
   *  but the flag is preserved here for audit. */
  verified: boolean;
  /** Raw envelope bytes as received (base64url-encoded JWS). */
  envelopeRaw: string;
  /** Epoch ms at which we recorded the ingest. */
  receivedAtMs: number;
}

/** Message handler invoked on every inbound envelope after signature verify. */
export type MessageHandler = (msg: DidCommMessage, meta: MessageMeta) => Promise<void>;

/** Agent key material exposed to the transport. */
export interface TransportKeyStore {
  /** Agent DID (e.g. `did:web:samantha.agent`). */
  did: string;
  /** Ed25519 public key, raw 32-byte form. */
  publicKeyRaw(): Promise<Uint8Array>;
  /** Ed25519 private key, raw 32-byte form. */
  privateKeyRaw(): Promise<Uint8Array>;
}

/** Peer resolver interface — supplied by `@kybernesis/arp-resolver`. */
export interface TransportResolver {
  /** Return the Ed25519 public key bytes for the given DID's active key. */
  resolveEd25519PublicKey(did: string): Promise<Uint8Array>;
  /** Return the DIDComm HTTPS endpoint URL for the given DID. */
  resolveDidCommEndpoint(did: string): Promise<URL>;
}

export type TransportErrorCode =
  | 'invalid_envelope'
  | 'invalid_signature'
  | 'unknown_peer'
  | 'send_failed'
  | 'mailbox_failure';

export interface TransportError {
  code: TransportErrorCode;
  message: string;
  cause?: unknown;
}

export function transportError(
  code: TransportErrorCode,
  message: string,
  cause?: unknown,
): TransportError {
  return { code, message, cause };
}
