# ARP Adapter Authoring Guide

**Audience:** developers (human or AI agents like Claude Code) building a new ARP adapter for an agent framework that doesn't have one yet.

**Goal:** ship a conformance-passing adapter in under a day by following a template and a contract.

**Companion docs:** `ARP-architecture.md`, `ARP-installation-and-hosting.md`, `ARP-phase-6-sdks-adapters.md`, `ARP-policy-examples.md`.

---

## 1. When to build an adapter

Build one when:
- You use an agent framework not in the required five (OpenClaw, Hermes-Agent, NanoClaw, KyberBot, LangGraph)
- You want `framework-native` ARP integration — users install one package and keep writing code the way they always have
- You want automatic PDP guarding, audit logging, and obligation enforcement for all tool calls in your framework

Don't build one when:
- Your framework can already use `@kybernesis/arp-sdk` directly in <20 lines. If so, use the SDK — an adapter is only worth it when it removes friction a plain SDK call can't.
- Your "framework" is really one agent. The SDK is the right tool.
- You're wrapping an adapter for private use only. Ship your own package under your scope; don't publish to `@kybernesis/arp-*` without going through governance (§9).

---

## 2. The adapter contract

Every ARP adapter MUST:

### 2.1 Expose a canonical entry point
```ts
// TS convention
export function withArp(agent: FrameworkAgent, opts: ArpAdapterOptions): FrameworkAgent;
// or
export function arpPlugin(opts: ArpAdapterOptions): FrameworkPlugin;
```

```python
# Python convention
def with_arp(agent: FrameworkAgent, *, handoff: str, **opts) -> FrameworkAgent: ...
```

One primary export. No magic auto-bootstrapping on import. Explicit opt-in only.

### 2.2 Implement the 5 integration points

From `ARP-installation-and-hosting.md §8`:

| # | ARP call | When the adapter invokes it |
|---|---|---|
| 1 | `agent.check({ action, resource, context, connection_id })` | Before any outbound action (tool call, message send, API request) |
| 2 | `agent.egress({ data, connection_id, obligations })` | Before the agent sends data back to a peer; applies obligations |
| 3 | `agent.onIncoming(handler)` | Registers the handler for peer-originated DIDComm messages |
| 4 | `agent.audit(event)` | On any significant event (decision made, action taken, error) |
| 5 | `agent.on('revocation' | 'rotation' | 'pairing', handler)` | Reacts to lifecycle events |

All five must be wired. If a framework doesn't expose a natural hook for one, document the gap in the adapter README and open an upstream issue.

### 2.3 Use idiomatic framework extension points

- **Never** fork the framework source.
- **Never** monkey-patch framework internals.
- **Always** use the framework's public plugin / middleware / hook / decorator / event API.
- If the public API is insufficient, open an upstream issue and document the workaround in the adapter README.

### 2.4 Pass the conformance suite

Every adapter must pass the full `@kybernesis/arp-testkit` audit (`ARP-phase-5-reference-agents-testkit.md`) when wired into an agent. 8/8 green is the bar.

### 2.5 Include required metadata

`package.json` includes:
```json
{
  "name": "@kybernesis/arp-adapter-<framework>",
  "version": "0.1.0",
  "arp": {
    "specVersion": "0.1",
    "frameworkName": "<framework>",
    "frameworkVersionCompat": "^1.0.0",
    "maintainer": "<email or handle>",
    "conformanceStatus": "passing"
  }
}
```

### 2.6 Follow naming conventions

- TS: `@kybernesis/arp-adapter-<framework-slug>` (if official) or `@<yourscope>/arp-adapter-<framework-slug>` (community)
- Python: `arp-adapter-<framework-slug>` or `<yourscope>-arp-adapter-<framework-slug>`
- `<framework-slug>` is lowercase, hyphenated, matches framework's canonical name

### 2.7 Size budget

- Default: ≤1000 lines of source (tests + generated excluded)
- Lightweight frameworks (e.g., NanoClaw): ≤500 lines
- If you exceed the budget, justify it in the README

---

## 3. Integration-point → framework-extension-surface mapping

Use this table to pick the right framework hook for each ARP integration point. Multiple framework patterns may apply; pick the most stable + idiomatic.

