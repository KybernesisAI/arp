/**
 * Public OpenClaw extension surface consumed by this adapter.
 *
 * OpenClaw exposes a plugin / middleware system for intercepting inbound
 * messages and outbound tool actions. Rather than pin against the
 * framework's internal classes (which would be a fork per Phase-6 Rule 2),
 * the adapter types the subset of the plugin interface it actually uses
 * as a structural type below. The real OpenClaw plugin API implements
 * these methods; test fakes can too.
 */

export interface OpenClawLike {
  /** Register an inbound-action pre-hook. Called for every task OpenClaw
   *  picks up off its task queue, before any tool runs. */
  use(plugin: OpenClawPlugin): this;

  /** Start the framework. */
  start(): Promise<void>;

  /** Graceful stop. */
  stop(): Promise<void>;

  /** OpenClaw's structured logger. */
  logger: {
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
  };
}

export interface OpenClawPlugin {
  /** Unique plugin id; shown in OpenClaw's diagnostics. */
  name: string;

  /**
   * Fired once when the plugin is registered. Use it to attach any
   * OpenClaw event listeners (message channel handlers, etc.).
   */
  install?(client: OpenClawLike): void | Promise<void>;

  /**
   * Pre-action hook — invoked before every tool/action. Return a
   * `{ allow: boolean, reason?: string, rewrite?: OpenClawAction }` object.
   * When `allow === false`, OpenClaw skips the action and surfaces `reason`.
   */
  beforeAction?(ctx: OpenClawActionContext): Promise<OpenClawActionDecision>;

  /**
   * Post-action hook — runs after the action produced a result, before
   * OpenClaw ships it back to the caller. Return a (possibly transformed)
   * result.
   */
  afterAction?(
    ctx: OpenClawActionContext,
    result: unknown,
  ): Promise<unknown>;

  /**
   * Inbound-message hook — invoked when a peer message arrives on
   * OpenClaw's configured channels. Return a reply body or `null` to let
   * OpenClaw's default handler run.
   */
  onInboundMessage?(msg: OpenClawInboundMessage): Promise<OpenClawInboundReply | null>;
}

export interface OpenClawAction {
  name: string;
  args: Record<string, unknown>;
}

export interface OpenClawActionContext {
  /** Current ARP connection id if OpenClaw knows one. */
  connectionId?: string;
  /** OpenClaw's own action descriptor. */
  action: OpenClawAction;
  /** Per-request metadata (tracing ids, conversation id, …). */
  meta: Record<string, unknown>;
}

export interface OpenClawActionDecision {
  allow: boolean;
  reason?: string;
  /** Optional rewrite of the action before execution (rarely used). */
  rewrite?: OpenClawAction;
}

export interface OpenClawInboundMessage {
  id: string;
  connectionId?: string;
  action: string;
  resource?: { type: string; id: string; attrs?: Record<string, unknown> };
  body: Record<string, unknown>;
}

export interface OpenClawInboundReply {
  body: Record<string, unknown>;
}
