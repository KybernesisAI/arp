# ARP — Session Handoff Document

**Purpose:** complete state dump for a continuing Claude (or a new one) to pick up exactly where the previous session left off, without losing the operating model, conventions, or open threads.

**Audience:** future Claude sessions. Also useful to Ian as a "how are we operating" reference.

**Last updated:** 2026-04-24, end of Phase 9 slice 9b merge (cloud v2.1 registrar endpoints + `/api/push/register`).

---

## 1. Current state of the build

### Main branch
```
338bd8e Phase 9 slice 9b: cloud v2.1 registrar endpoints + /api/push/register (#26)
... (PRs #22–#25 ops: .github/workflows/deploy.yml — auto-deploys both Vercel projects on every main push; needed four PRs to get clean — covered in detail in §1 below)
6226616 fix(spec-site): run prebuild before typecheck + lint [phase-9/9a/hotfix] (#20)
414217f Phase 9 slice 9a: public sites (spec + docs) + @kybernesis/arp-ui extraction + schema scrub (#19)
c4e82ac docs: bump for phase 8.75 merge (brand + design scaffold) (#18)
1db3f7f Phase 8.75: brand + design scaffold (Swiss/editorial tokens, 3-surface host dispatch) (#17)
a4d29d5 docs: refresh phase 9 brief for milestone A + phase 8.5 deltas (#16)
0e2ae14 docs: bump for phase 8.5 merge (did:key primary + Self.xyz demotion) (#15)
3c157fb Phase 8.5: Self.xyz demotion + did:key primary identity + terminology sweep (#14)
46c4e7e docs: log Milestone A (cloud.arp.run live) + phase 8 scaffold merge (PR #12) (#13)
e6e3877 docs: add mobile-app-stub pointing at arp-mobile separate repo [phase-8/task-0] (#12)
d2f78b2 chore(gitignore): exclude packages/cloud-db/migrate-once.mjs
4c505ac fix(cloud-db): add Neon HTTP driver for production, select via DATABASE_URL (#11)
1e49c6e chore(vercel): gitignore .vercel project link directory
58995d2 docs: bump CLAUDE.md + handoff for phase 7 merge + drain fix (PR #9 + #10)
889ef05 fix(runtime): wait for TCP-level connection drain (#10)
eeec5bf Phase 7: ARP Cloud (#9)
53fe9da docs: CLAUDE.md + ARP-session-handoff.md (operating model + state at end of phase 6)
1e2defe Phase 6: SDKs + Framework Adapters (#8)
a7e6a20 Phase 5: Reference Agents + Compliance Testkit (#7)
a5ef6da Phase 4: Pairing Flow + Owner App (#6)
c2aa88d docs(headless): TLD-integration parallel-build brief + card-bridging analysis
6bd1842 fix(runtime): settle TCP accept queue before drain quiescence poll (#5)
91efe99 Phase 3: Sidecar Packaging (#4)
6fcb874 Phase 2: Runtime Core (#3)
33dba65 ci: route through Turborepo so ^build runs before downstream typecheck (#2)
152f06e Phase 1: Shared Contract (#1)
7059c99 docs: rename npm scope to @kybernesis
3d94706 docs: ARP design + phase execution plans
```

