# ARP Phase 6 — SDKs + Framework Adapters

**Reader:** Claude Code. Directives only.

**Companion docs:** `ARP-phase-0-roadmap.md`, `ARP-phase-2-runtime-core.md`, `ARP-installation-and-hosting.md`, `ARP-adapter-authoring-guide.md`, `ARP-adapter-skill.md`.

---

## 0. Reader orientation

**Phase goal:** ship developer-facing libraries so agent developers never need to learn ARP primitives. Two SDKs (TypeScript, Python) and adapters for the five must-ship frameworks: **OpenClaw, Hermes-Agent, NanoClaw, KyberBot, LangGraph**. CrewAI + MCP adapters are stretch goals for this phase; they can slip to v1.1 without blocking launch.

**Tech pins:**
- TS SDK: same repo, `@kybernesis/arp-sdk`
- Python SDK: separate repo `arp-sdk-python`, published to PyPI
- Framework adapters: per-framework npm packages (TS) or PyPI packages (Python)
- Each adapter must be ≤1000 lines
- Every adapter passes the full Phase 5 testkit audit when wired up
- For each framework, read its plugin / middleware / extension-point docs first; use its idiomatic extension surface, never fork its internals

**Out of scope:** Rust / Go SDKs (v0.2+), UI kit for custom consent flows (Phase 4 owner-app covers the default).

---

## 1. Definition of done

**Must ship for v1 (phase cannot complete without these):**
- [ ] `@kybernesis/arp-sdk` (TS) published — implements the 5 integration points from `ARP-installation-and-hosting.md §8`
- [ ] `arp-sdk` (Python) — same API surface
- [ ] `@kybernesis/arp-adapter-kyberbot` — drop-in for KyberBot using its plugin system
- [ ] `@kybernesis/arp-adapter-openclaw` — drop-in for OpenClaw using its public plugin / middleware API
- [ ] `@kybernesis/arp-adapter-hermes-agent` — drop-in for Hermes-Agent
- [ ] `@kybernesis/arp-adapter-nanoclaw` — drop-in for NanoClaw
- [ ] `@kybernesis/arp-adapter-langgraph` — graph node + helper
- [ ] Each of the 5 required adapters has a working example in `examples/` running against Phase 5 reference agents
- [ ] Each required adapter passes `@kybernesis/arp-testkit audit` when serving a full agent
- [ ] Migration doc per required adapter: "no ARP" → "with ARP"

**Stretch (ship if time allows; otherwise defer to v1.1):**
- [ ] `@kybernesis/arp-adapter-crewai` — crew-level wrapper (Python)
- [ ] `@kybernesis/arp-adapter-mcp` — wraps any MCP server as ARP-guarded

Stretch adapters are not blocking. If either lags, tag the phase complete on the required five and open tracking issues for the rest.

---

## 2. Prerequisites

- Phases 1–5 complete
- Access to working reference installs of: KyberBot, OpenClaw, Hermes-Agent, NanoClaw, LangGraph. If a framework is closed-source, obtain an evaluation license or a hosted test account before starting the corresponding task.
- Public plugin / middleware docs for each framework. If the docs are thin, allocate extra time in the task estimate.

---

## 3. Repository additions

```
arp/
├── packages/
│   └── sdk/                       # @kybernesis/arp-sdk (TS)
│       ├── src/
│       ├── tests/
│       └── README.md
├── adapters/
│   ├── kyberbot/                  # @kybernesis/arp-adapter-kyberbot          (required)
│   ├── openclaw/                  # @kybernesis/arp-adapter-openclaw          (required)
│   ├── hermes-agent/              # @kybernesis/arp-adapter-hermes-agent      (required)
│   ├── nanoclaw/                  # @kybernesis/arp-adapter-nanoclaw          (required)
│   ├── langgraph/                 # @kybernesis/arp-adapter-langgraph         (required)
│   └── mcp/                       # @kybernesis/arp-adapter-mcp               (stretch)
├── examples/
│   ├── kyberbot-atlas/
│   ├── openclaw-demo/
│   ├── hermes-demo/
│   ├── nanoclaw-demo/
│   ├── langgraph-research-agent/
│   └── mcp-guarded-server/        # stretch
```

Separate Python repo (`arp-sdk-python`) hosts:
```
arp-sdk-python/
├── arp_sdk/
├── arp_adapter_crewai/
├── examples/
├── pyproject.toml
└── README.md
```

---

## 4. Implementation tasks

### Task 1 — `@kybernesis/arp-sdk` (TS)

Public API:

