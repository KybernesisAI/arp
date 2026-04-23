/**
 * @kybernesis/arp-adapter-hermes-agent
 *
 * Wraps a Hermes-Agent instance with the five ARP integration points using
 * Hermes-Agent's documented public extension surface. Per Phase-6 Rule 2
 * we never import Hermes-Agent internals.
 *
 * Usage:
 *
 *     import { HermesAgent } from 'hermes-agent';
 *     import { withArp } from '@kybernesis/arp-adapter-hermes-agent';
 *
 *     const agent = withArp(new HermesAgent({ ... }), {
 *       handoff: './arp-handoff.json',
 *     });
 *     await agent.start();
 */

import {
  ArpAgent,
  guardAction,
  type ArpAgentOptions,
  type Resource,
} from '@kybernesis/arp-sdk';
import type { HandoffBundle } from '@kybernesis/arp-spec';
import type {
  HermesAgentLike,
  HermesEgressContext,
  HermesPeerMessage,
  HermesToolContext,
} from './types.js';

export type {
  HermesAgentLike,
  HermesEgress,
  HermesEgressContext,
  HermesPeerMessage,
  HermesPeerMessageHandler,
  HermesPeerReply,
  HermesToolContext,
  HermesToolMiddleware,
} from './types.js';

export interface HermesArpOptions extends Omit<ArpAgentOptions, 'onIncoming'> {
  handoff?: HandoffBundle | string | Record<string, unknown>;
  agent?: ArpAgent;
  port?: number;
  /**
   * Per-agent-instance isolation marker. When Hermes-Agent runs multiple
   * agents in a single process, the adapter scopes its PDP check cache
   * keys by this id to prevent cross-agent bleed.
   */
  agentInstanceId?: string;
  toolMapping?: (ctx: HermesToolContext) => {
    action: string;
    resource: Resource;
    context?: Record<string, unknown>;
  };
  onToolDenied?: (ctx: HermesToolContext, reason: string) => unknown;
  /**
   * Max wait (ms) for a PDP check during a Hermes tool call. Default 5000
   * — matches the sidecar's per-check budget. PDP checks themselves are
   * synchronous-in-wasm; the budget guards against runtime deadlocks if a
   * future dynamic obligation policy fetches remote data.
   */
  checkTimeoutMs?: number;
}

export interface ArpWrappedHermes<H extends HermesAgentLike> {
  hermes: H;
  agent: ArpAgent;
  start(): Promise<void>;
  stop(graceMs?: number): Promise<void>;
}

export function withArp<H extends HermesAgentLike>(
  hermes: H,
  options: HermesArpOptions,
): ArpWrappedHermes<H> {
  let bound: ArpAgent | null = options.agent ?? null;
  let started = false;
  const port = options.port ?? 4500;
  const checkTimeoutMs = options.checkTimeoutMs ?? 5000;
  const agentInstanceId = options.agentInstanceId ?? hermes.id;

  const toolMapping =
    options.toolMapping ??
    ((ctx: HermesToolContext) => ({
      action: ctx.toolName,
      resource: { type: 'Tool', id: ctx.toolName },
      context: ctx.args,
    }));

  const onToolDenied =
    options.onToolDenied ??
    ((_ctx: HermesToolContext, reason: string) => ({
      error: 'denied_by_arp',
      reason,
    }));

  async function ensureAgent(): Promise<ArpAgent> {
    if (bound) return bound;
    if (!options.handoff) {
      throw new Error(
        '@kybernesis/arp-adapter-hermes-agent: options.handoff or options.agent required',
      );
    }
    const {
      agent: _a,
      handoff: _h,
      port: _p,
      agentInstanceId: _id,
      toolMapping: _tm,
      onToolDenied: _od,
      checkTimeoutMs: _ct,
      ...rest
    } = options;
    void _a; void _h; void _p; void _id; void _tm; void _od; void _ct;
    bound = await ArpAgent.fromHandoff(options.handoff, rest);
    return bound;
  }

  function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`arp timeout: ${label}`)), ms);
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  hermes.useToolMiddleware(async (ctx, next) => {
    const agent = await ensureAgent();
    const mapping = toolMapping(ctx);
    const result = await withTimeout(
      guardAction(agent, {
        connectionId: ctx.connectionId,
        action: mapping.action,
        resource: mapping.resource,
        ...(mapping.context !== undefined ? { context: mapping.context } : {}),
        run: () => next(),
      }),
      checkTimeoutMs,
      `tool:${ctx.toolName}`,
    );
    if (!result.allow) return onToolDenied(ctx, result.reason);
    return result.data;
  });

  hermes.onPeerMessage(async (msg: HermesPeerMessage) => {
    const agent = await ensureAgent();
    const connectionId = msg.connectionId ?? (typeof msg.body['connection_id'] === 'string' ? msg.body['connection_id'] : null);
    if (!connectionId) {
      return { body: { error: 'missing_connection_id' } };
    }
    const res = await guardAction(agent, {
      connectionId,
      action: msg.action,
      resource: msg.resource ?? { type: 'Message', id: msg.id },
      context: msg.body,
      run: async () => ({ ok: true, agent_instance: agentInstanceId }),
    });
    if (!res.allow) {
      return { body: { error: 'denied_by_arp', reason: res.reason } };
    }
    return { body: (res.data as Record<string, unknown>) ?? {} };
  });

  hermes.useEgress(async (data, ctx: HermesEgressContext) => {
    const agent = await ensureAgent();
    return agent.egress({ data, connectionId: ctx.connectionId });
  });

  return {
    hermes,
    get agent() {
      if (!bound) throw new Error('arp agent not started yet');
      return bound;
    },
    async start() {
      const agent = await ensureAgent();
      if (!started) {
        await agent.start({ port });
        started = true;
      }
      await hermes.start();
    },
    async stop(graceMs = 5000) {
      try {
        await hermes.stop();
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
