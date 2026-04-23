import type {
  NanoClawLike,
  NanoInboundHandler,
  NanoInboundMessage,
  NanoToolContext,
  NanoToolWrapper,
} from '../../src/index.js';

export class FakeNanoClaw implements NanoClawLike {
  public readonly id = 'fake-nano';
  public started = false;
  private wrappers: NanoToolWrapper[] = [];
  private inbound: NanoInboundHandler[] = [];

  registerToolWrapper(wrap: NanoToolWrapper) {
    this.wrappers.push(wrap);
  }
  onInbound(handler: NanoInboundHandler) {
    this.inbound.push(handler);
  }
  async start() {
    this.started = true;
  }
  async stop() {
    this.started = false;
  }

  async runTool(ctx: NanoToolContext, run: (a: Record<string, unknown>) => Promise<unknown>) {
    if (this.wrappers.length === 0) return run(ctx.args);
    // Chain wrappers like middleware.
    const chain = [...this.wrappers];
    const invoke = async (i: number, a: Record<string, unknown>): Promise<unknown> => {
      if (i >= chain.length) return run(a);
      const w = chain[i]!;
      return w(ctx, (args: Record<string, unknown>) => invoke(i + 1, args));
    };
    return invoke(0, ctx.args);
  }

  async fireInbound(msg: NanoInboundMessage) {
    for (const h of this.inbound) {
      const r = await h(msg);
      if (r) return r;
    }
    return null;
  }
}