```ts
export class ArpAgent {
  static async fromHandoff(handoff: HandoffBundle, options: ArpAgentOptions): Promise<ArpAgent>;

  // Start listening for inbound messages
  start(opts: { port?: number }): Promise<void>;

  // The 5 integration points:
  check(req: { action: string; resource: Resource; context?: object; connectionId: string }): Promise<PdpDecision>;
  egress(req: { data: unknown; connectionId: string; obligations?: Obligation[] }): Promise<unknown>;
  onIncoming(handler: (task: InboundTask, ctx: InboundContext) => Promise<unknown>): void;
  audit(event: AuditEvent): Promise<void>;
  on(event: 'revocation' | 'rotation' | 'pairing', handler: (payload: any) => void): void;

  // Introspection
  readonly did: string;
  readonly connections: ConnectionAPI;
  readonly registry: RegistryReadAPI;
  readonly pdp: PdpAPI;
}
```

Internally wraps `@kybernesis/arp-runtime`, `@kybernesis/arp-registry`, `@kybernesis/arp-pdp`, `@kybernesis/arp-transport`. Presents a high-level API — developers shouldn't need to know about Cedar, DIDComm, or Connection Tokens in normal use.

**Acceptance:** build a minimal agent in ≤20 lines using the SDK; pair with `ghost.agent`; exchange messages; pass testkit audit.

### Task 2 — Python `arp-sdk`

Mirror the TS API surface 1:1 in idiomatic Python:

```python
from arp_sdk import ArpAgent

agent = await ArpAgent.from_handoff("./handoff.json",
    on_incoming=lambda task, ctx: handle(task, ctx))
await agent.start(port=443)

decision = await agent.check(action="read", resource=res, connection_id=conn)
if decision.allow:
    ...
```

Implementation: use `pycedarpolicy` if available; else ship a small Cedar WASM binding via `wasmtime-py`. Transport via `py-didcomm-messaging`. SQLite via `aiosqlite`.

**Acceptance:** Python example agent pairs + messages with TS `samantha.agent`; testkit green.

### Task 3 — `@kybernesis/arp-adapter-kyberbot` *(required)*

Integrates with the KyberBot agent framework. Reads `~/<kyberbot-agent>/config/arp-handoff.json` and wires up the runtime.

Public API:
```ts
import { KyberBot } from 'kyberbot';
import { withArp } from '@kybernesis/arp-adapter-kyberbot';

const bot = withArp(new KyberBot(/* normal config */), {
  handoff: '/path/to/arp-handoff.json',
});
await bot.start();
```

Behavior:
1. Intercepts inbound messaging channels; routes ARP-origin messages through PDP first
2. Intercepts outbound tool calls; `check` is called before any tool runs
3. Egresses responses through the PDP's obligation pipeline
4. Maps KyberBot's internal permission model to ARP scopes

**Acceptance:** Atlas example in `examples/kyberbot-atlas/` boots, pairs, receives a scoped request, returns a redacted response, all via standard KyberBot idioms.

### Task 4 — `@kybernesis/arp-adapter-openclaw` *(required)*

Integrates with the OpenClaw agent framework. Use OpenClaw's public plugin / middleware API — do not fork.

