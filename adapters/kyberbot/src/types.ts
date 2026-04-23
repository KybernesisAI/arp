/**
 * Minimal structural interface describing the KyberBot surface this adapter
 * depends on.
 *
 * KyberBot is a public agent framework but does not expose a small,
 * stable, library-style npm package at the exact name `kyberbot` at the
 * time this adapter was authored. Rather than fork the framework (explicitly
 * forbidden by Phase-6 Rule 2), the adapter depends on a structural type —
 * anything that implements this interface works, whether it's the real
 * KyberBot build or a test fake.
 *
 * The interface is a deliberately narrow projection of KyberBot's public
 * plugin + messaging API, focused only on the extension points the adapter
 * needs. See README.md for the list of KyberBot public-API calls this maps
 * to.
 */

export interface KyberBotLike {
  /** Stable identifier; echoed into ARP audit for traceability. */
  readonly id: string;

  /**
   * Called by the adapter at startup. Register an inbound-message handler
   * that dispatches peer requests into ARP's PDP + onIncoming pipeline.
   */
  onMessage(handler: KyberBotMessageHandler): void;

  /**
   * Called by the adapter to guard every outbound tool invocation. KyberBot
   * calls `toolMiddleware(ctx, next)` before running any tool; the adapter
   * uses this to insert a PDP check.
   */
  useToolMiddleware(middleware: KyberBotToolMiddleware): void;

  /**
   * Called by the adapter to register an egress filter applied to every
   * outbound response before it leaves the bot.
   */
  useResponseFilter(filter: KyberBotResponseFilter): void;

  /**
   * KyberBot's logger — the adapter pipes ARP audit events through here so
   * operators see a single unified log stream.
   */
  log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void;

  /**
   * Start the bot once all hooks have been registered.
   */
  start(): Promise<void>;

  /** Graceful shutdown. */
  stop(): Promise<void>;
}

export interface KyberBotMessage {
  /** Stable message id. */
  id: string;
  /** Peer DID (or other peer identifier if KyberBot didn't originate it from ARP). */
  from: string;
  /** ARP connection id pulled out of the message envelope, if present. */
  connectionId?: string;
  /** Action / intent KyberBot parsed out of the message. */
  action: string;
  /** Resource reference. */
  resource?: { type: string; id: string; attrs?: Record<string, unknown> };
  /** Free-form body. */
  body: Record<string, unknown>;
}

export interface KyberBotMessageReply {
  body: Record<string, unknown>;
}

export type KyberBotMessageHandler = (
  msg: KyberBotMessage,
) => Promise<KyberBotMessageReply | void>;

export interface KyberBotToolContext {
  connectionId: string;
  toolName: string;
  args: Record<string, unknown>;
  /** Free-form context the tool caller attached. */
  meta?: Record<string, unknown>;
}

export type KyberBotToolMiddleware = (
  ctx: KyberBotToolContext,
  next: () => Promise<unknown>,
) => Promise<unknown>;

export interface KyberBotResponseContext {
  connectionId: string;
  messageId: string;
}

export type KyberBotResponseFilter = (
  data: unknown,
  ctx: KyberBotResponseContext,
) => Promise<unknown> | unknown;
