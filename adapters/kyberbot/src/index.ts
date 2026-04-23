/**
 * @kybernesis/arp-adapter-kyberbot
 *
 * Drop-in ARP adapter for the KyberBot agent framework. Per Phase-6 Rule 2,
 * the adapter only uses KyberBot's documented public extension points —
 * never patches internals. See `README.md` for the exact mapping from this
 * adapter's `KyberBotLike` structural type to KyberBot's public API.
 *
 * Usage:
 *
 *     import { KyberBot } from 'kyberbot';
 *     import { withArp } from '@kybernesis/arp-adapter-kyberbot';
 *
 *     const bot = withArp(new KyberBot({ ... }), {
 *       handoff: './arp-handoff.json',
 *       dataDir: './.arp-data',
 *     });
 *     await bot.start();
 */

import { ArpAgent, guardAction, type ArpAgentOptions, type InboundHandler } from '@kybernesis/arp-sdk';
import type { HandoffBundle } from '@kybernesis/arp-spec';
import type {
  KyberBotLike,
  KyberBotMessage,
  KyberBotMessageReply,
  KyberBotResponseContext,
  KyberBotToolContext,
} from './types.js';

export type {
  KyberBotLike,
  KyberBotMessage,
  KyberBotMessageHandler,
  KyberBotMessageReply,
  KyberBotResponseContext,
  KyberBotResponseFilter,
  KyberBotToolContext,
  KyberBotToolMiddleware,
} from './types.js';

export interface KyberBotAdapterOptions
  extends Omit<ArpAgentOptions, 'onIncoming'> {
  /**
   * Path to the handoff.json (or a parsed HandoffBundle). Required unless
   * you inject `agent` directly.
   */
  handoff?: HandoffBundle | string | Record<string, unknown>;
  /**
   * Inject a pre-built ArpAgent (tests, embedded use cases). When provided,
   * `handoff` is ignored and the adapter skips bootstrapping.
   */
  agent?: ArpAgent;
  /**
   * Port the SDK agent listens on. Defaults to 4500.
   */
  port?: number;
  /**
   * Map a KyberBot tool call → an ARP action/resource. When omitted the
   * adapter uses `action = toolName`, `resource = { type: 'Tool', id: toolName }`.
   */
  toolMapping?: (ctx: KyberBotToolContext) => {
    action: string;
    resource: { type: string; id: string; attrs?: Record<string, unknown> };
    context?: Record<string, unknown>;
  };
  /**
   * Extract the ARP connection id from a KyberBot message. Defaults to
   * `msg.connectionId` when present, else `msg.body.connection_id`.
   */
  resolveConnectionId?: (msg: KyberBotMessage) => string | null;
  /**
   * Called after the PDP denies a tool call. Return value replaces the
   * tool's result. Defaults to `{ error: 'denied_by_arp', reason }`.
   */
  onToolDenied?: (
    ctx: KyberBotToolContext,
    reason: string,
  ) => unknown;
}

export interface ArpWrappedBot<B extends KyberBotLike> {
  bot: B;
  agent: ArpAgent;
  /** Start both the ARP runtime and the bot. */
  start(): Promise<void>;
  /** Graceful shutdown — stops the bot first, then the ARP runtime. */
  stop(graceMs?: number): Promise<void>;
}

/**
 * Wrap a KyberBot instance with ARP.
 *
 * Registers three hooks on the bot:
 *   1. `onMessage` — inbound peer tasks go through `agent.check()` and then
 *      the developer-supplied handler (passed via the bot's own config, or
 *      directly when registered after wrap time).
 *   2. `useToolMiddleware` — every outbound tool call runs through
 *      `guardAction()` (check → run → egress → audit).
 *   3. `useResponseFilter` — raw replies go through `agent.egress()` so
 *      static Connection Token obligations still apply.
 */