Expected public API (refine to match OpenClaw's actual extension idioms):
```ts
import { OpenClaw } from 'openclaw';
import { arpPlugin } from '@kybernesis/arp-adapter-openclaw';

const agent = new OpenClaw(/* normal config */)
  .use(arpPlugin({ handoff: './arp-handoff.json' }));
await agent.start();
```

Behavior (mirrors KyberBot adapter, adapted to OpenClaw's extension points):
1. Registers a pre-action hook for every outbound tool/action → `agent.check`
2. Registers a post-action hook for egress → obligation pipeline
3. Registers an inbound-message handler that terminates DIDComm messages into OpenClaw's task queue
4. Surfaces ARP audit events through OpenClaw's logging / observability
5. If OpenClaw has a native permission model, maps its concepts to ARP scopes bidirectionally

Implementation notes:
- Read OpenClaw's plugin docs first; pick the most stable extension surface
- If OpenClaw's hooks are sync-only, wrap the async PDP call with a bounded waiter (5s default, configurable)
- Never patch OpenClaw internals; if the public API is insufficient, open an upstream issue and document the workaround

**Acceptance:** `examples/openclaw-demo/` — a minimal OpenClaw agent configured with the adapter; pairs with `ghost.agent`; receives a scoped task; returns a response filtered through obligations; passes full `@kybernesis/arp-testkit` audit.

### Task 5 — `@kybernesis/arp-adapter-hermes-agent` *(required)*

Integrates with the Hermes-Agent framework.

Expected public API (refine to match Hermes-Agent's actual extension idioms):
```ts
import { HermesAgent } from 'hermes-agent';
import { withArp } from '@kybernesis/arp-adapter-hermes-agent';

const agent = withArp(new HermesAgent(/* normal config */), {
  handoff: './arp-handoff.json',
});
await agent.start();
```

Behavior: identical intent to the OpenClaw adapter, realized through whatever extension surface Hermes-Agent provides (middleware, decorators, hooks, event emitters — pick the most idiomatic and the most stable).

Implementation notes:
- If Hermes-Agent's architecture is agent-per-process, the adapter registers at process boot
- If it's multi-agent-per-process, the adapter must scope all state by agent ID to avoid cross-agent leaks through shared adapter instances
- Treat any concurrency in Hermes-Agent carefully — multiple simultaneous PDP checks must not share mutable context

**Acceptance:** `examples/hermes-demo/` — Hermes-Agent configured with the adapter; same acceptance bar as OpenClaw (pair, scoped request, obligations, testkit green).

### Task 6 — `@kybernesis/arp-adapter-nanoclaw` *(required)*

Integrates with the NanoClaw agent framework. NanoClaw is the smaller / lighter variant; the adapter must be proportionally lightweight (≤500 lines, no additional runtime deps beyond `@kybernesis/arp-sdk`).

Expected public API:
```ts
import { NanoClaw } from 'nanoclaw';
import { withArp } from '@kybernesis/arp-adapter-nanoclaw';

const agent = withArp(new NanoClaw(/* config */), {
  handoff: './arp-handoff.json',
});
await agent.run();
```

Behavior: same integration points as the others, but optimized for NanoClaw's constrained footprint:
- No in-process SQLite; if NanoClaw runs in environments without filesystem access, the adapter defers persistence to a remote registry (cloud mode) or in-memory-only with a warning
- Single-file bundle output (tsup bundle format) for easy drop-in to NanoClaw projects
- Detailed README noting any NanoClaw features not yet supported (if any)

**Acceptance:** `examples/nanoclaw-demo/` — NanoClaw with the adapter running on a constrained target (document which targets were tested); passes full testkit audit; bundle size ≤100 KB gzipped.

### Task 7 — `@kybernesis/arp-adapter-langgraph` *(required)*

Public API:
```ts
import { StateGraph } from '@langchain/langgraph';
import { arpNode } from '@kybernesis/arp-adapter-langgraph';

const graph = new StateGraph(...)
  .addNode('arp_guard', arpNode({ handoff }))
  .addEdge('plan', 'arp_guard')
  .addEdge('arp_guard', 'act')      // allowed path
  .addEdge('arp_guard', 'deny')     // denied path
  .compile();
```

`arpNode` behavior:
- Reads pending action from graph state
- Calls `agent.check()` with action, resource, context
- On allow: passes through, attaches obligations to state for downstream redaction
- On deny: routes to the deny edge with a reason

**Acceptance:** `examples/langgraph-research-agent/` — an agent that reads Project Alpha, with ARP enforcing "read-only, during business hours, summaries only."

### Task 8 — `arp-adapter-crewai` (Python) *(stretch)*

Public API:
```python
from crewai import Agent, Crew
from arp_adapter_crewai import ArpGuardedAgent

crew = Crew(agents=[
    ArpGuardedAgent(
        role="Researcher",
        handoff="./arp-handoff.json",
        goal="...",
    ),
])
```

`ArpGuardedAgent`:
- Subclasses CrewAI's Agent
- Wraps every tool invocation with an ARP check
- Passes ARP audit events to CrewAI's logging

**Acceptance:** research-crew example runs; every tool call is audited.

*Skip if time pressure; defer to v1.1. Do not block the phase on this.*

### Task 9 — `@kybernesis/arp-adapter-mcp` *(stretch)*

Wraps any MCP server such that tool invocations require ARP permission.

Public API:
```ts
import { createServer } from '@modelcontextprotocol/sdk/server';
import { withArp } from '@kybernesis/arp-adapter-mcp';

const mcp = createServer(/* your MCP config */);
const guardedMcp = withArp(mcp, { handoff: './handoff.json' });
await guardedMcp.start();
```

Behavior: every MCP `tool.call` passes through `agent.check`; allowed calls execute; denied calls return an error to the MCP client.

**Acceptance:** `examples/mcp-guarded-server/` — a simple MCP server exposing `search` and `write_file`; testkit shows `search` allowed under bundle X, `write_file` blocked.

*Skip if time pressure; defer to v1.1. Do not block the phase on this.*

### Task 10 — Migration docs

For each shipped adapter (required + stretch if completed), a `MIGRATION.md`:
1. "Before" — existing agent code
2. "After" — same code with adapter
3. What ARP does vs. what it doesn't (no LLM changes, no prompt changes)
4. FAQ: will my tools still work? yes. will it slow things down? <5ms per PDP check. can I debug? yes, here's how.

### Task 11 — Adapter conformance test

`tests/phase-6/adapter-conformance.test.ts`:

For each required adapter (5 total), stand up the reference example, point it at the Phase 5 reference agents, run the full testkit. Must return 8/8 green.

If stretch adapters shipped, include them too; if not, skip their entries and leave a TODO comment pointing at the tracking issue.

**Acceptance:** all 5 required adapters green. Stretch adapters green if shipped.

### Task 12 — `@kybernesis/arp-create-adapter` CLI (community on-ramp)

Ship the scaffolding CLI so third-party developers can author conformance-passing adapters for frameworks we don't cover.

Package: `@kybernesis/arp-create-adapter`
Invocation: `npx @kybernesis/arp-create-adapter --framework <slug> --language ts|python --out <path>`

Behavior:
1. Copies a canonical adapter template into `<path>`
2. Substitutes framework name, slug, and ARP spec version into templates
3. Scaffolds `src/`, `tests/`, `examples/minimal-agent/`, `MIGRATION.md`, `README.md`, `package.json` with the `arp` metadata block
4. Pre-wires the conformance test importing from `@kybernesis/arp-testkit`
5. Prints next-steps guidance referencing `ARP-adapter-authoring-guide.md`

Implementation:
- TS CLI using `commander`, templates rendered with `handlebars`
- Templates live in `packages/create-adapter/templates/ts/` and `.../python/`
- Publishes to npm under `@kybernesis/arp-create-adapter`

**Acceptance:** running the generator in a scratch dir produces a buildable skeleton; `pnpm install && pnpm build && pnpm test` on the generated project all pass (tests are stubs but conformance test skeleton is valid).

### Task 13 — Ship the adapter authoring skill

Copy `ARP-adapter-skill.md` (from the Samantha design folder) into the public docs repo under `docs/skills/arp-adapter/SKILL.md`. Verify the frontmatter is valid Claude Code skill format and the body references `ARP-adapter-authoring-guide.md` at a stable public URL.

Also publish the authoring guide itself to `arp.spec/docs/adapter-authoring-guide`.

**Acceptance:** a fresh Claude Code session, with the skill installed, correctly triggers on "create an ARP adapter for <framework>" and walks through the steps in the skill.

---

## 5. Acceptance tests

```bash
pnpm install
pnpm -r build
pnpm -r test
pnpm --filter tests/phase-6 test

# Python:
cd arp-sdk-python
uv sync
uv run pytest
```

---

## 6. Deliverables

- `@kybernesis/arp-sdk` + `arp-sdk` (Python)
- Five required adapters: KyberBot, OpenClaw, Hermes-Agent, NanoClaw, LangGraph
- Two stretch adapters if completed: CrewAI, MCP
- Working example agent per shipped adapter
- Migration docs per shipped adapter
- `@kybernesis/arp-create-adapter` CLI for third-party adapter authoring
- ARP adapter authoring skill published for Claude Code users
- Authoring guide live on `arp.spec`

---

## 7. Handoff to Phase 7 / 8 / 9

- Phase 7 (ARP Cloud) can use the SDK as its outbound client library
- Phase 8 (Mobile) uses the SDK's admin API contract for its backend calls
- Phase 9 (Launch) markets the adapter list as "ARP-ready frameworks"

---

## 8. v0 decisions (do not reopen)

- TS + Python only in v0
- **Required adapters for v1: OpenClaw, Hermes-Agent, NanoClaw, KyberBot, LangGraph.** Phase cannot complete without all five.
- CrewAI + MCP adapters are stretch; may slip to v1.1 without blocking Phase 6 completion
- Adapters must not fork framework source; they wrap public APIs only
- Every adapter ≤1000 lines (NanoClaw adapter ≤500 lines)
- When a framework's public API is insufficient, open an upstream issue and document the workaround; do not monkey-patch internals

---

## 9. Common pitfalls

- **Framework internals change.** Pin adapter dependencies to known-good versions; update deliberately.
- **Python async story is messy.** Use `asyncio` consistently; don't mix sync and async across boundaries.
- **MCP tool schemas vary.** The adapter must handle tools with arbitrary argument shapes without breaking.
- **Adapter examples must not leak secrets.** Review `examples/` carefully; use `.env.example` placeholders.
