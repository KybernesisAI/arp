# ARP — Build Roadmap (Phase Index)

**Purpose:** one-page map of the end-to-end build. Each phase has its own doc that can be fed to Claude Code as a self-contained brief.

**Reading order:** phases are numbered in dependency order. Later phases assume earlier phases shipped.

---

## Phases at a glance

| # | Name | Doc | Weeks | Output |
|---|---|---|---|---|
| 0 | **Roadmap & prerequisites** | this doc | — | Alignment |
| 1 | **Shared Contract** | `ARP-phase-1-shared-contract.md` | 2 | `@kybernesis/arp-spec`, `@kybernesis/arp-templates`, `@kybernesis/arp-scope-catalog` on npm |
| 2 | **Runtime Core** | `ARP-phase-2-runtime-core.md` | 3–4 | PDP, transport, registry, audit, resolver, TLS libs |
| 3 | **Sidecar Packaging** | `ARP-phase-3-sidecar.md` | 2 | Docker image, systemd unit, first-boot bootstrap |
| 4 | **Pairing + Owner App** | `ARP-phase-4-pairing-owner-app.md` | 3–4 | QR pairing flow + Next.js owner UI on owner subdomain |
| 5 | **Reference Agents + Compliance Testkit** | `ARP-phase-5-reference-agents-testkit.md` | 2 | `samantha.agent`, `ghost.agent`, automated compliance tests |
| 6 | **SDKs + Framework Adapters** | `ARP-phase-6-sdks-adapters.md` | 3 | `@kybernesis/arp-sdk`, `arp-sdk` (Python), **required:** OpenClaw + Hermes-Agent + NanoClaw + KyberBot + LangGraph adapters. **Stretch:** CrewAI + MCP |
| 7 | **ARP Cloud (hosted mode)** | `ARP-phase-7-cloud.md` | 4 | Multi-tenant runtime at `app.arp.spec`, outbound client, billing |
| 8 | **Mobile Apps** | `ARP-phase-8-mobile.md` | 4 | iOS + Android app, biometric consent, QR pairing, push |
| 8.5 | **Auth & Identity Shift** (Self.xyz demotion + did:key + terminology) | `ARP-phase-8-5-auth-identity-shift.md` | — | `did:key` resolver support, browser-held principal keys, Self.xyz removed; in flight |
| 9 | **Headless Integration + Launch** | `ARP-phase-9-launch.md` | 3 | TLD-side registration flow, public beta, docs site |

**Total critical-path: ~26–30 weeks** (phases 1 → 5, plus 9 to launch).
**Parallelizable:** phases 6, 7, 8 can run alongside 4/5 once contract + runtime are stable.

---

## Dependency graph

```
Phase 1 (Contract) ──────────────┬─────┬─────┬─────┐
                                 │     │     │     │
                                 ▼     ▼     ▼     ▼
                              Phase 2 Phase 6 Phase 7 Phase 8
                              Runtime  SDKs   Cloud  Mobile
                                 │      │      │      │
                                 ▼      │      │      │
                              Phase 3   │      │      │
                              Sidecar   │      │      │
                                 │      │      │      │
                                 ▼      │      │      │
                              Phase 4   │      │      │
                              Pairing + │      │      │
                              Owner App │      │      │
                                 │      │      │      │
                                 ▼      ▼      ▼      ▼
                              Phase 5 (Reference Agents + Testkit)
                                 │
                                 ▼
                              Phase 9 (Launch)
```

---

## Foundational docs to read before any phase

Every phase doc assumes familiarity with these. Keep them open as you execute:

1. `ARP-architecture.md` — the system design
2. `ARP-our-codebase.md` — the independence model + repo layout
3. `ARP-scope-catalog-v1.md` — the 50 scopes
4. `ARP-policy-examples.md` — Cedar examples + variable catalog
5. `ARP-installation-and-hosting.md` — three install modes
6. `ARP-hns-resolution.md` — HNS + TLS strategy
7. `ARP-tld-integration-spec-v2.md` — what the TLD side must do

---

## Global tech pins (apply to every phase)

- **Language:** TypeScript. Exceptions: Python SDK (phase 6), Swift/Kotlin (phase 8).
- **Runtime:** Node.js 24 LTS.
- **Package manager:** `pnpm` (workspaces).
- **Framework (server):** Hono.
- **Framework (web UI):** Next.js 16 App Router.
- **Framework (mobile):** React Native (Expo) + native modules where needed.
- **Hosting (cloud services):** Vercel (Fluid Compute).
- **Storage:** SQLite (via `better-sqlite3`) for agent-local; Postgres (Neon on Vercel Marketplace) for multi-tenant Cloud.
- **Crypto:** `@noble/ed25519`, `jose`, `canonicalize`.
- **Cedar engine:** `@cedar-policy/cedar-wasm`.
- **DIDComm:** `@veramo/did-comm`.
- **HNS resolution:** DoH via `https://hnsdoh.com/dns-query`.
- **Monorepo tool:** pnpm workspaces + Turborepo for build pipelines.
- **CI:** GitHub Actions.
- **Release:** Changesets for npm packages.
- **License:** MIT.

---

## Global "definition of done" for any phase

Before marking a phase complete:

- [ ] `pnpm -r build` green
- [ ] `pnpm -r test` green
- [ ] `pnpm -r typecheck` green
- [ ] `pnpm -r lint` green
- [ ] Zero `TODO` / `FIXME` in shipped paths
- [ ] Readme updated for each package
- [ ] Changelog entry via Changesets
- [ ] All acceptance tests in the phase doc pass
- [ ] No new dependencies added without justification in the package README

---

## How to use a phase doc with Claude Code

1. Start fresh Claude Code session.
2. Paste the phase doc as the first user message.
3. Claude Code should immediately scaffold into the monorepo, no questions asked.
4. On completion, Claude Code must produce the "done when" checklist results.
5. If Claude Code hits an ambiguity the phase doc doesn't resolve, it should prefer the conservative choice and flag it in the PR description — not ask mid-run.

Every phase doc ends with a `§ Handoff` section specifying exactly what the next phase consumes.

---

## Out of scope for v0 (any phase)

These are deferred to v0.2+, mentioned in multiple docs, noted here once for reference:

- Multi-principal agents
- Agent ownership transfer
- x402 real payment rails (stubbed interface only through v0)
- Directory service (`registry.agent`)
- Location / health data scopes
- Browser-extension-based HNS resolution path (we note it exists; don't build it)
- ACME for agent endpoints (DID-pinned TLS is the v0 design)
- Multi-registrar support (Headless only)

---

## Who owns what

| Layer | Owner |
|---|---|
| Spec repo (`arp/`) | ARP team — us |
| npm packages (`@kybernesis/arp-*`) | ARP team |
| ARP Cloud infrastructure | ARP team |
| `.agent` TLD, registrar, hybrid resolver | Headless Domains |
| HNS protocol itself | Handshake community |
| Optional attribute VCs | any OIDC-style JWKS or VC issuer (pluggable, not required in v1) |
| x402 protocol | Coinbase / community |

The spec is neutral; everything else is ours or theirs, never blended.

---

## Commit sequence discipline

Each phase doc specifies atomic task numbers (e.g., Phase 1 Task 3). Commits reference them:

```
feat(spec): implement did-doc JSON schema [phase-1/task-3]
```

Scope is the affected package (`spec`, `templates`, `runtime`, `pdp`, `transport`, etc.) — one per commit. This lets us cross-link commits to phase docs for audit and for the inevitable day someone asks "why did we do X that way."

**Repo:** `https://github.com/KybernesisAI/arp` · **Local:** `/Users/ianborders/arp`
