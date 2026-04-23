/**
 * @kybernesis/arp-adapter-langgraph
 *
 * Drop-in LangGraph integration: a graph node factory that calls ARP's PDP
 * before letting the graph advance, plus an allow/deny router edge helper.
 *
 * Uses only the public LangGraph API (`StateGraph`, `addNode`, `addEdge`,
 * `addConditionalEdges`); never touches internals (Phase-6 Rule 2).
 *
 * Typical wiring:
 *
 *     import { StateGraph } from '@langchain/langgraph';
 *     import { arpNode, arpRouter } from '@kybernesis/arp-adapter-langgraph';
 *
 *     const graph = new StateGraph(SchemaZ)
 *       .addNode('plan', plan)
 *       .addNode('arp_guard', arpNode({ agent, resolve }))
 *       .addNode('act', act)
 *       .addNode('deny', deny)
 *       .addEdge('plan', 'arp_guard')
 *       .addConditionalEdges('arp_guard', arpRouter(), {
 *         allow: 'act',
 *         deny: 'deny',
 *       })
 *       .compile();
 */

import {
  ArpAgent,
  guardAction,
  type ArpAgentOptions,
  type Obligation,
  type Resource,
} from '@kybernesis/arp-sdk';
import type { HandoffBundle } from '@kybernesis/arp-spec';

/**
 * Minimal state-shape the `arpNode` reads from and writes into. Consumers
 * are free to extend — the node merges its output with whatever other
 * state the graph carries.
 */
export interface ArpNodeStateFragment {
  /** ARP connection id the current run belongs to. */
  arp_connection_id?: string;
  /** Pending action the graph wants to take. */
  arp_pending_action?: {
    action: string;
    resource: Resource;
    context?: Record<string, unknown>;
  };
  /** Filled in by the node. */
  arp_decision?: 'allow' | 'deny';
  arp_reason?: string;
  arp_obligations?: Obligation[];
}

export interface ArpNodeOptions {
  /** Pre-built ArpAgent (preferred when the caller owns the agent lifecycle). */
  agent?: ArpAgent;
  /**
   * Alternatively, the adapter can bootstrap its own agent from a handoff
   * bundle. This is useful for one-off notebooks / scripts.
   */
  handoff?: HandoffBundle | string | Record<string, unknown>;
  /** Options forwarded to ArpAgent.fromHandoff if used. */
  agentOptions?: Omit<ArpAgentOptions, 'onIncoming'>;
  /**
   * Pull the action/resource/context + connection id out of the graph
   * state. When omitted the node reads from `ArpNodeStateFragment`.
   */
  resolve?: (state: Record<string, unknown>) => {
    connectionId: string;
    action: string;
    resource: Resource;
    context?: Record<string, unknown>;
  } | null;
  /**
   * Audit each decision. Default `true`.
   */
  audit?: boolean;
}

/** LangGraph-compatible node signature — `async (state) => statePatch`. */
export type ArpGraphNode<S extends Record<string, unknown>> = (
  state: S,
) => Promise<Partial<S> & ArpNodeStateFragment>;

/**
 * Create a graph node that calls `agent.check()` on whatever pending
 * action the state carries. On allow, attaches `arp_decision: 'allow'`
 * plus the merged obligations. On deny, attaches `arp_decision: 'deny'`
 * and `arp_reason`.
 *
 * Pair with `arpRouter()` on a conditional edge to branch the graph.
 */
export function arpNode<S extends Record<string, unknown>>(
  opts: ArpNodeOptions,
): ArpGraphNode<S> {
  const audit = opts.audit !== false;
  let agentHolder: ArpAgent | null = opts.agent ?? null;

  const defaultResolve = (state: Record<string, unknown>) => {
    const connectionId = typeof state['arp_connection_id'] === 'string'
      ? (state['arp_connection_id'] as string)
      : null;
    const pending = state['arp_pending_action'] as
      | { action: string; resource: Resource; context?: Record<string, unknown> }
      | undefined;
    if (!connectionId || !pending) return null;
    return {
      connectionId,
      action: pending.action,
      resource: pending.resource,
      ...(pending.context !== undefined ? { context: pending.context } : {}),
    };
  };

  const resolve = opts.resolve ?? defaultResolve;

  async function ensureAgent(): Promise<ArpAgent> {
    if (agentHolder) return agentHolder;
    if (!opts.handoff) {
      throw new Error(
        '@kybernesis/arp-adapter-langgraph: arpNode needs either an `agent` or a `handoff`',
      );
    }
    agentHolder = await ArpAgent.fromHandoff(opts.handoff, opts.agentOptions ?? {});
    return agentHolder;
  }

  return async (state: S) => {
    const agent = await ensureAgent();
    const req = resolve(state);
    if (!req) {
      return {
        arp_decision: 'deny',
        arp_reason: 'missing_pending_action',
      } as Partial<S> & ArpNodeStateFragment;
    }
    const result = await guardAction(agent, {
      connectionId: req.connectionId,
      action: req.action,
      resource: req.resource,
      ...(req.context !== undefined ? { context: req.context } : {}),
      audit,
      // LangGraph nodes don't "run" a framework tool here — the next node
      // in the graph does. The SDK's guardAction only needs to know
      // "would the real run be allowed"; we give it a no-op runner.
      run: async () => null,
    });

    if (!result.allow) {
      return {
        arp_decision: 'deny',
        arp_reason: result.reason,
      } as Partial<S> & ArpNodeStateFragment;
    }
    return {
      arp_decision: 'allow',
      arp_obligations: result.obligations,
    } as Partial<S> & ArpNodeStateFragment;
  };
}

/**
 * LangGraph edge router — returns `'allow'` or `'deny'` based on the
 * `arp_decision` field the node set. Map the result onto your downstream
 * nodes via `addConditionalEdges('arp_guard', arpRouter(), { allow: ..., deny: ... })`.
 */
export function arpRouter(): (
  state: Record<string, unknown>,
) => 'allow' | 'deny' {
  return (state) => (state['arp_decision'] === 'allow' ? 'allow' : 'deny');
}

/**
 * Convenience: apply the current obligations to whatever a downstream node
 * produced. Usable as another LangGraph node between `act` and `finalize`.
 */
export function arpEgressNode<S extends Record<string, unknown>>(
  opts: { agent?: ArpAgent; dataField: keyof S & string },
): ArpGraphNode<S> {
  return async (state: S) => {
    const connectionId = typeof state['arp_connection_id'] === 'string'
      ? (state['arp_connection_id'] as string)
      : null;
    if (!connectionId || !opts.agent) return {};
    const raw = state[opts.dataField];
    const obligations = (state['arp_obligations'] as Obligation[] | undefined) ?? undefined;
    const egressOpts: {
      data: unknown;
      connectionId: string;
      obligations?: Obligation[];
    } = { data: raw, connectionId };
    if (obligations) egressOpts.obligations = obligations;
    const filtered = await opts.agent.egress(egressOpts);
    return { [opts.dataField]: filtered } as Partial<S>;
  };
}

export { ArpAgent } from '@kybernesis/arp-sdk';
