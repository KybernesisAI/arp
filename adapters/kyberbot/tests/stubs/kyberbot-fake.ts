/**
 * Minimal KyberBot-like test fake.
 *
 * Implements just enough of `KyberBotLike` to exercise the adapter. Real
 * KyberBot implements the same extension surface; this fake exists so the
 * adapter's glue logic is testable without installing a 55 MB framework.
 */

import type {
  KyberBotLike,
  KyberBotMessage,
  KyberBotMessageHandler,
  KyberBotResponseContext,
  KyberBotResponseFilter,
  KyberBotToolContext,
  KyberBotToolMiddleware,
} from '../../src/types.js';

export class FakeKyberBot implements KyberBotLike {
  public readonly id = 'fake-kyberbot';
  public readonly logs: Array<{ level: string; message: string; meta?: unknown }> = [];
  public started = false;
  public stopped = false;

  private messageHandler: KyberBotMessageHandler | null = null;
  private toolMiddlewares: KyberBotToolMiddleware[] = [];
  private responseFilters: KyberBotResponseFilter[] = [];

  onMessage(handler: KyberBotMessageHandler) {
    this.messageHandler = handler;
  }
  useToolMiddleware(middleware: KyberBotToolMiddleware) {
    this.toolMiddlewares.push(middleware);
  }
  useResponseFilter(filter: KyberBotResponseFilter) {
    this.responseFilters.push(filter);
  }
  log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
    this.logs.push({ level, message, ...(meta ? { meta } : {}) });
  }
  async start() {
    this.started = true;
  }
  async stop() {
    this.stopped = true;
  }

  /** Test helper: fire a message as if it came in from a peer. */
  async fireMessage(msg: KyberBotMessage) {
    if (!this.messageHandler) throw new Error('no message handler registered');
    return this.messageHandler(msg);
  }

  /** Test helper: run a tool through the middleware chain. */
  async callTool(ctx: KyberBotToolContext, runner: () => Promise<unknown>) {
    const chain = [...this.toolMiddlewares];
    const invoke = async (i: number): Promise<unknown> => {
      if (i >= chain.length) return runner();
      const mw = chain[i]!;
      return mw(ctx, () => invoke(i + 1));
    };
    return invoke(0);
  }

  /** Test helper: pipe a response through all registered filters. */
  async filterResponse(data: unknown, ctx: KyberBotResponseContext) {
    let current = data;
    for (const filter of this.responseFilters) {
      current = await filter(current, ctx);
    }
    return current;
  }
}
