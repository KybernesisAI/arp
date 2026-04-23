/**
 * Public Hermes-Agent extension surface consumed by this adapter.
 *
 * Hermes-Agent is an agent runtime that exposes an event-emitter-plus-
 * middleware style extension API. We depend only on the public surface,
 * typed below as a structural interface so the adapter is framework-
 * version-independent and never forks Hermes-Agent internals (Phase-6
 * Rule 2).
 *
 * If your Hermes-Agent build exposes a different public shape, file an
 * upstream issue.
 */

export interface HermesAgentLike {
  /** Unique agent id; echoed in ARP audit. */
  readonly id: string;

  /** Register a middleware that wraps every outbound tool call. */
  useToolMiddleware(mw: HermesToolMiddleware): void;

  /** Register a handler for inbound DIDComm-origin (or other peer) messages. */
  onPeerMessage(handler: HermesPeerMessageHandler): void;

  /** Register an egress transformer applied before any reply leaves the agent. */
  useEgress(fn: HermesEgress): void;

  /** Lifecycle. */
  start(): Promise<void>;
  stop(): Promise<void>;

  /** Structured emit — the adapter pipes ARP audit here. */
  emit(event: string, payload: Record<string, unknown>): void;
}

export interface HermesToolContext {
  connectionId: string;
  toolName: string;
  args: Record<string, unknown>;
  /** Agent-id scoping — set by Hermes-Agent if running multi-agent. */
  agentInstanceId?: string;
}

export type HermesToolMiddleware = (
  ctx: HermesToolContext,
  next: () => Promise<unknown>,
) => Promise<unknown>;

export interface HermesPeerMessage {
  id: string;
  from: string;
  connectionId?: string;
  action: string;
  resource?: { type: string; id: string; attrs?: Record<string, unknown> };
  body: Record<string, unknown>;
}

export interface HermesPeerReply {
  body: Record<string, unknown>;
}

export type HermesPeerMessageHandler = (
  msg: HermesPeerMessage,
) => Promise<HermesPeerReply | void>;

export interface HermesEgressContext {
  connectionId: string;
  messageId?: string;
}

export type HermesEgress = (
  data: unknown,
  ctx: HermesEgressContext,
) => Promise<unknown> | unknown;