export function withArp<B extends KyberBotLike>(
  bot: B,
  options: KyberBotAdapterOptions,
): ArpWrappedBot<B> {
  const wrapped: { agent: ArpAgent | null } = { agent: null };
  const pendingInbound: InboundHandler[] = [];

  async function ensureAgent(): Promise<ArpAgent> {
    if (wrapped.agent) return wrapped.agent;
    if (options.agent) {
      wrapped.agent = options.agent;
    } else {
      if (!options.handoff) {
        throw new Error(
          '@kybernesis/arp-adapter-kyberbot: options.handoff or options.agent is required',
        );
      }
      const { agent: _agent, handoff: _handoff, port: _port, toolMapping: _tm, resolveConnectionId: _rc, onToolDenied: _od, ...rest } = options;
      void _agent; void _handoff; void _port; void _tm; void _rc; void _od;
      wrapped.agent = await ArpAgent.fromHandoff(options.handoff, rest);
    }
    for (const h of pendingInbound) wrapped.agent.onIncoming(h);
    pendingInbound.length = 0;
    return wrapped.agent;
  }

  const toolMapping =
    options.toolMapping ??
    ((ctx) => ({
      action: ctx.toolName,
      resource: { type: 'Tool', id: ctx.toolName },
      context: ctx.args,
    }));

  const resolveConnectionId =
    options.resolveConnectionId ??
    ((msg: KyberBotMessage): string | null => {
      if (msg.connectionId) return msg.connectionId;
      const raw = (msg.body?.['connection_id'] ?? null) as unknown;
      return typeof raw === 'string' ? raw : null;
    });

  const onToolDenied =
    options.onToolDenied ??
    ((_ctx: KyberBotToolContext, reason: string) => ({
      error: 'denied_by_arp',
      reason,
    }));

  // 1. Inbound message handler.
  bot.onMessage(async (msg) => {
    const agent = await ensureAgent();
    const connectionId = resolveConnectionId(msg);
    if (!connectionId) {
      bot.log('warn', 'kyberbot-adapter: message without connection_id; skipping ARP', { id: msg.id });
      return { body: { error: 'missing_connection_id' } } satisfies KyberBotMessageReply;
    }
    const result = await guardAction(agent, {
      connectionId,
      action: msg.action,
      resource: msg.resource ?? { type: 'Message', id: msg.id },
      context: msg.body,
      run: async () => {
        // KyberBot itself handles the business logic; the adapter's job is
        // just to gate it. We return a placeholder; downstream handlers
        // (registered on the bot before `withArp`) can produce the actual
        // response.
        return { kind: 'allowed', connection_id: connectionId };
      },
    });
    if (!result.allow) {
      return { body: { error: 'denied_by_arp', reason: result.reason } };
    }
    return { body: (result.data as Record<string, unknown>) ?? {} };
  });

  // 2. Tool-call middleware.
  bot.useToolMiddleware(async (ctx, next) => {
    const agent = await ensureAgent();
    const mapping = toolMapping(ctx);
    const result = await guardAction(agent, {
      connectionId: ctx.connectionId,
      action: mapping.action,
      resource: mapping.resource,
      ...(mapping.context !== undefined ? { context: mapping.context } : {}),
      run: () => next(),
    });
    if (!result.allow) return onToolDenied(ctx, result.reason);
    return result.data;
  });

  // 3. Response egress filter.
  bot.useResponseFilter(async (data: unknown, ctx: KyberBotResponseContext) => {
    const agent = await ensureAgent();
    return agent.egress({ data, connectionId: ctx.connectionId });
  });

  return {
    bot,
    get agent() {
      if (!wrapped.agent) {
        throw new Error(
          '@kybernesis/arp-adapter-kyberbot: agent is only available after start()',
        );
      }
      return wrapped.agent;
    },
    async start() {
      const agent = await ensureAgent();
      const port = options.port ?? 4500;
      await agent.start({ port });
      await bot.start();
    },
    async stop(graceMs = 5000) {
      try {
        await bot.stop();
      } finally {
        if (wrapped.agent) {
          await wrapped.agent.stop({ graceMs });
        }
      }
    },
  };
}

/**
 * Re-expose the SDK's `ArpAgent.fromHandoff` for users who want to hold the
 * agent directly (e.g. to wire KyberBot's own health endpoints into the ARP
 * runtime).
 */
export { ArpAgent } from '@kybernesis/arp-sdk';
