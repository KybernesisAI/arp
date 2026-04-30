# ARP / KyberBot Unification Roadmap

**Status:** proposed (2026-04-30) — drafted before any unification code ships.
**Owner:** Ian Borders
**Sibling repos:** `KybernesisAI/arp` (the protocol + cloud runtime) · `KybernesisAI/kyberbot` (the agent framework)

This document is the canonical statement of how ARP and KyberBot relate as projects, why they should integrate natively rather than through the generic adapter pattern other frameworks use, and what work that takes — across both repos, in shippable phases.

## TL;DR

- **ARP** = open protocol + cloud runtime. Standardizes agent-to-agent identity, pairing, scope policy, audit. Any framework integrates via `cloud-bridge` adapter.
- **KyberBot** = a specific agent framework (kyberbot-claude). Should integrate ARP **natively, as a peer**, not through the generic adapter.
- The native integration becomes ARP's flagship reference implementation. It demonstrates policy enforcement at the *data layer*, not just the wire — which is what differentiates ARP from "DIDComm with extra steps".
- KyberBot's existing fleet-bus (intra-fleet HTTP messaging with shared-secret auth) gets replaced by ARP. One mechanism for all agent-to-agent comms, intra-fleet and cross-org.
- KyberBot bundles ARP as a direct dependency. `npm i -g @kybernesis/kyberbot` brings everything; `kyberbot init` runs ARP onboarding inline.

## The framing

> **ARP is the standard. KyberBot is the canonical reference implementation.**

Other frameworks (LangChain, Mastra, OpenClaw, plain Python services) plug in through `packages/cloud-bridge` adapters. They get policy at the wire — fine, but lossy: their LLMs honor obligations through prompting, not code.

KyberBot integrates *as a peer*. Every memory, fact, file, and task knows what project + connection + classification it belongs to. Queries auto-filter at SQL/ChromaDB metadata level. Obligations apply as code — `redact_fields_except` strips JSON keys, `rate_limit` checks a SQLite counter, `max_size_mb` truncates files. The LLM is no longer the enforcement boundary; it consumes pre-filtered, pre-redacted data.

This is the gold-standard pattern ARP markets to convince other framework authors that deep integration is worth the investment. KyberBot proves the pattern.

## The five integration layers

### 1. Shared schema vocabulary

`project_id`, `tags`, `classification`, `connection_id`, `obligation`, `audit_entry`. Defined once in `@kybernesis/arp-spec`, imported by both ARP packages and KyberBot's brain. The `project_id` you typed in the ARP scope picker is the same `project_id` KyberBot's `remember` skill writes to fact-store. No translation, no glue code.

### 2. Brain-level provenance

Every memory / fact / timeline entry / ChromaDB chunk carries:

- `connection_id` — which ARP pairing produced or owns it
- `project_id` — declared scope context
- `tags` — flexible JSON array for user-driven tagging
- `classification` — public / internal / confidential / pii (drives default obligations)

So *"what did Atlas learn from Mythos about project alpha?"* is one indexed query. *"Forget everything Mythos told us about project alpha"* is one DELETE.

### 3. Typed API surface

KyberBot mounts `/api/arp/*` endpoints alongside the existing `/api/web/chat`:

| Scope (catalog) | Endpoint |
|---|---|
| `notes.search` | `POST /api/arp/notes.search` |
| `notes.read` | `POST /api/arp/notes.read` |
| `files.project.files.read` | `POST /api/arp/files.read` |
| `files.project.files.list` | `POST /api/arp/files.list` |
| `files.project.metadata.read` | `POST /api/arp/files.metadata` |
| `files.project.files.summarize` | `POST /api/arp/files.summarize` |
| `knowledge.query` | `POST /api/arp/knowledge.query` |
| `tasks.list` / `.read` / `.status.update` | `POST /api/arp/tasks.{list,read,update}` |
| `calendar.availability.read` | `POST /api/arp/calendar.availability` |
| `messaging.relay.to_principal` | falls through to `/api/web/chat` (free-form) |

Each endpoint:
- Validates input shape against the scope template's parameters
- Queries the brain layer with `project_id` / `tags` filters baked into SQL or ChromaDB metadata filters
- Applies obligations as code (redact, rate-limit, size-cap)
- Returns a typed response shape, not free-form text
- Writes to a local audit log with the same hash-chain structure as the cloud's

