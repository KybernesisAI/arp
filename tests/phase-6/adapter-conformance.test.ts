/**
 * Phase-6 adapter conformance.
 *
 * For each required adapter (KyberBot, OpenClaw, Hermes-Agent, NanoClaw,
 * LangGraph), we:
 *   1. Instantiate the adapter against a framework-shaped test double.
 *   2. Boot an ArpAgent (HTTP server + seeded connection).
 *   3. Run `@kybernesis/arp-testkit` runAudit → assert 8/8 pass.
 *   4. Exercise the adapter's main-line behaviour (tool allow + obligation
 *      redaction, tool deny, inbound peer gate).
 *
 * Per Phase-6 Rule 6, no live frameworks are installed or reached over
 * the network. LangGraph uses its real public npm package; the others
 * use structural-type fakes that match the adapter's `*Like` interface.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { END, START, StateGraph, Annotation } from '@langchain/langgraph';
import { runAudit } from '@kybernesis/arp-testkit';
import { withArp as withArpKyberbot } from '@kybernesis/arp-adapter-kyberbot';
import { arpPlugin } from '@kybernesis/arp-adapter-openclaw';
import { withArp as withArpHermes } from '@kybernesis/arp-adapter-hermes-agent';
import {
  arpGuardedTool,
  withArp as withArpNano,
} from '@kybernesis/arp-adapter-nanoclaw';
import { arpNode, arpRouter } from '@kybernesis/arp-adapter-langgraph';
import { buildExampleAgent, type BuiltAgent } from './helpers/build-agent.js';
import type {
  KyberBotLike,
  KyberBotMessage,
  KyberBotMessageHandler,
  KyberBotResponseContext,
  KyberBotResponseFilter,
  KyberBotToolContext,
  KyberBotToolMiddleware,
} from '@kybernesis/arp-adapter-kyberbot';
import type {
  OpenClawActionContext,
  OpenClawInboundMessage,
  OpenClawLike,
  OpenClawPlugin,
} from '@kybernesis/arp-adapter-openclaw';
import type {
  HermesAgentLike,
  HermesEgress,
  HermesPeerMessage,
  HermesPeerMessageHandler,
  HermesToolContext,
  HermesToolMiddleware,
} from '@kybernesis/arp-adapter-hermes-agent';
import type {
  NanoClawLike,
  NanoToolContext,
  NanoToolWrapper,
  NanoInboundHandler,
  NanoInboundMessage,
} from '@kybernesis/arp-adapter-nanoclaw';

/* ------------------------ framework test doubles ----------------------- */

class FakeKyberBot implements KyberBotLike {
  public readonly id = 'phase6-fake-kyberbot';
  private messageHandler: KyberBotMessageHandler | null = null;
  private toolMw: KyberBotToolMiddleware[] = [];
  private respFilter: KyberBotResponseFilter[] = [];
  onMessage(h: KyberBotMessageHandler) { this.messageHandler = h; }
  useToolMiddleware(m: KyberBotToolMiddleware) { this.toolMw.push(m); }
  useResponseFilter(f: KyberBotResponseFilter) { this.respFilter.push(f); }
  log() {}
  async start() {}
  async stop() {}
  async callTool(ctx: KyberBotToolContext, run: () => Promise<unknown>) {
    const chain = [...this.toolMw];
    const invoke = async (i: number): Promise<unknown> => {
      if (i >= chain.length) return run();
      const mw = chain[i]!;
      return mw(ctx, () => invoke(i + 1));
    };
    return invoke(0);
  }
  async fireMessage(msg: KyberBotMessage) {
    return this.messageHandler ? this.messageHandler(msg) : null;
  }
  async filterResponse(data: unknown, ctx: KyberBotResponseContext) {
    let cur = data;
    for (const f of this.respFilter) cur = await f(cur, ctx);
    return cur;
  }
}

class FakeOpenClaw implements OpenClawLike {
  public readonly logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  plugins: OpenClawPlugin[] = [];
  use(p: OpenClawPlugin) {
    this.plugins.push(p);
    if (p.install) void p.install(this);
    return this;
  }
  async start() {
    for (const p of this.plugins) if (p.install) await p.install(this);
  }
  async stop() {}
  async runAction(ctx: OpenClawActionContext, run: () => Promise<unknown>) {
    for (const p of this.plugins) {
      if (p.beforeAction) {
        const d = await p.beforeAction(ctx);
        if (!d.allow) return { allow: false, reason: d.reason };
      }
    }
    let result = await run();
    for (const p of this.plugins) {
      if (p.afterAction) result = await p.afterAction(ctx, result);
    }
    return { allow: true, result };
  }
  async fireInbound(msg: OpenClawInboundMessage) {
    for (const p of this.plugins) {
      if (p.onInboundMessage) {
        const r = await p.onInboundMessage(msg);
        if (r) return r;
      }
    }
    return null;
  }
}

