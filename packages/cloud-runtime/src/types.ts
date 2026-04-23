/**
 * Types consumed by the cloud runtime.
 */

import type { Obligation } from '@kybernesis/arp-spec';

export interface CloudRuntimeLogger {
  info(data: Record<string, unknown>, msg?: string): void;
  warn(data: Record<string, unknown>, msg?: string): void;
  error(data: Record<string, unknown>, msg?: string): void;
  debug(data: Record<string, unknown>, msg?: string): void;
  child(bindings: Record<string, unknown>): CloudRuntimeLogger;
}

export interface TenantMetrics {
  /** Records one inbound message. */
  inbound(tenantId: string): void;
  /** Records one outbound message. */
  outbound(tenantId: string): void;
  /** Records PDP latency in ms. */
  pdpLatency(tenantId: string, ms: number): void;
  /** Increments a named counter. */
  incr(name: string, tenantId: string, by?: number): void;
}

export interface AgentSessionHandle {
  /** Agent DID. */
  did: string;
  /** Tenant DID this agent belongs to. */
  tenantId: string;
  /** Session id (matches `agents.ws_session_id`). */
  sessionId: string;
  /** Send a message to the outbound client. Resolves once the client acks. */
  send(event: WsServerEvent): Promise<void>;
  /** Close the WS connection (used on revocation / tenant suspension). */
  close(code?: number, reason?: string): Promise<void>;
  /** True when the underlying socket is still open. */
  isOpen(): boolean;
  /** Epoch ms the session opened. */
  openedAt: number;
}

/** Messages pushed from the cloud over the WebSocket. */
export type WsServerEvent =
  | {
      kind: 'inbound_message';
      /** Unique message row id in the cloud db. */
      messageId: string;
      /** DIDComm msg id. */
      msgId: string;
      /** DIDComm type URI. */
      msgType: string;
      /** Raw signed envelope (compact JWS). */
      envelope: string;
      /** Connection id (if known). */
      connectionId: string | null;
      /** Peer DID. */
      peerDid: string | null;
      /** PDP decision already evaluated by the cloud. */
      decision: 'allow' | 'deny';
      /** Effective obligations (token + dynamic). */
      obligations: Obligation[];
      /** Policies that fired. */
      policiesFired: string[];
    }
  | {
      kind: 'server_hello';
      agentDid: string;
      serverTime: number;
      queuedCount: number;
    }
  | {
      kind: 'ping';
      nonce: string;
    }
  | {
      kind: 'revocation';
      connectionId: string;
      reason: string;
    };

/** Messages received from the outbound client. */
export type WsClientEvent =
  | {
      kind: 'client_hello';
      agentDid: string;
      clientVersion: string;
    }
  | {
      kind: 'ack';
      messageId: string;
    }
  | {
      kind: 'outbound_envelope';
      /** msg_id of the outbound DIDComm message (client-generated). */
      msgId: string;
      msgType: string;
      peerDid: string;
      /** Compact JWS envelope — the client signed it locally before sending. */
      envelope: string;
      /** Optional connection id. */
      connectionId: string | null;
    }
  | {
      kind: 'pong';
      nonce: string;
    };

/** Minimal well-known doc bundle needed to respond to HTTP /.well-known/*. */
export interface AgentWellKnown {
  did: string;
  didDocumentJson: string;
  agentCardJson: string;
  arpJson: string;
  revocationsJson: string;
}