### Phases shipped
1. **Phase 1 — Shared Contract.** `@kybernesis/arp-spec`, `@kybernesis/arp-templates`, `@kybernesis/arp-scope-catalog`. 50 scopes. 9 JSON Schemas.
2. **Phase 2 — Runtime Core.** `@kybernesis/arp-runtime`, `-pdp`, `-transport`, `-registry`, `-audit`, `-resolver`, `-tls`. Reference runtime-bin. Two-agent integration test.
3. **Phase 3 — Sidecar Packaging.** Docker image at `ghcr.io/kybernesisai/sidecar` (built but not yet pushed — dormant until Phase 9). First-boot bootstrap, systemd unit, CLI wrapper. Atlas smoke test.
4. **Phase 4 — Pairing + Owner App.** `@kybernesis/arp-pairing`, `-consent-ui`, `-selfxyz-bridge`. `apps/owner-app` Next.js 16 App Router. Runtime `/admin/*` bearer-gated API. End-to-end pairing demo.
5. **Phase 5 — Reference Agents + Testkit (local scope).** `@kybernesis/arp-testkit` with all 8 probes + CLI. `samantha-reference` and `ghost-reference` agent configs (not deployed — deferred to Phase 5B when infra is ready). Nightly compliance workflow (dormant). Review-pass fix: `record.token.obligations` now merges into audit entries + outbound replies.
6. **Phase 6 — SDKs + Adapters.** `@kybernesis/arp-sdk` + Python scaffold. Five required adapters: KyberBot, OpenClaw, Hermes-Agent, NanoClaw, LangGraph. `@kybernesis/arp-create-adapter` CLI. Claude Code adapter-authoring skill.
7. **Phase 7 — ARP Cloud.** `@kybernesis/arp-cloud-db` (branded `TenantId` + `TenantDb`), `@kybernesis/arp-cloud-runtime` (multi-tenant dispatch), `@kybernesis/arp-cloud-client` (outbound WebSocket + reconnect), `apps/cloud-gateway`, `apps/cloud` (Next.js UI + Stripe billing). Tenant isolation: 5 × 4 adversarial scenarios, zero leaks. Stripe webhook idempotency. **Post-merge drain fix (PR #10):** `server.getConnections()` now joins `inFlight` in the quiescence loop to close the TCP-accept-queue race that re-flared on CI. **Neon HTTP driver (PR #11):** `apps/cloud/lib/db.ts` selects Neon when `DATABASE_URL` is set, PGlite otherwise — unblocks Milestone A.
8. **Phase 8 — Mobile scaffold.** Expo SDK 52 + RN 0.76.3 owner app in a separate repo at `github.com/KybernesisAI/arp-mobile` (private). All routes from phase brief §3, principal-DID login (Ed25519 → Secure Enclave/Keystore), HNS DoH resolver, biometric gate per risk tier, QR scan, pair flow, push registration, Maestro E2E flow, store-listing drafts. 53 files / ~2,700 lines. Gates green: typecheck, jest 18/18, eslint, `expo prebuild` for both platforms. Monorepo side: `docs/mobile-app-stub.md` pointer only (PR #12). **Scope: scaffold only — no App Store / Play Store submissions; public launch is Phase 10.** Conservative calls: (1) scope-catalog + SDK inlined as portable subsets, swap at Phase 9 publish; (2) DID-pinned TLS bridge deferred to Phase 9; (3) `/api/push/register` cloud-side endpoint deferred — mobile tolerates 404; (4) jest uses ts-jest + node env (not jest-expo) for pnpm-hoisting compatibility.
9. **Phase 8.5 — Auth & Identity Shift.** Deleted `@kybernesis/arp-selfxyz-bridge` (500-LOC placeholder, never wired). Primary principal identity is now a browser-held `did:key` Ed25519 keypair (localStorage; 12-word recovery phrase). Additive `did:key` resolver support + relaxed `DidDocumentSchema` (service + principal optional on terminal did:key docs) + new `@kybernesis/arp-transport/browser` subpath for client-safe helpers (Next.js client bundles can't pull the root transport entry which drags SQLite + fs). Consent-UI now provider-agnostic (generic `prettyPrint` of VC type ids + optional overrides map). Spec v2.1 amendment at `docs/ARP-tld-integration-spec-v2.1.md` documents the two-option owner-binding UX (Option A "Use ARP Cloud account" redirect; Option B "Generate now (advanced)" browser-side). Mobile handoff note at `docs/ARP-phase-8-5-mobile-repo-changes.md` — docs-only edits to apply in a future `arp-mobile` session. 9 commits, 73 files, all gates green. Phase 8.5 observations for Phase 9: (1) localStorage key + phrase storage is interim; WebAuthn/passkey is Phase 9+ polish; (2) seed-KDF is 16-byte entropy padded; HKDF migration needs an identity-rotation UX plan; (3) v2.1 spec references `arp.cloud/onboard` + `/internal/registrar/bind` endpoints that ship in Phase 9.
10. **Phase 8.75 — Brand & Design Scaffold.** Ingested a Swiss / editorial design reference (paper + ink neutrals, signal blue/red/yellow/green; Space Grotesk display, Instrument Sans body, JetBrains Mono). Bootstrapped `apps/cloud` Tailwind pipeline (previously installed but unconfigured): `tailwind.config.ts` with semantic CSS-var-driven tokens, `globals.css` with directives + dark-mode override + reduced-motion guard. 16 UI primitives at `apps/cloud/components/ui/` (Button, Card, Container, Grid12, Section, PlateHead, FeatureCard, PricingCard, Hero suite, Nav, Ticker, Footer/FooterNewsletter, Badge, Input, Divider, Code, Pre, Dot, IconShape, Link). Three-surface host dispatch in `middleware.ts` — `arp.run` → project landing, `cloud.arp.run` → cloud marketing, `app.arp.run` → authenticated dashboard. HNS gateway branch preserved + tightened (`.agent` TLD check prevents the old `arp.run` → `did:web:run` edge case). Existing flows (onboarding, dashboard, billing, agent) restyled end-to-end with no URL regressions. Placeholder copy + `[TBD]` pricing throughout; Phase 9 fills real content. 7 commits, 49 files, 5,176 insertions. Phase 8.75 observations for Phase 9: (1) design system stays under `apps/cloud/` for now; extract to `@kybernesis/arp-ui` at launch prep; (2) dark theme exposed via `[data-theme="dark"]` but no toggle wired — Phase 9 decides; (3) Google Fonts via `<link>` not `next/font` — migrate for size budgets; (4) Fumadocs spec/docs/status sites must match via CSS-var slots.

11. **Phase 9 slice 9a — Public sites + UI extraction + schema scrub.** `apps/spec-site` (Next.js 16 + `@next/mdx`; 42 prerendered routes: spec pages, docs, interactive scope catalog viewer, schema browser, RFC process with 3 seed RFCs). Extracted Phase-8.75 design system to new private package `@kybernesis/arp-ui` — `apps/cloud` + `apps/spec-site` both consume the shared preset + CSS partials (zero drift guaranteed). Closed a Phase-8.5 regression: `.describe()` strings in `packages/spec/src/schemas/*.ts` contained `did:web:ian.self.xyz` example values that were re-emitted into published `packages/spec/json-schema/*.json` — scrubbed + added regression probe in `apps/spec-site/tests/bundle.test.ts`. 4 commits + 1 post-merge hotfix (prebuild script needed to run before typecheck + lint on cold CI). **Brief deviation:** Fumadocs → `@next/mdx` (Fumadocs v16 requires Tailwind 4; migration cascade out of scope). Spirit of v0 decision "no hand-roll" preserved — `@next/mdx` is Next's first-party MDX. Search/TOC become additive (Pagefind at launch if needed). **Deploy status:** `apps/cloud` production redeployed via `vercel --prod` (auto-deploy hook still broken); spec.arp.run / docs.arp.run attachment is a separate user-authorized Vercel project setup not yet done.

12. **Ops — Vercel auto-deploy via GitHub Actions (PRs #22–#25).** `.github/workflows/deploy.yml` replaces the broken native Vercel GitHub integration. Two `configure-*` jobs PATCH project settings via the Vercel REST API (arp-cloud + arp-spec-site both now have turbo-topology buildCommands so upstream workspace packages like `@kybernesis/arp-ui` build before the app); `spec.arp.run` + `docs.arp.run` attached via API on first run. Two `deploy-*` jobs run `vercel pull + build + deploy --prebuilt`. Uses `VERCEL_TOKEN` repo secret. Four PRs to settle: (a) PR #22 initial; (b) PR #23 dropped `--cwd` path-doubling; (c) PR #24 added `set -euo pipefail` + surface PATCH errors + `configure-cloud` job; (d) PR #25 dropped `includeFilesOutsideRootDirectory` (Vercel v10 PATCH rejects it as additional property — pnpm workspace detection handles parent-file access automatically once rootDirectory is set). Every `main` push now refreshes both production sites within ~2 min.
13. **Phase 9 slice 9b — Cloud v2.1 registrar endpoints + push register.** Five new routes: `GET /onboard` (v2.1 Option-A entry point; reuses browser did:key flow; redirects back to callback with `principal_did=did:web:arp.cloud:u:<uuid>&signed_representation_jwt=<jwt>`), `POST /internal/registrar/bind` (PSK-gated constant-time compare; upsert on `(domain, owner_label)`), `GET /u/<uuid>/did.json` (cloud-managed DID doc publishing the same pubkey as the user's did:key so JWT verification round-trips without cloud-held keys), `POST /api/onboard/complete` (helper; session-authed; principal-DID cross-check), `POST /api/push/register` (session-authed via `TenantDb.upsertPushRegistration`). Drizzle migration `0002_phase_9b_registrar_and_push.sql` (additive-only; PGlite runner now applies every `NNNN_*.sql` in order). Middleware passthrough for `/onboard` `/internal` `/u`. 6 commits + 1 in-branch hotfix (bumped `hookTimeout` on pglite-using vitest configs — CI's slower VM exceeded the 10s default hook timeout once the migration runner applied 2 migrations). **Representation JWT signing conservative call:** v2.1 §3.3 describes server-side cloud-held keys; Phase 8.5 holds keys only in browser — slice 9b publishes the user's did:key pubkey at `/u/<uuid>/did.json` so the flow still round-trips. Slice 9d WebAuthn changes this. **Rate limiting deferred to 9c.** **Post-merge actions required by Ian:** generate + set `ARP_CLOUD_REGISTRAR_PSK` in Vercel env secrets (`openssl rand -base64 32`); apply migration 0002 to production Neon via `packages/cloud-db/migrate-once.mjs` pattern. Auto-deploy completed; **`/onboard` currently returns HTTP 500 on live because migration 0002 is not yet applied — INSERT into `onboarding_sessions` fails**; resolved as soon as Ian runs the migration.

### Phases remaining
- **Phase 9 remaining slices — Headless Integration + Public Launch.** 9c (rate limiting + 3 new testkit probes + broader Self.xyz test-fixture sweep across `packages/*/tests`), 9d (WebAuthn + HKDF migration), 9e (Headless sign-off + promotion + Milestone B production flip: sandbox → live Stripe, SSO "All Deployments" toggle, legal pages).
- **Phase 10 — Mobile public launch.** iOS App Store + Google Play Store submissions. Prereq: Phase 9 ships. Apple Dev account + EAS credentials + Play Console setup required.

### Domain decision (logged)
User registered **`arp.run`** on 2026-04-23. Milestone A wired `arp.run`, `cloud.arp.run`, `app.arp.run` to the Vercel project. Phase 9 still owns `spec.arp.run` + `docs.arp.run`. Branding remains "ARP" — user considered "Dispatch" as a product brand on top of ARP-the-protocol but committed to ARP branding for now. Can revisit at Phase 9 launch prep.

### Milestone A — ARP Cloud live (staging, 2026-04-23/24)
- Vercel project `arp-cloud` in `ian-darkstarvccs-projects` team (Pro plan)
- Root Directory `apps/cloud`, framework Next.js, `DATABASE_URL` + 15 other Postgres vars auto-injected from attached Neon (`arp-cloud-dev`)
- Stripe sandbox wired (test keys in Vercel env, webhook endpoint registered at `cloud.arp.run/api/webhooks/stripe`, `whsec_...` as sensitive env var)
- Custom domains attached + verified: `arp.run`, `cloud.arp.run`, `app.arp.run`. Vercel manages DNS now.
- Deployment Protection (free-tier): `all_except_custom_domains` — Vercel deployment URLs require Vercel login; custom domains remain public. User is on Pro and can flip to "All Deployments" via dashboard when ready to gate custom domains (API rejected the toggle with `invalid_sso_protection`; dashboard path works).
- One-time migration applied to Neon (23 statements → 9 tables: agents, audit_entries, connections, messages, principal_sessions, revocations, stripe_events, tenants, usage_counters). Script at `packages/cloud-db/migrate-once.mjs` (gitignored).
- Phase 7 conservative call #1 closed: PR #11 added `@kybernesis/arp-cloud-db/neon` HTTP driver (via `@neondatabase/serverless` + `drizzle-orm/neon-http`). `apps/cloud/lib/db.ts` selects Neon when `DATABASE_URL` is set, PGlite otherwise. Closed Milestone-A-breaking 500 on webhook POSTs that was caused by PGlite trying to `readFileSync(migrations)` inside Vercel's read-only serverless bundle.
- Webhook path verified: `curl -X POST cloud.arp.run/api/webhooks/stripe -H 'Stripe-Signature: fake'` returns `400 bad_signature` (expected — signature check now reachable; previously crashed before it got there).

### Deferred
- **Phase 5B** — live deployment of reference agents on real `.agent` domains + real VPSes. Blocked on Option A decision (no user testing until 7-9 ship).
- **Ian ↔ Janice live pairing test** — runbook at `~/Desktop/ARP-first-pairing-ian-janice.md` is shelved. Don't bring this up again unless Ian asks.
- **CrewAI + MCP adapters** (Phase 6 stretch) — deferred to v1.1.

---

## 2. The operating model (three-party setup)

This build is coordinated across three roles:

| Role | Who | Job |
|---|---|---|
| **Human operator** | Ian | Decides scope, approves pushes, signs off on phase PRs, provisions real infrastructure (domains, accounts, keys) |
| **Coordinating Claude** | This continuing session | Gives Ian the opener for each phase, reviews phase outputs when they return, handles push + PR + auto-merge + CI watch, writes fix commits when review finds gaps, gives the next phase's opener |
| **Executing Claude** | A fresh Claude Code session per phase | Paste-loads the opener + phase brief. Executes autonomously. Commits atomically. Reports back with acceptance-gate results + conservative-call flags. Never pushes. |

### The phase lifecycle

```
1. Coordinating Claude writes phase-N opener  →  Ian
                                                  │
                                                  │ pastes into fresh Claude Code session
                                                  ▼
2.                                          Executing Claude (Phase N)
                                                  │
                                                  │ builds + commits locally
                                                  │ runs all acceptance gates
                                                  │ writes status report
                                                  ▼
3. Ian relays the status report                →  Coordinating Claude
                                                  │
                                                  │ review-pass checklist
                                                  │ spot-checks code
                                                  │ runs cold-cache gate
                                                  │ finds gaps → fixes them
                                                  │ commits fix(es)
                                                  │ pushes branch
                                                  │ opens PR
                                                  │ auto-merges
                                                  │ watches CI on main
                                                  │ hotfixes if CI fails
                                                  ▼
4. Coordinating Claude writes phase-(N+1) opener  →  back to step 1
```

### Why this model works

- **Executing Claude gets full attention for building.** No context split; just executes the brief.
- **Coordinating Claude keeps the design state.** Reviews with fresh eyes that know the cross-phase invariants.
- **Ian is the only source of infra decisions.** Never autonomous on anything that affects shared state (domains, prod, credentials).
- **Phase doc + opener is the contract.** Phase doc is the "what to build"; opener is the "how to operate in this specific session" (hard constraints, override rules, acceptance criteria).
- **Every phase ends with a git commit that passes CI on main.** No WIP branches, no stale PRs. Linear history of phases.

---

## 3. Phase opener template

The opener is ~150 lines of pasteable text that a fresh Claude Code session uses as its first message. Structure:

```
I'm building ARP (Agent Relationship Protocol). The repo is at ~/arp
(`github.com/KybernesisAI/arp`). All design + phase docs are in docs/*.md.

Phase <N-1> is merged on `main`. Start Phase <N> from a fresh checkout:

  git checkout main
  git pull origin main
  git checkout -b phase-<N>-<short-name>
  pnpm install

## Phase <N>: <Full Name>

Read these in order, then execute:

1. docs/ARP-phase-0-roadmap.md — orientation, global tech pins, ...
2. docs/ARP-phase-<N>-<name>.md — THE PHASE BRIEF. Execute end-to-end.

Reference as needed (don't re-read unless relevant to a specific task):
- <relevant companion docs>

## Execution rules

- Operate autonomously. Don't ask clarifying questions unless a phase doc's
  instructions genuinely conflict — otherwise pick the conservative option
  and flag it in the PR description.
- Work on branch `phase-<N>-<short-name>`. Conventional commits scoped per
  package (e.g. `feat(runtime): ...`, `feat(cloud): ...`) with task numbers:
  `[phase-<N>/task-<M>]`.
- When all tasks are done and the global "done" checklist passes, report
  results and wait for my approval to push.

## Critical Phase-<N> rules (override anything in the docs)

<phase-specific hard rules — e.g. tenant isolation, size budgets, feature
flags, no-live-infrastructure caveats>

## Hard constraints (persistent across all phases)

- No `npm publish`. Release pipeline stays dormant until Phase 9.
- No destructive git operations (force-push, hard-reset, branch deletion
  without confirmation).
- No `--no-verify` on commits.
- Do not push the branch to origin without my explicit approval.
- `.env*` files stay gitignored.
- GitHub Actions workflow commits require the `workflow` scope on the token.

## Acceptance

Phase <N> is done when every box in docs/ARP-phase-<N>-<name>.md §1 is
checked AND the global "done" list in the roadmap is green. Specifically:

<phase-specific concrete acceptance gates>

Report the results of:

  pnpm install
  pnpm run typecheck
  pnpm run build
  pnpm run test
  pnpm run lint
  <any phase-specific filter commands>

Start by reading docs/ARP-phase-0-roadmap.md now, then proceed to Phase <N>
Task 1 (<first task name>). No summary or plan first — execute.
```

### What changes per phase

- Phase number + name + branch name
- The "Read these in order" list's item #2 pointing at the right phase doc
- Companion doc list (specific to that phase's scope)
- Critical Phase-N rules (new + any old ones worth re-flagging)
- Acceptance criteria's phase-specific bits
- The final "Task 1" mention

### What stays identical

- Cross-phase hard constraints (`npm publish`, destructive git, `.env`, workflow scope)
- Execution rules (autonomous, conservative, atomic commits, wait for approval)
- The gate-command list (`install`, `typecheck`, `build`, `test`, `lint`)

---

## 4. Review-pass protocol

When Ian pastes a status report from an executing Claude session, the coordinating Claude runs this protocol. Do not skip steps.

### Step 1 — Branch state sanity

```bash
cd /Users/ianborders/arp
git status                                      # working tree clean?
git log --oneline origin/main..<branch>         # expected commits present?
```

If the executing Claude left uncommitted files, commit them logically before pushing. If commits are missing, investigate before trusting the status report.

### Step 2 — Cross-phase invariants

```bash
# DIDComm isolation — only @kybernesis/arp-transport may import DIDComm libs
grep -rn "@veramo/did-comm\|didjwt" --include="*.ts" --include="*.json" \
  packages/ apps/ adapters/ examples/ 2>/dev/null \
  | grep -v node_modules | grep -v packages/transport/
# MUST return empty.

# Manifest gitignore still in place
git check-ignore packages/scope-catalog/generated/manifest.json
# MUST return the path (ignored).

# npm scope consistency
grep -rn '"name": "@arp/' --include="*.json" . 2>/dev/null | grep -v node_modules
# MUST return empty. Everything is @kybernesis/arp-*.
```

### Step 3 — Phase-specific risk spot-check

(See `CLAUDE.md §7` for the per-phase risk list.)

### Step 4 — Cold-cache gate

```bash
rm -rf packages/*/dist apps/*/dist adapters/*/dist \
       packages/create-adapter/dist packages/*/json-schema \
       packages/scope-catalog/generated \
       node_modules packages/*/node_modules apps/*/node_modules \
       adapters/*/node_modules tests/*/node_modules \
       examples/*/node_modules
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm run test
pnpm run lint
```

All four must exit 0. Plus the phase's specific acceptance filter:

```bash
pnpm --filter @kybernesis/arp-phase-<N>-acceptance test
```

### Step 5 — Decide: fix now vs defer

If review found a real correctness gap (vs. a flagged conservative call):
- **Fix-now** if scope is small (≤30 LOC + a test): add the fix + a regression test, commit as `fix(<package>): <description> [phase-<N>/review]`, rerun gates
- **Defer** if scope is larger: document in PR body as a tracked item for next phase

Conservative calls flagged by the executing Claude are usually fine as-is, unless they mask a real bug (Phase 5's obligations-in-audit was an example).

### Step 6 — Push, PR, auto-merge

```bash
git push -u origin <branch>

gh pr create --base main --head <branch> \
  --title "Phase <N>: <full title>" \
  --body "$(cat <<'EOF'
## Phase <N> — <name>

<intro paragraph>

## Acceptance gates (all green on cold cache)
<gate results>

## What ships
<one section per major package>

## Conservative calls
<numbered list, each item documented>

## Review-pass additions
<any fix commits I added during review>

## Commits
<git log output>

## Handoff to Phase <N+1>
<what the next phase consumes>

## Done-when checklist (all ticked)
<phase doc §1 list with boxes>
EOF
)"

gh pr merge <PR#> --auto --squash --delete-branch
```

### Step 7 — Watch CI on main

```bash
sleep 10  # give GitHub a moment to queue the workflow
RUN_ID=$(gh run list --branch main --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

### Step 8 — CI failed post-merge? Hotfix pattern

If CI on main is red after a phase merge:

```bash
git checkout main && git pull origin main
git checkout -b fix-<short-description>
# make the fix + regression test
git commit -m "fix(...): ... [phase-<N>/post-merge]"
git push -u origin fix-<short-description>
gh pr create --base main --head fix-<short-description> \
  --title "fix(...): <description>" --body "<short explanation>"
gh pr merge <PR#> --auto --squash --delete-branch
# watch CI on main again
```

Historical hotfixes: PR #2 (Turborepo ordering), PR #5 (drain settle race).

### Step 9 — Sync local, prune, log

```bash
git checkout main && git pull origin main
git fetch --prune origin
git branch -D <old-phase-branch> 2>/dev/null
git log --oneline -10
```

### Step 10 — Update `CLAUDE.md` + this doc

- Bump the phase status table in `CLAUDE.md §5`
- Update "Current state of the build" in this doc
- Commit + push directly to main as `docs(handoff): update for phase <N> merge` (don't need a PR for doc-only updates)

### Step 11 — Write the next opener

Hand Ian the paste-ready opener for Phase N+1.

---

## 5. Cross-phase invariants (locked decisions, do not revisit)

These were decided in earlier phases. Do not re-debate without explicit user ask.

1. **npm scope is `@kybernesis`**, not `@arp`. The `@arp` scope is unavailable. All packages are `@kybernesis/arp-spec`, `@kybernesis/arp-adapter-kyberbot`, etc.
2. **GHCR namespace is `ghcr.io/kybernesisai`** (lowercase per GHCR rules, derived from the GitHub org `KybernesisAI`).
3. **DIDComm isolation.** Only `@kybernesis/arp-transport` imports DIDComm-adjacent libraries. Every other package talks to it via the `Transport` interface. This keeps A2A transport as a future drop-in.
4. **DID-pinned TLS for agent endpoints.** No Let's Encrypt for the agent-facing path; the sidecar generates a self-signed cert and pins the fingerprint in the DID doc. Web PKI is only used at human-facing endpoints (gateway, SaaS, tunnel endpoints).
5. **Owners are attributes, not parents.** Agent DID (`did:web:samantha.agent`) is sovereign; the owner DID is a `principal` attribute in the DID document, not a naming hierarchy parent. Never compose names as `{owner}.{tld}`; always as `{agent}.{tld}` with `{owner}.{agent}.{tld}` as the owner subdomain.
6. **Cedar uses integer cents + epoch-ms in context.** No floats, no ISO strings inside policies. Documented in `packages/pdp/README.md`.
7. **Obligations merge into audit + replies.** `runtime.ts` computes `effectiveObligations = [...record.token.obligations, ...decision.obligations]` once per request and uses it in both the audit entry and outbound reply body.
8. **`packages/scope-catalog/generated/` is gitignored.** Rebuilds from YAML on every `pnpm run build`.
9. **Phase 6 framework adapters use structural projections** (`KyberBotLike`, `OpenClawLike`, etc.) rather than real framework deps. Real wiring validates at Phase 9 prep. LangGraph uses the real `@langchain/langgraph` package as the exception.
10. **No live user testing until Phase 7-9 ship (Option A).** Build the consumer UX before asking anyone non-technical to touch the stack. Ian ↔ Janice pairing is shelved.

---

## 6. User preferences (accumulated)

- **Ian Borders**, founder of Kybernesis. Builder of KyberBot. Tech-capable (shell, git, Docker, npm) but not a full-time engineer. Prefers to delegate build work to Claude Code and focus on product + infrastructure decisions.
- **Timezone:** Bangkok (per Atlas's identity.yaml).
- **Communication style:** concise. Bullets > paragraphs. Direct over diplomatic. Will push back when something sounds convoluted or overengineered — good signal to reset and simplify.
- **Build philosophy:** ship once it's right, not MVP-then-polish. Chose Option A (no user testing until 7-9 done). Willing to wait for the right product rather than duct-tape now.
- **Ecosystem:** owns `.agent` TLD (in partnership with Headless Domains). Running KyberBot locally with Atlas as the primary agent. Uses Tailscale. Has a paid ngrok. Has iCloud-synced Obsidian for notes (`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Samantha/`).
- **Workflow:** opens each phase in a fresh Claude Code session with the opener I provide. Relays the status report back. Trusts me to handle review + push + PR + merge autonomously.

---

## 7. External coordination state

### Headless Domains
- Shipped TLD-side integration in parallel with our Phase 4
- Details in `docs/ARP-headless-parallel-build.md` (the brief we gave them) + their response letter archived in `~/Desktop/arp_response_letter.md`
- Their provisioner (`utils/arp_provisioner.py`) is a Python port of `@kybernesis/arp-templates`
- Drift risk: their port must stay in sync with our Zod schemas. Mitigation tracked in `CLAUDE.md §9`.
- Ask bundled for Phase 9 coordination: Custom DIDComm endpoint URL field in Setup ARP Local flow

### Self.xyz
**Self.xyz** — removed in Phase 8.5. The `@kybernesis/arp-selfxyz-bridge` package has been deleted. Consent UI renders VC type identifiers generically. See `docs/ARP-phase-8-5-auth-identity-shift.md`.

### Handshake / HNS
- `.agent` TLD available
- Resolution via DoH (`hnsdoh.com/dns-query`) — baked into `@kybernesis/arp-resolver`
- Browser resolution requires HNS.to gateway or extension — documented in `ARP-hns-resolution.md`
- Atlas, samantha.agent, janice.agent are registered

---

## 8. Tooling reference

### GitHub CLI
- Requires `workflow` scope for commits touching `.github/workflows/*`
- If push rejected for scope: `gh auth refresh -h github.com -s workflow`

### Auto-merge pattern
- Repo is configured for squash-merge + auto-merge + branch-delete
- `gh pr merge <N> --auto --squash --delete-branch` queues the merge for when checks pass (or merges immediately if no required checks)
- Don't force-push a branch with an open auto-merge PR

### Turborepo
- Root `package.json` scripts route through `turbo run`: `pnpm run build` → `turbo run build`
- `turbo.json` declares `^build` dependency on `test`, `typecheck` so upstream packages build first
- Never use `pnpm -r <task>` in CI; that runs in parallel without ordering (caused the PR #2 hotfix)

### Docker
- Multi-stage `node:24-alpine` Dockerfile under `apps/sidecar/`
- `tini` as PID 1 for signal forwarding
- Image size target: ≤300 MB (current: 72.7 MB)
- First-boot idempotent (tested in `tests/phase-3/bootstrap.test.ts` + `atlas-smoke.sh`)

### pnpm
- v10+ required
- Workspaces: `pnpm-workspace.yaml` enumerates `packages/*`, `apps/*`, `adapters/*`, `tests/*`, `examples/*`
- For Docker builds: `pnpm --filter <pkg> deploy --prod --legacy /out` (needs `--legacy` for v10)

---

## 9. Recurring patterns worth knowing

### Fix-now during review
The coordinating Claude has closed real bugs during review that the executing session missed. Track record:
- **Phase 1 review:** added missing inheritance regression test for scope-catalog bundle compiler (conservative-call #4 wasn't exercised by any test)
- **Phase 2 review:** added PDP README section documenting Cedar cents + epoch-ms context convention (worked-examples tests used it but the convention wasn't surfaced for future consumers)
- **Phase 5 review:** fixed `record.token.obligations` being dropped into `effectiveObligations = [...]` merge, added regression test (conservative-call #1 was a real bug, not a conscious trade-off)

Expect similar finds. The executing sessions are thorough on what their brief asks; the coordinating review catches what the brief didn't ask about.

### Post-merge CI hotfix
Twice so far CI on main has gone red after a phase merged:
- **PR #2 fix:** `pnpm -r typecheck` doesn't respect turbo `^build` ordering; routed CI through `pnpm run <task>` (which goes through turbo)
- **PR #5 fix:** drain test race on slower CI runners; added a settle period before the quiescence poll

Both were ≤30 LOC fixes shipped as their own PR, auto-merged within minutes. Don't roll back a phase PR for these.

### Manifest drift (closed)
Phase 5 finally killed the `packages/scope-catalog/generated/manifest.json` wall-clock timestamp drift by adding `packages/scope-catalog/generated/` to `.gitignore`. Regenerated on every build. Before that, I was reverting the file on every review. Don't regress this.

---

## 10. File map (where things live)

```
/Users/ianborders/arp/                              # the repo, always cd here
├── CLAUDE.md                                        # project context for any Claude session
├── docs/                                            # all design + phase + handoff docs
│   ├── ARP-architecture.md
│   ├── ARP-phase-0-roadmap.md
│   ├── ARP-phase-<1..9>-*.md
│   ├── ARP-session-handoff.md                       # THIS DOC
│   ├── ARP-adapter-authoring-guide.md
│   ├── ARP-headless-parallel-build.md               # what we gave Headless
│   ├── ARP-headless-card-bridging.md                # how their card coexists with ours
│   ├── ARP-installation-and-hosting.md
│   ├── ARP-tld-integration-spec-v2.md               # Headless implements this
│   ├── ARP-scope-catalog-v1.md
│   ├── ARP-policy-examples.md
│   └── ...
├── packages/
│   ├── spec/                                        # @kybernesis/arp-spec
│   ├── templates/                                   # @kybernesis/arp-templates
│   ├── scope-catalog/                               # @kybernesis/arp-scope-catalog
│   ├── runtime/                                     # @kybernesis/arp-runtime
│   ├── pdp/                                         # @kybernesis/arp-pdp
│   ├── transport/                                   # @kybernesis/arp-transport — SOLE DIDComm importer
│   ├── registry/                                    # @kybernesis/arp-registry
│   ├── audit/                                       # @kybernesis/arp-audit
│   ├── resolver/                                    # @kybernesis/arp-resolver
│   ├── tls/                                         # @kybernesis/arp-tls
│   ├── pairing/                                     # @kybernesis/arp-pairing
│   ├── consent-ui/                                  # @kybernesis/arp-consent-ui
│   ├── testkit/                                     # @kybernesis/arp-testkit
│   ├── sdk/                                         # @kybernesis/arp-sdk
│   ├── create-adapter/                              # @kybernesis/arp-create-adapter
│   └── arp-adapter-skill/                           # the published Claude Code skill
├── apps/
│   ├── runtime-bin/                                 # reference runtime binary (Phase 2)
│   ├── sidecar/                                     # Docker sidecar (Phase 3)
│   ├── owner-app/                                   # Next.js owner app (Phase 4)
│   ├── samantha-reference/                          # reference agent config (Phase 5, not deployed)
│   └── ghost-reference/                             # reference agent config (Phase 5, not deployed)
├── adapters/
│   ├── kyberbot/
│   ├── openclaw/
│   ├── hermes-agent/
│   ├── nanoclaw/
│   └── langgraph/
├── examples/
│   ├── kyberbot-atlas/
│   ├── openclaw-demo/
│   ├── hermes-demo/
│   ├── nanoclaw-demo/
│   └── langgraph-research-agent/
├── python/
│   └── arp-sdk/                                     # Python SDK scaffold (moves to separate repo at Phase 9 publish)
├── tests/
│   ├── phase-1/
│   ├── phase-2/
│   ├── phase-3/
│   ├── phase-4/
│   ├── phase-5/
│   └── phase-6/
├── scripts/
│   └── validate-image-size.sh
├── demos/
│   ├── pair-samantha-ghost.sh
│   ├── cross-connection-isolation.sh
│   └── revoke-and-verify.sh
├── .changeset/                                      # queued release bumps (dormant until Phase 9)
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── release.yml                              # dormant until Phase 9
│       ├── image-publish.yml                        # dormant until Phase 9
│       └── testkit-nightly.yml                      # dormant until Phase 5B populates TESTKIT_TARGET_DOMAINS
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore
└── LICENSE (MIT)
```

```
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Samantha/   # Ian's Obsidian mirror
└── ARP-*.md                                         # every doc in the repo is also here
```

```
/Users/ianborders/.claude/projects/-Users-ianborders-dispatch/memory/
├── MEMORY.md                                        # index
├── arp-project.md                                   # project context memory
├── arp-session-model.md                             # operating model memory
└── user-ian.md                                      # user profile memory
```

---

## 11. How to resume

If you are a continuing Claude and your context just compacted:

1. Read `/Users/ianborders/arp/CLAUDE.md` (overall project rules)
2. Read this file (`docs/ARP-session-handoff.md` — specific session state)
3. `git log origin/main --oneline -10` in the repo to confirm current state
4. If a phase is in flight on a branch: `git status` on that branch
5. If the user asks for the next opener: consult §1 "Phases remaining" above + `docs/ARP-phase-0-roadmap.md`; use the opener template in §3 above

If the user says "what were we doing", read this doc top to bottom and answer from §1 + §7 (open external coordination items).

If the user says "next phase opener", §12 below has the up-to-date one.

---

## 12. Next phase: Phase 7 — ARP Cloud

See `docs/ARP-phase-7-cloud.md` for the full brief. Opener template for the next fresh Claude Code session is in Ian's hands (given alongside this handoff doc).

Phase 7 dependencies requiring Ian's real-world infra decisions (flag these as human-in-the-loop, not autonomous):
- Vercel account + team provisioning (free tier OK for dev)
- Neon Postgres via Vercel Marketplace (free tier OK for dev)
- Stripe account (test keys OK for dev; live keys at Phase 9)
- `arp.cloud` or equivalent ICANN domain (deferred — Phase 9 registration; meanwhile `arp.spec` stays as a placeholder label)

The phase can build all the code without these; deployment to real infra waits for Phase 9.

---

*Session handoff v1.0 — generated at end of Phase 6. Update §1 after each phase merge. Update §7 when external coordination changes.*