### 4. Skill awareness

KyberBot's skills (`recall`, `remember`, `brain-note`, `contact`) become connection-aware:

- A memory written during an ARP conversation gets stamped with that `connection_id` automatically
- `kyberbot connections list` shows ARP peers + scopes (wraps `arpc connections show`)
- `kyberbot ask <peer> [--project X]` composes typed action requests when scopes allow it; falls back to free-form chat otherwise
- The `contact` skill detects project context from the user's prompt and includes it on outgoing requests

### 5. Cloud dashboard symmetry

`cloud.arp.run` shows KyberBot-specific state when the agent declares itself as KyberBot:
- Brain entity count, last memory-write timestamp
- Skills installed
- Brain folder doc count
- ChromaDB collection stats

Pairing two KyberBot agents surfaces a **"KyberBot peer collaboration"** preset bundle as the first option (read-mostly, project-scoped, redact-pii, audit-verbose), with the full picker tucked under "Custom". One-click pairing for the common case.

## Phases (shippable units)

Each phase is independently shippable and reversible. Phases land in the repo most associated with the work; cross-repo phases call that out explicitly.

### Phase A — Schema unification *(both repos, foundation)*

**Goal:** one canonical metadata vocabulary across both repos.

| Step | Repo | Deliverable |
|---|---|---|
| A.1 | `arp` | Add `AgentResourceMetadata` type + `ResourceClassification` enum to `@kybernesis/arp-spec`. Export. No protocol change. |
| A.2 | `kyberbot` | Migrate fact-store: add `project_id`, `tags JSON`, `connection_id`, `classification` columns (additive, idempotent — same `ALTER TABLE` pattern fact-store already uses). |
| A.3 | `kyberbot` | Migrate timeline + messages tables similarly. |
| A.4 | `kyberbot` | Extend ChromaDB `DocumentMetadata` shape: add `project_id`, `tags`, `connection_id`, `classification`. |
| A.5 | `kyberbot` | Best-effort backfill script: any fact whose `entities_json` contains a `type=project` entity gets that entity name as default `project_id`. |
| A.6 | `kyberbot` | Update `storeConversation()` to read `metadata.project_id` / `metadata.tags` / etc. from `ConversationInput.metadata` (already a typed field, just plumb through to all three storage layers). |

**Done when:** new memories / facts / chunks land with full metadata; backfill ran; existing schema reads still work; storeConversation honors metadata.

### Phase B — KyberBot ARP integration package *(`kyberbot` repo)*

**Goal:** KyberBot speaks ARP at the endpoint level, not just the wire.

| Step | Deliverable |
|---|---|
| B.1 | New package: `@kybernesis/kyberbot-arp` in the kyberbot monorepo. Express middleware. |
| B.2 | Mount typed `/api/arp/*` routes (table above). Each is a thin handler over the brain layer. |
| B.3 | Obligation enforcer library: redact-fields, redact-fields-except, rate-limit (per-connection SQLite counter), max-size, audit-level. Pure functions, unit-tested. |
| B.4 | Local ARP audit: `~/<agent>/data/arp-audit.db` with hash-chain matching the cloud's `audit_entries`. Every typed call logs request + applied obligations + return shape. |
| B.5 | Health probe: `/api/arp/health` reports brain status, available endpoints, scope catalog version. The cloud-bridge adapter pings this on startup. |

**Done when:** all scopes in the catalog have a corresponding typed handler that filters by project_id; obligations apply deterministically; local audit chain verifies clean.

### Phase C — Cloud-bridge adapter rewrite *(`arp` repo)*

**Goal:** ARP dispatches typed actions to typed endpoints; chat falls through to the LLM.

| Step | Deliverable |
|---|---|
| C.1 | `packages/cloud-bridge/src/adapters/kyberbot.ts` switches on `ctx.body.action`. Structured action → `POST /api/arp/<action>`. Plain text → `/api/web/chat` (existing path). |
| C.2 | When falling through to `/api/web/chat`, augment the system prompt with connection context: peer DID, granted scopes (human-readable), project context (if any), classification of any data touched. |
| C.3 | Auto-tag inbound: every chat-path message KyberBot stores during an ARP session gets `connection_id` + `project_id` (when set) automatically via metadata. |
| C.4 | Obligations move out of the adapter — they live in `/api/arp/*` server-side. Adapter just relays the response. |

