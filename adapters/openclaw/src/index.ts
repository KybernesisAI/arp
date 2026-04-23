/**
 * @kybernesis/arp-adapter-openclaw
 *
 * Drop-in ARP adapter for OpenClaw, implemented as an OpenClaw plugin.
 * Never forks OpenClaw internals (Phase-6 Rule 2). All hooks are
 * registered via OpenClaw's public `use(plugin)` API.
 *
 * Usage:
 *
 *     import { OpenClaw } from 'openclaw';
 *     import { arpPlugin } from '@kybernesis/arp-adapter-openclaw';
 *
 *     const agent = new OpenClaw({ ... })
 *       .use(arpPlugin({ handoff: './arp-handoff.json' }));
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
  OpenClawAction,
  OpenClawActionContext,
  OpenClawActionDecision,
  OpenClawInboundMessage,
  OpenClawInboundReply,
  OpenClawPlugin,
} from './types.js';

export type {
  OpenClawAction,
  OpenClawActionContext,
  OpenClawActionDecision,
  OpenClawInboundMessage,
  OpenClawInboundReply,
  OpenClawLike,
  OpenClawPlugin,
} from './types.js';

export interface OpenClawArpOptions
  extends Omit<ArpAgentOptions, 'onIncoming'> {
  handoff?: HandoffBundle | string | Record<string, unknown>;
  /** Inject a pre-built ArpAgent (tests). */
  agent?: ArpAgent;
  /** Port the runtime listens on. Default 4500. */
  port?: number;
  /** Map OpenClaw action → ARP action/resource. */
  actionMapping?: (
    action: OpenClawAction,
    ctx: OpenClawActionContext,
  ) => { action: string; resource: Resource; context?: Record<string, unknown> };
}

export interface ArpOpenClawPlugin extends OpenClawPlugin {
  /** Always `arp`. */
  readonly name: 'arp';
  /** The ArpAgent — populated after `install()`. */
  agent(): ArpAgent;
  /**
   * Bind the underlying HTTP runtime on the configured port. Idempotent —
   * safe to call from `agent.start()` or from the plugin's own boot path.
   * OpenClaw operators should call this once when the framework is
   * booting peer-agent connectivity (inbound DIDComm). Adapters that only
   * use ARP for outbound check/egress may skip it.
   */
  listen(): Promise<void>;
  /** Graceful shutdown of the ARP runtime. Safe to call more than once. */
  shutdown(graceMs?: number): Promise<void>;
}

/**
 * Create an OpenClaw plugin that speaks ARP.
 */
export function arpPlugin(options: OpenClawArpOptions): ArpOpenClawPlugin {
  let agent: ArpAgent | null = options.agent ?? null;
  let started = false;
  const port = options.port ?? 4500;

  const actionMapping =
    options.actionMapping ??
    ((action: OpenClawAction): { action: string; resource: Resource; context?: Record<string, unknown> } => ({
      action: action.name,
      resource: { type: 'Action', id: action.name },
      context: action.args,
    }));

  async function ensureAgent(): Promise<ArpAgent> {
    if (agent) return agent;
    if (!options.handoff) {
      throw new Error(
        '@kybernesis/arp-adapter-openclaw: options.handoff or options.agent is required',
      );
    }
    const { agent: _a, handoff: _h, port: _p, actionMapping: _am, ...rest } = options;
    void _a; void _h; void _p; void _am;
    agent = await ArpAgent.fromHandoff(options.handoff, rest);
    return agent;
  }

  return {
    name: 'arp',
    agent() {
      if (!agent) {
        throw new Error('@kybernesis/arp-adapter-openclaw: agent not started');
      }
      return agent;
    },

    async install(client) {
      const a = await ensureAgent();
      client.logger.info('arp adapter installed', { did: a.did });
    },

    async listen() {
      const a = await ensureAgent();
      if (started) return;
      await a.start({ port });
      started = true;
    },

    async beforeAction(ctx: OpenClawActionContext): Promise<OpenClawActionDecision> {
      const a = await ensureAgent();
      const connectionId = ctx.connectionId;
      if (!connectionId) {
        // Actions without an ARP connection are out of scope; let them run.
        // Most operators will configure OpenClaw to always carry a
        // connection id, so this path is diagnostic-only.
        return { allow: true };
      }
      const mapping = actionMapping(ctx.action, ctx);
      const decision = await a.check({
        connectionId,
        action: mapping.action,
        resource: mapping.resource,
        ...(mapping.context !== undefined ? { context: mapping.context } : {}),
      });
      if (decision.decision !== 'allow') {
        return {
          allow: false,
          reason: decision.reasons.join('; ') || 'policy_denied',
        };
      }
      return { allow: true };
    },

    async afterAction(ctx, result) {
      const a = await ensureAgent();
      if (!ctx.connectionId) return result;
      return a.egress({ data: result, connectionId: ctx.connectionId });
    },

    async onInboundMessage(msg: OpenClawInboundMessage): Promise<OpenClawInboundReply | null> {
      const a = await ensureAgent();
      if (!msg.connectionId) return null;
      const res = await guardAction(a, {
        connectionId: msg.connectionId,
        action: msg.action,
        resource: msg.resource ?? { type: 'Message', id: msg.id },
        context: msg.body,
        run: async () => ({ ok: true, action: msg.action }),
      });
      if (!res.allow) {
        return { body: { error: 'denied_by_arp', reason: res.reason } };
      }
      return { body: (res.data as Record<string, unknown>) ?? { ok: true } };
    },

    async shutdown(graceMs = 5000) {
      if (agent && started) {
        await agent.stop({ graceMs });
        started = false;
      }
    },
  };
}

export { ArpAgent } from '@kybernesis/arp-sdk';
