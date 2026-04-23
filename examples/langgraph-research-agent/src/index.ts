/**
 * examples/langgraph-research-agent
 *
 * "Research a project alpha, but only during business hours and only
 * return summaries." Demonstrates how arpNode + arpRouter + arpEgressNode
 * compose inside a real LangGraph StateGraph.
 *
 * This file compiles under `pnpm typecheck` and exports `buildResearchGraph`
 * for programmatic use. It does NOT execute by default — the LLM / tool
 * nodes in a real deployment would be the caller's responsibility.
 */

import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import type { ArpAgent } from '@kybernesis/arp-sdk';
import {
  arpEgressNode,
  arpNode,
  arpRouter,
} from '@kybernesis/arp-adapter-langgraph';

export function buildResearchGraph(agent: ArpAgent) {
  const State = Annotation.Root({
    arp_connection_id: Annotation<string>(),
    arp_pending_action: Annotation<{
      action: string;
      resource: { type: string; id: string; attrs?: Record<string, unknown> };
      context?: Record<string, unknown>;
    }>(),
    arp_decision: Annotation<'allow' | 'deny' | undefined>(),
    arp_reason: Annotation<string | undefined>(),
    arp_obligations: Annotation<Array<{ type: string; params: Record<string, unknown> }> | undefined>(),
    result: Annotation<unknown>(),
  });

  return new StateGraph(State)
    .addNode('plan', async (state) => ({
      arp_pending_action: {
        action: 'summarize',
        resource: { type: 'Project', id: 'alpha' },
        context: {
          time: new Date().toISOString(),
          purpose: state.arp_pending_action?.context?.['purpose'] ?? 'research',
        },
      },
    }))
    .addNode('guard', arpNode({ agent }))
    .addNode('act', async () => ({
      result: {
        summary: 'Project alpha is on track. Key risks: headcount, runway.',
        raw_notes: 'REDACT_ME — internal working notes',
      },
    }))
    .addNode(
      'filter',
      arpEgressNode<{
        arp_connection_id: string;
        arp_obligations?: Array<{ type: string; params: Record<string, unknown> }>;
        result: unknown;
      }>({ agent, dataField: 'result' }),
    )
    .addNode('deny', async (state) => ({
      result: {
        error: 'denied_by_arp',
        reason: state.arp_reason ?? 'unknown',
      },
    }))
    .addEdge(START, 'plan')
    .addEdge('plan', 'guard')
    .addConditionalEdges('guard', arpRouter(), {
      allow: 'act',
      deny: 'deny',
    })
    .addEdge('act', 'filter')
    .addEdge('filter', END)
    .addEdge('deny', END)
    .compile();
}
