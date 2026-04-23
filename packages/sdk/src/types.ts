/**
 * Developer-facing types for @kybernesis/arp-sdk.
 *
 * The SDK wraps @kybernesis/arp-runtime + @kybernesis/arp-pdp +
 * @kybernesis/arp-transport + @kybernesis/arp-registry + @kybernesis/arp-audit
 * into a single `ArpAgent` surface. These types are the public contract of
 * that surface. They do NOT leak DIDComm, Cedar-WASM, or SQLite internals —
 * adapter authors should only need to touch what lives here.
 *
 * See `docs/ARP-installation-and-hosting.md §8` for the five integration
 * points (`check`, `egress`, `onIncoming`, `audit`, `on(...)`).
 */

import type { ConnectionToken, Obligation } from '@kybernesis/arp-spec';
import type { DidCommMessage, MessageMeta } from '@kybernesis/arp-transport';
import type { ConnectionRecord } from '@kybernesis/arp-registry';
import type { PdpDecision } from '@kybernesis/arp-pdp';

export type { Obligation, ConnectionToken, HandoffBundle } from '@kybernesis/arp-spec';
export type { PdpDecision } from '@kybernesis/arp-pdp';

/** Resource description handed to `agent.check()` — mirrors @kybernesis/arp-pdp's `Entity`. */
export interface Resource {
  type: string;
  id: string;
  attrs?: Record<string, unknown>;
  parents?: Array<{ type: string; id: string }>;
}

/** Inbound task surfaced to the developer's `onIncoming` handler. */
export interface InboundTask {
  /** Action string (mapped from DIDComm body / type). */
  action: string;
  /** Resource the peer is trying to act on. */
  resource: Resource;
  /** Free-form context the peer attached (already sanitised by the runtime). */
  context: Record<string, unknown>;
  /** Raw DIDComm body — useful when the action/resource mapping is too coarse. */
  body: Record<string, unknown>;
  /** DIDComm message id (useful for idempotency). */
  messageId: string;
  /** Optional thread id (multi-turn flows). */
  threadId: string | null;
}

export interface InboundContext {
  /** The connection the task arrived over. */
  connectionId: string;
  /** Peer agent DID (already signature-verified by the transport). */
  peerDid: string;
  /** PDP decision the runtime already computed for this message. */
  decision: {
    decision: 'allow' | 'deny';
    obligations: Obligation[];
    policiesFired: string[];
  };
  /** Per-connection memory bucket (scoped, isolated). */
  memory: {
    get(key: string): unknown | null;
    set(key: string, value: unknown): void;
  };
  /** Raw Connection Token — do not mutate; read-only. */
  connection: ConnectionToken;
  /** The raw DIDComm message. */
  message: DidCommMessage;
  meta: MessageMeta;
}

/** What the developer's `onIncoming` handler returns. */
export interface InboundReply {
  /** Reply body. Will go through egress filtering before leaving the runtime. */
  body?: Record<string, unknown>;
  /** Optional custom DIDComm reply type. */
  replyType?: string;
}

export type InboundHandler = (
  task: InboundTask,
  ctx: InboundContext,
) => Promise<InboundReply | void> | InboundReply | void;

/* -------------------- integration-point arg shapes --------------------- */

export interface CheckInput {
  action: string;
  resource: Resource;
  context?: Record<string, unknown>;
  /** Connection this check runs under. Required — scopes the policy set. */
  connectionId: string;
  /** Optional override for the principal entity passed to Cedar. */
  principal?: { type: string; id: string; attrs?: Record<string, unknown> };
}

export interface EgressInput {
  data: unknown;
  connectionId: string;
  /** Obligations to enforce. Defaults to the connection's static obligations. */
  obligations?: Obligation[];
}

export interface AuditEventInput {
  /** Connection this event belongs to. */
  connectionId: string;
  /** Message id. Use a stable id if you want dedup-friendly entries. */
  messageId?: string;
  /** Decision string — `allow`, `deny`, or a custom marker like `tool_call`. */
  decision?: 'allow' | 'deny' | string;
  /** Policies that fired (if any). */
  policiesFired?: string[];
  /** Obligations applied (if any). */
  obligations?: Obligation[];
  /** Free-text reason for this event. */
  reason?: string;
  /** Arbitrary structured metadata. */
  metadata?: Record<string, unknown>;
}

/* ------------------ lifecycle events surfaced via `on()` ---------------- */

export interface RevocationEvent {
  connectionId: string;
  reason: string;
  at: number;
}

export interface RotationEvent {
  /** DID whose keys rotated. */
  did: string;
  at: number;
}

export interface PairingEvent {
  connectionId: string;
  peerDid: string;
  at: number;
}

export type ArpAgentEvent = 'revocation' | 'rotation' | 'pairing';

export type ArpAgentEventPayload<T extends ArpAgentEvent> = T extends 'revocation'
  ? RevocationEvent
  : T extends 'rotation'
    ? RotationEvent
    : T extends 'pairing'
      ? PairingEvent
      : never;

/* ----------------------- agent-factory options ------------------------- */

export interface ArpAgentOptions {
  /**
   * Handler for inbound peer messages. The SDK only calls this after the PDP
   * has already approved the request — you never need to run the check
   * yourself on the inbound path.
   */
  onIncoming?: InboundHandler;

  /**
   * Directory for SQLite databases + JSONL audit files. Defaults to
   * `./.arp-data` relative to process cwd. The directory is created on
   * first boot.
   */
  dataDir?: string;

  /** Bind hostname (default `127.0.0.1`). */
  host?: string;

  /** Admin-token gate for `/admin/*` routes. Disabled when unset. */
  adminToken?: string;

  /** Display name for the agent card. */
  agentName?: string;
  /** Description for the agent card. */
  agentDescription?: string;
  /** Scope catalog version — defaults to `v1`. */
  scopeCatalogVersion?: string;

  /**
   * When embedding the SDK inside a larger server the caller may supply a
   * custom transport resolver (for tests), or a custom fetch impl.
   * Production agents normally rely on the built-in resolver shipped in
   * `@kybernesis/arp-resolver`.
   */
  transportResolver?: import('@kybernesis/arp-transport').TransportResolver;
  transportFetch?: typeof fetch;

  /**
   * Inject a pre-loaded private key (raw 32 bytes). When unset the SDK uses
   * the bootstrap path: if `dataDir/keys/private.key` exists it is reused,
   * otherwise a new keypair is generated and committed there. The SDK
   * refuses to boot if the derived public key does not match
   * `handoff.public_key_multibase` — identical invariant to the sidecar.
   */
  privateKey?: Uint8Array;

  /** Clock injection (tests). */
  now?: () => number;
}

/* ---------------------- sub-APIs the agent exposes ---------------------- */

export interface ConnectionAPI {
  list(): Promise<ConnectionRecord[]>;
  get(id: string): Promise<ConnectionRecord | null>;
  revoke(id: string, reason?: string): Promise<void>;
  suspend(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  /** Seed a connection from an already-verified token (test + admin flows). */
  add(token: ConnectionToken, tokenJws?: string): Promise<ConnectionRecord>;
}

export interface RegistryReadAPI {
  /** Returns the active connection by id, or null. */
  get(id: string): Promise<ConnectionRecord | null>;
  /** Lists connections (including revoked/expired when `includeExpired=true`). */
  list(opts?: { includeExpired?: boolean }): Promise<ConnectionRecord[]>;
}

export interface PdpAPI {
  check(input: CheckInput): Promise<PdpDecision>;
}