**Done when:** typed actions round-trip end-to-end without LLM in the loop; chat path still works for ad-hoc questions; adapter has no obligation logic.

### Phase D — Outgoing ergonomics *(both repos)*

**Goal:** KyberBot agents make ARP requests as comfortably as they receive them.

| Step | Repo | Deliverable |
|---|---|---|
| D.1 | `arp` | New CLI verb: `arpc request <peer> <action> [params...]`. Constructs structured action body, signs envelope, ships. Sibling to `arpc send`. |
| D.2 | `kyberbot` | `kyberbot connections list` — wraps `arpc connections show`, formats for terminal. |
| D.3 | `kyberbot` | `kyberbot ask <peer> [--project X] "..."` — wraps either `arpc send` or `arpc request` based on whether the message looks structured (heuristic: `--action` flag or explicit verb in the prompt). |
| D.4 | `kyberbot` | `contact` / `remember` skills get auto-context — when a project is mentioned in conversation, outgoing requests + new memories include it. |

**Done when:** the natural KyberBot UX produces well-typed ARP traffic when scopes allow it; users don't need to hand-craft action bodies.

### Phase E — Native peer pairing flow *(both repos)*

**Goal:** pairing two KyberBot agents is one click, not the full scope picker.

| Step | Repo | Deliverable |
|---|---|---|
| E.1 | `arp` | New bundle preset: **"KyberBot peer collaboration"** in `packages/scope-catalog/src/bundles.ts`. Read notes/facts/files in a chosen project, query knowledge base, exchange messages, with `redact_fields_except: [name, email, role]` and `rate_limit: 60/hour`. |
| E.2 | `arp` (cloud-app) | `/pair` UI detects when both agents are KyberBot (via agent card / handoff) and surfaces this preset first; full picker under "Custom". |
| E.3 | `arp` (cloud-app) | Dashboard shows brain health for KyberBot agents: entity count, last memory-write, skills installed, ChromaDB stats. New API route on KyberBot side: `GET /api/arp/agent-stats`. |

**Done when:** pairing two KyberBot agents is one click for the common case; dashboard distinguishes KyberBot agents from generic ARP agents at a glance.

### Phase F — Fleet on ARP *(both repos, KyberBot heavy)*

**Goal:** replace KyberBot's intra-fleet bus with ARP. One mechanism for all agent-to-agent comms.

| Step | Repo | Deliverable |
|---|---|---|
| F.1 | `arp` | Add `direct://<host>:<port>` transport to cloud-bridge so two agents on same machine / LAN exchange signed envelopes peer-to-peer (no gateway hop). Audit chains locally first, syncs to cloud when reachable. |
| F.2 | `kyberbot` | Convert fleet-server into a designated "hub" KyberBot agent. Members pair with the hub. Broadcast (`to:'*'`) becomes hub-side fan-out across paired connections. Subscriptions become hub-side per-connection filters. |
| F.3 | `kyberbot` | Compatibility shim: `/api/bus/*` endpoints translate inbound bus messages to outbound ARP `arpc request` / `arpc send`, and vice versa. Existing fleets keep working through one release without code changes. |
| F.4 | `kyberbot` | Migration tooling: `kyberbot fleet migrate-to-arp` walks the user through pairing existing fleet members through ARP. |
| F.5 | `kyberbot` | Sunset bus endpoints in the release after F.3 ships. Remove `bus-api`, `agent-bus`, `bus-handler`, `bus-db`. |
| F.6 | `arp` | Offline / mesh mode: mDNS-based agent discovery on local network when cloud gateway is unreachable. Bridges queue + sync once back online. |

**Done when:** fleet messages flow through ARP; bus shim removed; offline-LAN scenario works.

### Phase G — Unified install *(`kyberbot` repo)*

**Goal:** one install gets you both. ARP feels like part of KyberBot, not an add-on.