class FakeHermes implements HermesAgentLike {
  public readonly id = 'phase6-fake-hermes';
  private mw: HermesToolMiddleware[] = [];
  private pm: HermesPeerMessageHandler[] = [];
  private egressFns: HermesEgress[] = [];
  useToolMiddleware(x: HermesToolMiddleware) { this.mw.push(x); }
  onPeerMessage(x: HermesPeerMessageHandler) { this.pm.push(x); }
  useEgress(x: HermesEgress) { this.egressFns.push(x); }
  emit() {}
  async start() {}
  async stop() {}
  async callTool(ctx: HermesToolContext, run: () => Promise<unknown>) {
    const chain = [...this.mw];
    const invoke = async (i: number): Promise<unknown> => {
      if (i >= chain.length) return run();
      return chain[i]!(ctx, () => invoke(i + 1));
    };
    return invoke(0);
  }
  async firePeer(msg: HermesPeerMessage) {
    for (const h of this.pm) {
      const r = await h(msg);
      if (r) return r;
    }
    return null;
  }
}

class FakeNano implements NanoClawLike {
  public readonly id = 'phase6-fake-nano';
  private wrappers: NanoToolWrapper[] = [];
  private inbound: NanoInboundHandler[] = [];
  registerToolWrapper(w: NanoToolWrapper) { this.wrappers.push(w); }
  onInbound(h: NanoInboundHandler) { this.inbound.push(h); }
  async start() {}
  async stop() {}
  async runTool(ctx: NanoToolContext, run: (a: Record<string, unknown>) => Promise<unknown>) {
    if (this.wrappers.length === 0) return run(ctx.args);
    const chain = [...this.wrappers];
    const invoke = async (i: number, a: Record<string, unknown>): Promise<unknown> => {
      if (i >= chain.length) return run(a);
      return chain[i]!(ctx, (args: Record<string, unknown>) => invoke(i + 1, args));
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

/* ------------------------- test infrastructure ------------------------- */

const built: BuiltAgent[] = [];

afterEach(async () => {
  while (built.length) {
    const b = built.pop();
    if (b) await b.cleanup();
  }
});

async function expectAuditPass(baseUrl: string) {
  const summary = await runAudit('localhost', baseUrl);
  // Phase 9 slice 9c: suite grew 8 → 11 (v2.1 §6 trio). Owner-scoped
  // probes skip locally because no ownerLabel / registrarSetupUrl is
  // provided; all 11 must still resolve without a fail.
  expect(summary.total).toBe(11);
  const failed = summary.probes.filter((p) => !p.pass);
  expect(failed, JSON.stringify(summary.probes, null, 2)).toHaveLength(0);
}

/* -------------------------- per-adapter tests -------------------------- */

describe('phase-6 conformance — @kybernesis/arp-adapter-kyberbot', () => {
  it('passes the full testkit audit + routes tool allow/deny via the KyberBot adapter', async () => {
    const b = await buildExampleAgent({
      slug: 'kb',
      obligations: [{ type: 'redact_fields', params: { fields: ['secret'] } }],
    });
    built.push(b);

    const bot = new FakeKyberBot();
    withArpKyberbot(bot, { agent: b.agent });

    await expectAuditPass(b.baseUrl);

    const allowed = (await bot.callTool(
      { connectionId: b.connectionId, toolName: 'search', args: { q: 'x' } },
      async () => ({ hits: ['a'], secret: 's' }),
    )) as Record<string, unknown>;
    expect(allowed.hits).toEqual(['a']);
    expect(allowed.secret).toBeUndefined();

    // Deny path — different connection, no record.
    const denied = (await bot.callTool(
      { connectionId: 'conn_unknown_phase6', toolName: 'search', args: {} },
      async () => {
        throw new Error('must not run');
      },
    )) as Record<string, unknown>;
    expect(denied.error).toBe('denied_by_arp');

    // Inbound peer message.
    const reply = (await bot.fireMessage({
      id: 'kb-m-1',
      from: b.peerDid,
      action: 'ping',
      body: { connection_id: b.connectionId },
    })) as { body: Record<string, unknown> };
    expect(reply.body.error).toBeUndefined();

    // Egress filter picks up token obligations.
    const egressed = (await bot.filterResponse(
      { ok: true, secret: 'nope' },
      { connectionId: b.connectionId, messageId: 'kb-resp-1' },
    )) as Record<string, unknown>;
    expect(egressed.secret).toBeUndefined();
  });
});

describe('phase-6 conformance — @kybernesis/arp-adapter-openclaw', () => {
  it('passes the full testkit audit + routes actions/inbound via the OpenClaw plugin', async () => {
    const b = await buildExampleAgent({
      slug: 'oc',
      obligations: [{ type: 'redact_fields', params: { fields: ['raw'] } }],
    });
    built.push(b);

    const framework = new FakeOpenClaw();
    framework.use(arpPlugin({ agent: b.agent }));
    await framework.start();

    await expectAuditPass(b.baseUrl);

    const out = await framework.runAction(
      {
        connectionId: b.connectionId,
        action: { name: 'summarize', args: { topic: 'alpha' } },
        meta: {},
      },
      async () => ({ summary: 'ok', raw: 'nope' }),
    );
    expect(out.allow).toBe(true);
    expect((out.result as Record<string, unknown>).summary).toBe('ok');
    expect((out.result as Record<string, unknown>).raw).toBeUndefined();

    const inbound = await framework.fireInbound({
      id: 'oc-m-1',
      connectionId: b.connectionId,
      action: 'ping',
      body: {},
    });
    expect(inbound?.body.error).toBeUndefined();
  });
});

describe('phase-6 conformance — @kybernesis/arp-adapter-hermes-agent', () => {
  it('passes the full testkit audit + gates tools via Hermes middleware', async () => {
    const b = await buildExampleAgent({
      slug: 'hm',
      obligations: [{ type: 'redact_fields', params: { fields: ['pii'] } }],
    });
    built.push(b);

    const hermes = new FakeHermes();
    withArpHermes(hermes, { agent: b.agent });

    await expectAuditPass(b.baseUrl);

    const out = (await hermes.callTool(
      { connectionId: b.connectionId, toolName: 'lookup', args: { q: 'x' } },
      async () => ({ hit: 'A', pii: '123' }),
    )) as Record<string, unknown>;
    expect(out.hit).toBe('A');
    expect(out.pii).toBeUndefined();

    const peer = (await hermes.firePeer({
      id: 'hm-1',
      from: b.peerDid,
      connectionId: b.connectionId,
      action: 'ping',
      body: {},
    })) as { body: Record<string, unknown> };
    expect(peer.body.error).toBeUndefined();
  });
});

describe('phase-6 conformance — @kybernesis/arp-adapter-nanoclaw', () => {
  it('passes the full testkit audit + guards plain tools + NanoClaw-like host', async () => {
    const b = await buildExampleAgent({
      slug: 'nc',
      obligations: [{ type: 'redact_fields', params: { fields: ['raw'] } }],
    });
    built.push(b);

    await expectAuditPass(b.baseUrl);

    const plainGuarded = arpGuardedTool(
      b.agent,
      { connectionId: b.connectionId, toolName: 'compute' },
      async (args: { n: number }) => ({ doubled: args.n * 2, raw: 'secret' }),
    );
    const plainOut = (await plainGuarded({ n: 4 })) as Record<string, unknown>;
    expect(plainOut.doubled).toBe(8);
    expect(plainOut.raw).toBeUndefined();

    const host = new FakeNano();
    withArpNano(host, { agent: b.agent, outboundOnly: true });

    const hostOut = (await host.runTool(
      { connectionId: b.connectionId, toolName: 'ping', args: {} },
      async () => ({ pong: true, raw: 'x' }),
    )) as Record<string, unknown>;
    expect(hostOut.pong).toBe(true);
    expect(hostOut.raw).toBeUndefined();

    const inbound = (await host.fireInbound({
      id: 'nc-m-1',
      connectionId: b.connectionId,
      action: 'ping',
      body: {},
    })) as { body: Record<string, unknown> };
    expect(inbound.body.error).toBeUndefined();
  });
});

describe('phase-6 conformance — @kybernesis/arp-adapter-langgraph', () => {
  it('passes the full testkit audit + routes allow/deny through a real StateGraph', async () => {
    const b = await buildExampleAgent({ slug: 'lg' });
    built.push(b);

    await expectAuditPass(b.baseUrl);

    const State = Annotation.Root({
      arp_connection_id: Annotation<string>(),
      arp_pending_action: Annotation<{
        action: string;
        resource: { type: string; id: string };
      }>(),
      arp_decision: Annotation<'allow' | 'deny' | undefined>(),
      arp_reason: Annotation<string | undefined>(),
      arp_obligations: Annotation<Array<{ type: string; params: Record<string, unknown> }> | undefined>(),
      path: Annotation<string[]>({
        reducer: (a, b2) => [...(a ?? []), ...(b2 ?? [])],
        default: () => [],
      }),
    });

    const graph = new StateGraph(State)
      .addNode('guard', arpNode({ agent: b.agent }))
      .addNode('act', async () => ({ path: ['act'] }))
      .addNode('deny', async () => ({ path: ['deny'] }))
      .addEdge(START, 'guard')
      .addConditionalEdges('guard', arpRouter(), {
        allow: 'act',
        deny: 'deny',
      })
      .addEdge('act', END)
      .addEdge('deny', END)
      .compile();

    const allowOut = await graph.invoke({
      arp_connection_id: b.connectionId,
      arp_pending_action: {
        action: 'summarize',
        resource: { type: 'Doc', id: 'alpha' },
      },
    });
    expect(allowOut.arp_decision).toBe('allow');
    expect(allowOut.path).toContain('act');

    const denyOut = await graph.invoke({
      arp_connection_id: 'conn_unknown_phase6',
      arp_pending_action: {
        action: 'summarize',
        resource: { type: 'Doc', id: 'beta' },
      },
    });
    expect(denyOut.arp_decision).toBe('deny');
    expect(denyOut.path).toContain('deny');
  });
});
