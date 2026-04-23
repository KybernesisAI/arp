# Migrating a LangGraph workflow to ARP

## Before

```ts
const graph = new StateGraph(State)
  .addNode('plan', plan)
  .addNode('act', act)
  .addEdge(START, 'plan')
  .addEdge('plan', 'act')
  .addEdge('act', END)
  .compile();
```

## After

```ts
const graph = new StateGraph(State)
  .addNode('plan', plan)
  .addNode('guard', arpNode({ agent }))
  .addNode('act', act)
  .addNode('deny', denyHandler)
  .addEdge(START, 'plan')
  .addEdge('plan', 'guard')
  .addConditionalEdges('guard', arpRouter(), { allow: 'act', deny: 'deny' })
  .addEdge('act', END)
  .addEdge('deny', END)
  .compile();
```

## What ARP adds

- One extra node (the ARP guard).
- One extra edge condition (`arpRouter`).
- PDP gate runs before any downstream `act` nodes.
- Obligations captured in state so `arpEgressNode` can filter final results.

## What doesn't change

- **No prompt or model changes.**
- **No graph semantics.** The guard is a node like any other — tooling, tracing, LangSmith all continue to work.
- **No LangGraph fork.** Public `StateGraph` / `Annotation` API only.

## FAQ

**Can I inline the guard into an existing node instead of adding a new one?**
Yes — the adapter also exports `agent.check()` directly. For reviewability most teams prefer the explicit guard node; it shows up on LangSmith traces and keeps the PDP policy surface visible.

**What happens on deny?**
The graph routes to whatever node you bound to `arpRouter()`'s `'deny'` key. Typical pattern: a node that logs the denial, fires `agent.audit(...)`, and emits a structured "I can't do that" response.

**Obligations?**
The guard writes obligations into `state.arp_obligations`. Add an `arpEgressNode` before your terminal edge to have them applied automatically to a chosen result field.