| Step | Deliverable |
|---|---|
| G.1 | Update `@kybernesis/kyberbot` package.json to depend directly on `@kybernesis/arp`, `@kybernesis/arp-cloud-bridge`, `@kybernesis/arp-cloud-client`. `npm i -g @kybernesis/kyberbot` brings everything. |
| G.2 | `kyberbot init` runs ARP onboarding inline: choose `<name>.agent`, register with cloud.arp.run (or skip for offline-only), install launchd service. The current `arpc init` flow becomes one screen of `kyberbot init` for KyberBot users. |
| G.3 | `kyberbot fleet add <peer>` calls `arpc pair` with the "KyberBot peer collaboration" preset. |
| G.4 | `kyberbot ask` ⇄ `arpc send` / `arpc request` aliasing at the CLI level. Users can use either name. |
| G.5 | Documentation: a single "Connecting to other agents" page in KyberBot docs that walks through ARP — pairing, scopes, conversations — in KyberBot's voice. The `arp` repo links to it for the canonical KyberBot flow. |

**Done when:** a fresh KyberBot install can pair with another KyberBot agent + exchange typed requests within minutes, with no separate ARP install step.

## Strategic positioning

For external messaging:

> **KyberBot is built on ARP.** Your KyberBot agent's data is yours; ARP is what makes it shareable on your terms with other agents you trust. Other frameworks integrate via the ARP adapter pattern; KyberBot integrates as a peer because both projects are ours.

Two flywheels emerge:
1. **ARP catalog evolution is driven by what KyberBot agents need.** Scope additions land in ARP, KyberBot consumes them next release.
2. **KyberBot brain evolution is driven by what's policy-relevant.** New brain attributes (e.g., `urgency`, `audience`) land if and only if they unlock policy expressivity in ARP.

## Repo placement

- **Open spec, runtime, gateway, generic adapters** → `KybernesisAI/arp`
- **Brain, skills, KyberBot CLI, KyberBot-specific endpoints, fleet logic** → `KybernesisAI/kyberbot`
- **The ARP↔KyberBot integration glue (`@kybernesis/kyberbot-arp`)** → lives in `KybernesisAI/kyberbot`. Signals that this is part of KyberBot, ARP-aware. Other frameworks ship their own integration packages in their own repos.

## Non-goals

- ARP doesn't lock to KyberBot. The protocol stays framework-agnostic; the adapter pattern stays first-class.
- KyberBot doesn't fork ARP code. ARP packages stay published as separate npm packages with semver guarantees.
- Existing KyberBot users with no ARP needs aren't forced to provision an `.agent` DID. The ARP onboarding step in `kyberbot init` is optional.

## Open questions

- **Hub agent semantics** — how does broadcast latency feel when fanning out via the hub? Need to benchmark before committing to F.2.
- **Direct-mode discovery** — do we use mDNS, or rely on a config file with peer endpoints? mDNS is friendlier but more failure modes.
- **Local audit hash chain** — should the local audit be a strict subset of the cloud chain (chain-replay verifies both), or independent (each chain verifies on its own)? Strict subset is simpler conceptually but requires cloud sync to verify; independent is more robust but doubles the chain bookkeeping.
- **Schema migration path for existing KyberBot users** — do we ship a destructive "rebuild brain" mode, or is best-effort backfill enough? Probably the latter, but want user evidence.

## Suggested ship order

1. Phase A.1–A.6 (schema unification) — foundation, blocks everything else.
2. Phase B.1–B.5 (typed endpoints + obligations) — KyberBot becomes ARP-fluent at the data layer.
3. Phase C.1–C.4 (adapter rewrite) — ARP dispatch routes typed actions correctly.
4. Phase D.1–D.4 (outgoing ergonomics) — KyberBot agents send typed requests as easily as receive them.
5. Phase E.1–E.3 (peer-pairing presets + dashboard) — ergonomic polish.
6. Phase F.1–F.6 (fleet on ARP) — the bus replacement.
7. Phase G.1–G.5 (unified install) — packaging + onboarding.

A–E are roughly 4–6 PRs across both repos, ~1 week of focused work. F is its own week (most architectural risk). G is final integration.

## Document evolution

This doc is the canonical reference for the unification. Updates to scope, sequencing, or strategy land here as PRs to `KybernesisAI/arp:docs/ARP-KyberBot-unification-roadmap.md`. Mirror in Obsidian (Samantha vault).
