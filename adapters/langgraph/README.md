# @kybernesis/arp-adapter-langgraph

ARP adapter for [LangGraph](https://langchain-ai.github.io/langgraphjs/).

Drops an **`arpNode`** into any `StateGraph` that gates the next transition
through the ARP PDP, and an **`arpRouter()`** conditional-edge helper that
branches on the result.

## Install

```bash
pnpm add @kybernesis/arp-adapter-langgraph @kybernesis/arp-sdk @langchain/langgraph
```

`@langchain/langgraph` is a **peer dependency** — bring whatever version
your project uses.

## Usage

```ts
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { ArpAgent } from '@kybernesis/arp-sdk';
import { arpNode, arpRouter, arpEgressNode } from '@kybernesis/arp-adapter-langgraph';

const agent = await ArpAgent.fromHandoff('./arp-handoff.json');
await agent.start();

const State = Annotation.Root({
  arp_connection_id: Annotation<string>(),
  arp_pending_action: Annotation<{ action: string; resource: any }>(),
  arp_decision: Annotation<'allow' | 'deny' | undefined>(),
  arp_reason: Annotation<string | undefined>(),
  arp_obligations: Annotation<any[] | undefined>(),
  result: Annotation<unknown>(),
});

const graph = new StateGraph(State)
  .addNode('plan', planNode)
  .addNode('guard', arpNode({ agent }))
  .addNode('act', actNode)
  .addNode('deny', denyNode)
  .addNode('filter', arpEgressNode({ agent, dataField: 'result' }))
  .addEdge(START, 'plan')
  .addEdge('plan', 'guard')
  .addConditionalEdges('guard', arpRouter(), { allow: 'act', deny: 'deny' })
  .addEdge('act', 'filter')
  .addEdge('filter', END)
  .addEdge('deny', END)
  .compile();
```

## How it works

- `arpNode({ agent })` reads `state.arp_connection_id` and `state.arp_pending_action`, calls `agent.check()`, and writes `state.arp_decision` / `state.arp_reason` / `state.arp_obligations`.
- `arpRouter()` returns `'allow'` / `'deny'` — plug into `addConditionalEdges`.
- `arpEgressNode({ agent, dataField })` applies the accumulated obligations to the named state field before the graph terminates.

## Custom resolvers

If your graph state doesn't use the default field names, pass `resolve`:

```ts
arpNode({
  agent,
  resolve: (state) => ({
    connectionId: state.conn_id,
    action: state.intent.verb,
    resource: { type: 'Project', id: state.intent.project },
    context: state.intent.context,
  }),
});
```

## Framework access

`@langchain/langgraph` is a real public package — the adapter uses only its
documented `StateGraph` / `Annotation` API and never touches internals
(Phase-6 Rule 2). Integration test in `tests/graph.integration.test.ts`
wires a real `StateGraph` through the adapter end-to-end.

See [`MIGRATION.md`](./MIGRATION.md).
