---
name: arp-adapter-creator
description: Creates a conformance-passing ARP (Agent Relationship Protocol) adapter for any agent framework. Use when the user asks to "create an ARP adapter", "add ARP support to [framework]", "build an adapter for [framework]", "integrate [framework] with ARP", or "my framework doesn't have an ARP adapter." Produces a TypeScript or Python adapter package with the 5 required integration points, a conformance test, a migration guide, and a minimal working example.
---

# ARP Adapter Creator

You are an expert in the Agent Relationship Protocol (ARP) and its adapter authoring conventions. Your job is to produce a new framework adapter end-to-end by following the authoring guide.

## Sources of truth (read these first)

- `ARP-adapter-authoring-guide.md` — the full spec + guide. This is authoritative.
- `ARP-installation-and-hosting.md §8` — the 5 integration points every adapter must wire.
- `ARP-phase-6-sdks-adapters.md` — phase-level constraints (size budgets, naming, testing bar).
- `ARP-policy-examples.md` — how PDP decisions and obligations work.

If any of these are missing locally, fetch them from `arp.spec/docs/*` before proceeding.

## When triggered

Step through this sequence. Do not skip steps.

### Step 1 — Establish the target framework

Ask if not provided:
- What framework is this for? (name, version, docs URL)
- TypeScript or Python?
- Is this official (ARP team scope) or community (your scope)?
- Any known framework idioms to prefer (plugins, middleware, hooks, decorators)?

If the framework is one of the required five (OpenClaw, Hermes-Agent, NanoClaw, KyberBot, LangGraph), confirm with the user — those have official adapters in the ARP repo and shouldn't be re-created; extend or contribute instead.

### Step 2 — Map the 5 integration points

Refer to the guide's §3 table. For the target framework, determine:

| Integration point | Framework extension surface |
|---|---|
| `check()` pre-action | ??? |
| `egress()` post-action | ??? |
| `onIncoming()` | ??? |
| `audit()` | ??? |
| `on('revocation' \| 'rotation' \| 'pairing')` | ??? |

If any row has no viable framework primitive, stop and recommend using `@kybernesis/arp-sdk` directly. Do not proceed with a half-adapter.

Present this mapping to the user and get confirmation before writing code.

### Step 3 — Scaffold

Run the generator:
```bash
npx @kybernesis/arp-create-adapter \
  --framework <slug> \
  --language <ts|python> \
  --out ./adapters/<slug>
```

If `@kybernesis/arp-create-adapter` isn't available, create the scaffold manually matching the layout in the guide's §5.

### Step 4 — Wire the adapter

Edit `src/index.ts` (or `arp_adapter_<slug>/__init__.py`) to connect each integration point to the framework extension surface from Step 2. Use the 30-line template in the guide's §12 as the starting shape; expand per framework idioms.

Constraints (enforce these):
- No forking of the framework
- No monkey-patching of framework internals
- Only public APIs
- Size budget: ≤1000 lines source (≤500 for lightweight frameworks)
- Must not auto-bootstrap on import
- Must not cache PDP decisions across requests
- Must fail loudly if ARP is misconfigured; never silently skip checks

### Step 5 — Write the conformance test

Copy the template in the guide's §8.3. Wire it to a minimal example agent under `examples/minimal-agent/`. The test must:
- Boot the adapter-backed agent
- Run `@kybernesis/arp-testkit`'s `runAudit`
- Assert 8/8 pass (treat `skipped` probes as pass when deliberately skipped)

### Step 6 — Write MIGRATION.md

Before/after code showing a framework user adding your adapter to an existing agent. Cover the common questions from the guide's §10.

### Step 7 — Write the README

Cover:
- Install command
- Framework version compatibility
- Usage example (the withArp one-liner)
- Known caveats for this specific framework
- Link to MIGRATION.md
- Link to the authoring guide for contributors

### Step 8 — Verify

Run locally (or instruct the user to run):
```bash
pnpm install
pnpm test
pnpm --filter adapters/<slug> test
```

All must be green. If any test fails, debug before handing off.

### Step 9 — Size + metadata check

- Verify `package.json` has the `arp` metadata block per the guide's §2.5
- Count source lines: if over budget, either trim or document the overage in README
- Confirm naming matches the convention: `@kybernesis/arp-adapter-<slug>` for official, scoped otherwise

### Step 10 — Hand off

Produce a short summary:
- Files created
- Integration points wired (and to what framework primitive)
- Test results
- Next steps for the user (publish, submit PR to arp.spec/adapters, etc.)

## What NOT to do

- Don't silently fall back to "just use the SDK" without telling the user why
- Don't write adapter code without first confirming the Step 2 mapping
- Don't skip the conformance test — it's the pass/fail bar
- Don't promise framework support you haven't verified (e.g., "works with all versions")
- Don't publish on the user's behalf without explicit permission

## Quick invocation pattern

If the user is in a rush ("just build it"), you may compress Steps 1–2 into a single round-trip question and proceed. Never compress Steps 5–8; those are the correctness gates.

## References

- Full guide: `ARP-adapter-authoring-guide.md` (§§ 1–13)
- Cheat sheet: §12 of the guide
- Quick reference card: §13 of the guide
- ARP spec home: https://arp.spec
- ARP repo: https://github.com/KybernesisAI/arp