| ARP integration point | LangGraph | KyberBot | OpenClaw | Hermes-Agent | NanoClaw | Generic (any framework) |
|---|---|---|---|---|---|---|
| `check()` before action | Graph node | Plugin pre-hook | Middleware pre-action | Decorator | Before-call callback | Pre-action hook / middleware / interceptor |
| `egress()` after action | State transform | Plugin post-hook | Middleware post-action | Decorator | After-call callback | Post-action hook / response middleware |
| `onIncoming()` | External trigger node | Channel handler | Request handler plugin | Event subscriber | Inbound callback | HTTP route / event emitter subscriber |
| `audit()` | Graph logger | Plugin event | Built-in observability | Logger hook | Log sink | Observability plugin / event listener |
| `on('revocation'...)` | Side-channel event | Lifecycle hook | Plugin event | Event subscriber | Status callback | Event emitter / pub-sub |

**Heuristic:** if a framework has "middleware," use it. If it has "plugins," use them. If it has "hooks," use them. If it has "decorators," use them. If it has none of these, reconsider whether an adapter is the right path (maybe just use `@kybernesis/arp-sdk` directly).

---

## 4. Minimum-viable adapter (template)

```ts
// @kybernesis/arp-adapter-<framework>/src/index.ts
import { ArpAgent, type HandoffBundle } from '@kybernesis/arp-sdk';
import { FrameworkAgent } from '<framework>';

export interface ArpAdapterOptions {
  handoff: string | HandoffBundle;
  agentApiUrl?: string;
  onDenied?: (reason: string) => void;
}

export function withArp<T extends FrameworkAgent>(agent: T, opts: ArpAdapterOptions): T {
  const arp = ArpAgent.fromHandoff(opts.handoff);

  // 1. Pre-action: check every tool call
  agent.hooks.onBeforeToolCall(async (tool, args, ctx) => {
    const decision = await arp.check({
      action: tool.name,
      resource: { type: 'tool', id: tool.name, args },
      context: { stated_purpose: ctx.purpose },
      connectionId: ctx.connectionId,
    });
    if (!decision.allow) {
      opts.onDenied?.(decision.reasons.join('; '));
      throw new Error(`ARP denied: ${decision.reasons.join('; ')}`);
    }
    ctx.obligations = decision.obligations;
  });

  // 2. Post-action: apply obligations to egress
  agent.hooks.onAfterToolCall(async (tool, result, ctx) => {
    return await arp.egress({
      data: result,
      connectionId: ctx.connectionId,
      obligations: ctx.obligations ?? [],
    });
  });

  // 3. Inbound: register handler for DIDComm messages
  arp.onIncoming(async (task, ctx) => {
    return await agent.handleTask(task, { connectionId: ctx.connectionId });
  });

  // 4. Audit: forward significant events to ARP
  agent.hooks.onEvent((event) => {
    arp.audit({ event: event.type, connectionId: event.connectionId, metadata: event.data });
  });

  // 5. Lifecycle: react to revocation / rotation
  arp.on('revocation', ({ connectionId }) => {
    agent.dropState?.({ connectionId });
  });

  // Kick off the ARP runtime
  arp.start({ port: 443 }).catch((err) => {
    console.error('ARP start failed', err);
    throw err;
  });

  return agent;
}
```

This is the shape every adapter takes. Framework-specific details (how hooks are registered, what contexts look like) change; the structure doesn't.

---

## 5. Project scaffold

Every new adapter repo should look like this:

```
adapters/<framework>/
├── src/
│   ├── index.ts                  # public entry
│   ├── hooks.ts                  # framework-specific hook wiring
│   ├── context.ts                # how to derive connection_id from framework context
│   └── obligations.ts            # how to apply obligations to framework-native responses
├── tests/
│   ├── unit.test.ts
│   └── conformance.test.ts       # imports from @kybernesis/arp-testkit
├── examples/
│   └── minimal-agent/            # smallest-possible working example
├── MIGRATION.md                  # before/after for devs adding this to an existing agent
├── README.md                     # install, usage, caveats, version compat
├── CHANGELOG.md
├── package.json
└── tsconfig.json
```

---

## 6. Scaffolding CLI

Use the official generator:

