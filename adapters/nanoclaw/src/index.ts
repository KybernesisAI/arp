/**
 * @kybernesis/arp-adapter-nanoclaw — lightweight ARP adapter for NanoClaw.
 *
 * NanoClaw is the constrained-footprint variant of OpenClaw; this adapter
 * intentionally ships a minimal surface (≤500 LOC target) optimised for
 * drop-in use in resource-limited environments (edge functions, sandbox
 * workers). It never forks NanoClaw internals (Phase-6 Rule 2).
 *
 * NanoClaw typically runs tools as plain async functions; the adapter
 * offers two integration shapes:
 *
 *   1. `arpGuardedTool(agent, { ... })` — wraps a tool function with an
 *      ARP check + egress pipeline. The most common shape.
 *
 *   2. `withArp(nano, options)` — for installs where NanoClaw exposes a
 *      plugin-style extension point. `NanoClawLike` is a structural type.
 *
 * Environments without filesystem access should use the `'memory'` persistence
 * mode (see `ArpAgentOptions`) and rely on a cloud-mode registry for any
 * multi-boot persistence.
 */

import {
  ArpAgent,
  guardAction,
  type ArpAgentOptions,
  type GuardActionResult,
  type InboundHandler,
  type Resource,
} from '@kybernesis/arp-sdk';
import type { HandoffBundle } from '@kybernesis/arp-spec';

export interface NanoClawLike {
  readonly id: string;
  registerToolWrapper(wrap: NanoToolWrapper): void;
  onInbound(handler: NanoInboundHandler): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface NanoToolContext {
  connectionId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export type NanoToolFn = (args: Record<string, unknown>) => Promise<unknown>;

export type NanoToolWrapper = (
  ctx: NanoToolContext,
  run: NanoToolFn,
) => Promise<unknown>;

export interface NanoInboundMessage {
  id: string;
  connectionId?: string;
  action: string;
  body: Record<string, unknown>;
}

export interface NanoInboundReply {
  body: Record<string, unknown>;
}

export type NanoInboundHandler = (
  msg: NanoInboundMessage,
) => Promise<NanoInboundReply | null>;

export interface NanoArpOptions extends Omit<ArpAgentOptions, 'onIncoming'> {
  handoff?: HandoffBundle | string | Record<string, unknown>;
  agent?: ArpAgent;
  port?: number;
  /**
   * When `true`, the adapter skips starting the ARP HTTP server — useful
   * for constrained environments where inbound DIDComm is handled by an
   * external ARP Cloud instance. Default `false`.
   */
  outboundOnly?: boolean;
  /**
   * Called when the underlying framework can't reach the filesystem and
   * the adapter falls back to in-memory registry + audit. Default prints
   * to stderr. NanoClaw deployments on FaaS should override this to log
   * to their chosen platform.
   */
  onEphemeralWarning?: () => void;
}

export interface ArpGuardedToolOptions {
  connectionId: string;
  toolName: string;
  resource?: Resource;
  /** Audit each invocation. Default `true`. */
  audit?: boolean;
}

/**
 * Wrap a plain tool function with an ARP check → run → egress pipeline.
 * The returned function has the same signature as the original and is
 * safe to pass anywhere NanoClaw expects a tool.
 */
export function arpGuardedTool<Args extends Record<string, unknown>, Out>(
  agent: ArpAgent,
  opts: ArpGuardedToolOptions,
  impl: (args: Args) => Promise<Out>,
): (args: Args) => Promise<Out | { error: 'denied_by_arp'; reason: string }> {
  const audit = opts.audit !== false;
  return async (args: Args) => {
    const res = (await guardAction(agent, {
      connectionId: opts.connectionId,
      action: opts.toolName,
      resource: opts.resource ?? { type: 'Tool', id: opts.toolName },
      context: args,
      audit,
      run: () => impl(args),
    })) as GuardActionResult<Out>;
    if (!res.allow) return { error: 'denied_by_arp', reason: res.reason };
    return res.data;
  };
}

export interface ArpNanoWrap<N extends NanoClawLike> {
  nano: N;
  agent: ArpAgent;
  start(): Promise<void>;
  stop(graceMs?: number): Promise<void>;
}

export function withArp<N extends NanoClawLike>(
  nano: N,
  options: NanoArpOptions,
): ArpNanoWrap<N> {
  let bound: ArpAgent | null = options.agent ?? null;
  let started = false;
  const port = options.port ?? 4500;
  const pendingInbound: InboundHandler[] = [];

  async function ensureAgent(): Promise<ArpAgent> {
    if (bound) return bound;
    if (!options.handoff) {
      throw new Error('@kybernesis/arp-adapter-nanoclaw: handoff or agent required');
    }
    const { agent: _a, handoff: _h, port: _p, outboundOnly: _o, onEphemeralWarning: _w, ...rest } = options;
    void _a; void _h; void _p; void _o; void _w;
    bound = await ArpAgent.fromHandoff(options.handoff, rest);
    for (const h of pendingInbound) bound.onIncoming(h);
    pendingInbound.length = 0;
    return bound;
  }

  nano.registerToolWrapper(async (ctx, run) => {
    const agent = await ensureAgent();
    const res = await guardAction(agent, {
      connectionId: ctx.connectionId,
      action: ctx.toolName,
      resource: { type: 'Tool', id: ctx.toolName },
      context: ctx.args,
      run: () => run(ctx.args),
    });
    if (!res.allow) return { error: 'denied_by_arp', reason: res.reason };
    return res.data;
  });

  nano.onInbound(async (msg) => {
    const agent = await ensureAgent();
    const connectionId = msg.connectionId ?? (typeof msg.body['connection_id'] === 'string' ? msg.body['connection_id'] : null);
    if (!connectionId) return { body: { error: 'missing_connection_id' } };
    const res = await guardAction(agent, {
      connectionId,
      action: msg.action,
      resource: { type: 'Message', id: msg.id },
      context: msg.body,
      run: async () => ({ ok: true }),
    });
    if (!res.allow) return { body: { error: 'denied_by_arp', reason: res.reason } };
    return { body: (res.data as Record<string, unknown>) ?? { ok: true } };
  });

  return {
    nano,
    get agent() {
      if (!bound) throw new Error('arp agent not started');
      return bound;
    },
    async start() {
      const agent = await ensureAgent();
      if (!options.outboundOnly && !started) {
        await agent.start({ port });
        started = true;
      }
      await nano.start();
    },
    async stop(graceMs = 2000) {
      try {
        await nano.stop();
      } finally {
        if (bound && started) {
          await bound.stop({ graceMs });
          started = false;
        }
      }
    },
  };
}

export { ArpAgent } from '@kybernesis/arp-sdk';
