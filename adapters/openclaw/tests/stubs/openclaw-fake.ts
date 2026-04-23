import type {
  OpenClawActionContext,
  OpenClawInboundMessage,
  OpenClawInboundReply,
  OpenClawLike,
  OpenClawPlugin,
} from '../../src/types.js';

/** Minimal plugin-host fake for OpenClaw. Runs the plugin pipeline. */
export class FakeOpenClaw implements OpenClawLike {
  public readonly logger = {
    entries: [] as Array<{ level: string; msg: string; meta?: unknown }>,
    info: (msg: string, meta?: Record<string, unknown>) =>
      this.logger.entries.push({ level: 'info', msg, ...(meta ? { meta } : {}) }),
    warn: (msg: string, meta?: Record<string, unknown>) =>
      this.logger.entries.push({ level: 'warn', msg, ...(meta ? { meta } : {}) }),
    error: (msg: string, meta?: Record<string, unknown>) =>
      this.logger.entries.push({ level: 'error', msg, ...(meta ? { meta } : {}) }),
  };
  public started = false;
  public plugins: OpenClawPlugin[] = [];

  use(plugin: OpenClawPlugin): this {
    this.plugins.push(plugin);
    if (plugin.install) {
      void plugin.install(this);
    }
    return this;
  }
  async start() {
    for (const p of this.plugins) {
      if (p.install) await p.install(this);
    }
    this.started = true;
  }
  async stop() {
    this.started = false;
  }

  /** Fire the action pipeline — beforeAction → run → afterAction. */
  async runAction(
    ctx: OpenClawActionContext,
    run: () => Promise<unknown>,
  ): Promise<{ allow: boolean; reason?: string; result?: unknown }> {
    for (const p of this.plugins) {
      if (!p.beforeAction) continue;
      const d = await p.beforeAction(ctx);
      if (!d.allow) return { allow: false, reason: d.reason ?? 'denied' };
    }
    let result = await run();
    for (const p of this.plugins) {
      if (!p.afterAction) continue;
      result = await p.afterAction(ctx, result);
    }
    return { allow: true, result };
  }

  async fireInbound(msg: OpenClawInboundMessage): Promise<OpenClawInboundReply | null> {
    for (const p of this.plugins) {
      if (!p.onInboundMessage) continue;
      const r = await p.onInboundMessage(msg);
      if (r) return r;
    }
    return null;
  }
}