```bash
npx @kybernesis/arp-create-adapter \
  --framework my-framework \
  --language ts \
  --out ./adapters/my-framework
```

Flags:
- `--framework <slug>` (required) — framework name, lowercase-hyphenated
- `--language ts|python` (required)
- `--out <path>` (default: `./adapters/<framework>`)
- `--official` (flag; only for maintainers) — uses `@kybernesis/arp-` scope instead of unscoped
- `--size-budget <number>` (default: 1000) — warns if your adapter exceeds

Produces:
- Full project scaffold from §5
- Pre-wired conformance test that imports `@kybernesis/arp-testkit`
- README and MIGRATION.md with placeholders
- package.json with correct ARP metadata (§2.5)
- Example agent stub
- `.changeset/` entry

After generation, you edit `src/hooks.ts` to wire your framework's specific extension points. That's the only file you write from scratch.

---

## 7. Authoring steps (ordered)

1. **Identify extension points.** Read the framework's plugin / middleware / hook docs. Map each of the 5 ARP integration points to a framework primitive. If any one has no primitive, stop and consider whether `@kybernesis/arp-sdk` direct usage is simpler.
2. **Generate the scaffold.** `npx @kybernesis/arp-create-adapter …`
3. **Wire `check()`.** Hook into the framework's pre-action surface. Test with a simple deny-all policy; verify actions are blocked.
4. **Wire `egress()`.** Hook into the framework's post-action surface. Test with a redaction obligation; verify output is transformed.
5. **Wire `onIncoming()`.** Find where the framework receives external tasks; register the ARP inbound handler there.
6. **Wire `audit()`.** Use the framework's observability API; forward significant events to `arp.audit`.
7. **Wire lifecycle.** Handle `revocation` by dropping cached state; `rotation` by reconnecting with new keys; `pairing` by notifying the framework of the new connection.
8. **Write conformance test.** Import the testkit; point it at a local adapter-backed agent; assert 8/8 pass.
9. **Run the 5 bundles.** Use the bundles from `ARP-scope-catalog-v1.md §6`; each must work with your adapter out of the box.
10. **Write MIGRATION.md.** Before/after code for existing users of the framework.
11. **Size check.** Adapter ≤1000 lines source (≤500 for lightweight frameworks).
12. **Publish.** Via the release pipeline from `ARP-phase-1-shared-contract.md §Task 15`.

---

## 8. Conformance & testing

### 8.1 Unit tests
Every adapter must have unit tests for:
- `withArp()` returns a wrapped agent without mutating the original config in surprising ways
- Each integration point fires on the expected framework event
- Deny decisions propagate as the expected framework-native error type

### 8.2 Integration tests
Boot a minimal agent using the adapter, pair with a test peer (`@kybernesis/arp-testkit` provides a harness), run through:
- Happy path: allowed action succeeds
- Deny path: forbidden action blocked
- Obligation path: redacted response correct
- Revocation path: revoked connection rejects subsequent messages

### 8.3 Conformance suite (the gate)

```ts
// tests/conformance.test.ts
import { runFullAudit } from '@kybernesis/arp-testkit';
import { startExampleAgent } from '../examples/minimal-agent';

test('adapter passes full ARP conformance', async () => {
  const agent = await startExampleAgent({ handoff: './test-handoff.json' });
  const result = await runFullAudit(agent.did);
  expect(result.passed).toBe(result.total);
});
```

Every adapter MUST pass this. No conformance, no release.

---

## 9. Governance & publishing

### 9.1 Official vs community

- **Official** (`@kybernesis/arp-adapter-<framework>`): maintained by the ARP core team or a designated co-maintainer. Listed on `arp.spec/adapters`. Included in the nightly compliance workflow.
- **Community** (`@<yourscope>/arp-adapter-<framework>` or unscoped): maintained by you. Can be linked from `arp.spec/adapters` as community; must still pass conformance to be listed.

### 9.2 Submission process

1. Build the adapter against this guide
2. Pass conformance locally
3. Open a PR to `arp.spec` docs adding an entry to `/adapters`
4. ARP team runs conformance against your published package
5. If green → listed; if red → feedback
6. Versioning: independent of ARP core; bump when framework changes

### 9.3 Maintainer responsibilities

