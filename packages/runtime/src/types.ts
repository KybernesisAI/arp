import type { ConnectionToken, DidDocument } from '@kybernesis/arp-spec';
import type { DidCommMessage, MessageMeta } from '@kybernesis/arp-transport';
import type { Entity } from '@kybernesis/arp-pdp';

export interface RuntimeConfig {
  /** Agent DID — e.g. `did:web:samantha.agent`. */
  did: string;
  /** Principal DID controlling the agent. */
  principalDid: string;
  /** Public key multibase. Goes straight into the DID doc. */
  publicKeyMultibase: string;
  /** URLs served at each well-known path. */
  wellKnownUrls: {
    didcomm: string;
    agentCard: string;
    arpJson: string;
    /** Optional: URL of the owner's revocation list. Proxied when set. */
    revocationsUrl?: string;
  };
  /** Agent display name (for the agent card). */
  agentName: string;
  /** Agent description (for the agent card). */
  agentDescription: string;
  /** Representation VC URL. */
  representationVcUrl: string;
  /** Scope catalog version (pinned at pairing). */
  scopeCatalogVersion: string;
  /** TLS cert SHA-256 fingerprint, lowercase hex. Published in DID doc hint. */
  tlsFingerprint: string;
}

/** Input into the custom request handler that runs on an allowed message. */
export interface DispatchInput {
  message: DidCommMessage;
  meta: MessageMeta;
  connection: ConnectionToken;
  connectionId: string;
  decision: {
    decision: 'allow' | 'deny';
    obligations: Array<{ type: string; params: Record<string, unknown> }>;
    policies_fired: string[];
  };
  memory: {
    set(key: string, value: unknown): void;
    get(key: string): unknown | null;
  };
}

/** What the runtime's request handler returns — optional reply body. */
export interface DispatchResult {
  reply?: Record<string, unknown>;
  replyType?: string;
}

/** Custom application logic plugged in by the reference binary / downstream
 *  agents. Keep it pure: all side effects the runtime cares about flow
 *  through the memory + registry APIs we expose. */
export type DispatchHandler = (input: DispatchInput) => Promise<DispatchResult>;

/** Turn a DIDComm body into a PDP Entity/action/resource triple. Runtime
 *  defaults to a reasonable mapping (action = body.action or msg.type suffix,
 *  resource = body.resource string split as "<type>:<id>"). Agents may
 *  override for richer schemas. */
export type RequestMapper = (msg: DidCommMessage) => MappedRequest;

export interface MappedRequest {
  action: string;
  resource: Entity;
  context?: Record<string, unknown>;
}

export type { DidDocument };
