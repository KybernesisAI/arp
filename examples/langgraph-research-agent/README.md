# examples/langgraph-research-agent

A research-flavoured LangGraph that reads Project Alpha with ARP enforcing:

- `summarize` is permitted only under an active ARP connection
- `redact_fields` obligations strip internal working notes from the final response

The graph plans → guards → acts → filters. The `guard` node is `arpNode`; the `filter` node is `arpEgressNode`. Both use the adapter's public API only.

See `../../adapters/langgraph/MIGRATION.md` and the LangGraph integration test in `../../adapters/langgraph/tests/graph.integration.test.ts`.

Full conformance coverage: `tests/phase-6/adapter-conformance.test.ts`.