- Respond to conformance regressions within 2 weeks
- Publish at least one release per ARP major version bump
- Update `frameworkVersionCompat` in package.json when upstream changes
- Document framework-specific caveats in the adapter README

### 9.4 Sunsetting

If an adapter goes unmaintained for 6 months (no commits, conformance failing), the ARP team may:
1. Open an issue offering to take over or archive
2. After 30 days without response, mark as `conformanceStatus: deprecated` on `arp.spec`
3. After another 90 days, remove from the official listing

---

## 10. Anti-patterns

Do not:

- **Fork the framework.** Ever. Use public APIs only.
- **Re-implement Cedar.** Always route through `@kybernesis/arp-pdp` via `@kybernesis/arp-sdk`.
- **Bundle your own DIDComm.** Always use `@kybernesis/arp-transport`.
- **Bypass PDP for "trusted" sources.** Zero trust between agents means every call is checked.
- **Cache PDP decisions across requests.** Each invocation is evaluated fresh. Policies change; revocations propagate.
- **Swallow errors silently.** If ARP is down or misconfigured, the framework should fail loudly.
- **Auto-bootstrap on import.** Adapter is opt-in; `withArp()` is the only activation path.
- **Require env vars for core config.** Everything flows through the handoff bundle. Env vars are for overrides only.
- **Make the adapter depend on a specific LLM.** Adapter operates at framework / tool / transport level; LLM choice is agnostic.
- **Ship without a MIGRATION.md.** The migration doc is how people decide to adopt. No migration doc, no release.

---

## 11. Using this guide as a Claude Code skill

Install the adapter-author skill:

1. Create a file at `.claude/skills/arp-adapter/SKILL.md` (or equivalent path for your Claude Code install)
2. Paste the contents of `ARP-adapter-skill.md` (companion doc)
3. Ensure `ARP-adapter-authoring-guide.md` (this file) is accessible on the local filesystem or via a published URL

Once installed, Claude Code will invoke the skill when a user says things like:

- "Create an ARP adapter for <framework>"
- "Add ARP support to my <framework> agent"
- "Build an adapter for <framework>"
- "I want to integrate <framework> with ARP"

The skill walks the user through the steps in §7 and produces a conformance-passing adapter.

---

## 12. Cheat sheet (minimum viable adapter in 30 lines)

```ts
import { ArpAgent } from '@kybernesis/arp-sdk';
import type { FrameworkAgent } from '<framework>';

export function withArp(agent: FrameworkAgent, opts: { handoff: string }) {
  const arp = ArpAgent.fromHandoff(opts.handoff);

  agent.hooks.before(async (call, ctx) => {
    const d = await arp.check({
      action: call.name,
      resource: { type: 'tool', id: call.name },
      connectionId: ctx.connId,
    });
    if (!d.allow) throw new Error(`ARP denied: ${d.reasons.join(', ')}`);
    ctx._obligations = d.obligations;
  });

  agent.hooks.after(async (call, result, ctx) =>
    arp.egress({ data: result, connectionId: ctx.connId, obligations: ctx._obligations })
  );

  arp.onIncoming((task, ctx) => agent.handle(task, ctx));
  arp.on('revocation', ({ connectionId }) => agent.drop?.(connectionId));
  arp.start({ port: 443 }).catch(console.error);

  return agent;
}
```

30 lines. Swap framework hook names; you're done. Everything else in the guide is polish, conformance, and governance.

---

## 13. Quick reference card

| Question | Answer |
|---|---|
| Which SDK do I build on? | `@kybernesis/arp-sdk` (TS) or `arp-sdk` (Python) |
| How many files? | ~4 source files + tests |
| How many lines? | ≤1000 (≤500 for lightweight frameworks) |
| What tests are required? | Unit + integration + full testkit conformance |
| What must pass? | `@kybernesis/arp-testkit audit` → 8/8 green |
| Where do I submit? | PR to arp.spec `/adapters` listing |
| What's the naming? | `@kybernesis/arp-adapter-<framework>` (official) or `@scope/arp-adapter-<framework>` (community) |
| How long should this take? | ≤1 day for a framework with a clean plugin API |

---

*Adapter Authoring Guide v0.1 — April 2026*
