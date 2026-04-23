import type {
  HermesAgentLike,
  HermesEgress,
  HermesEgressContext,
  HermesPeerMessage,
  HermesPeerMessageHandler,
  HermesToolContext,
  HermesToolMiddleware,
} from '../../src/types.js';

export class FakeHermesAgent implements HermesAgentLike {
  public readonly id = 'fake-hermes';
  public readonly events: Array<{ event: string; payload: unknown }> = [];
  public started = false;

  private toolMw: HermesToolMiddleware[] = [];
  private peerHandlers: HermesPeerMessageHandler[] = [];
  private egressFns: HermesEgress[] = [];

  useToolMiddleware(mw: HermesToolMiddleware) {
    this.toolMw.push(mw);
  }
  onPeerMessage(handler: HermesPeerMessageHandler) {
    this.peerHandlers.push(handler);
  }
  useEgress(fn: HermesEgress) {
    this.egressFns.push(fn);
  }
  async start() {
    this.started = true;
  }
  async stop() {
    this.started = false;
  }
  emit(event: string, payload: Record<string, unknown>) {
    this.events.push({ event, payload });
  }

  async callTool(ctx: HermesToolContext, run: () => Promise<unknown>) {
    const chain = [...this.toolMw];
    const invoke = async (i: number): Promise<unknown> => {
      if (i >= chain.length) return run();
      const mw = chain[i]!;
      return mw(ctx, () => invoke(i + 1));
    };
    return invoke(0);
  }

  async firePeerMessage(msg: HermesPeerMessage) {
    for (const h of this.peerHandlers) {
      const r = await h(msg);
      if (r) return r;
    }
    return null;
  }

  async runEgress(data: unknown, ctx: HermesEgressContext) {
    let cur = data;
    for (const fn of this.egressFns) {
      cur = await fn(cur, ctx);
    }
    return cur;
  }
}
