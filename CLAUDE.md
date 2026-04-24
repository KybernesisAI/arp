# ARP — Claude Code Project Context

> **You (Claude) are now working in the Agent Relationship Protocol (ARP) monorepo.**
> Read this file end-to-end before taking any action. It is the single source
> of truth for project conventions, operating rules, and the current state of the
> build.

---

## 1. What ARP is

ARP is the communication + permissions layer for agent-to-agent interaction, sitting on top of Handshake `.agent` domains + method-agnostic principal identity (did:key default for browser-held owner keys; did:web for sovereign or cloud-managed principals). It's a **protocol + reference implementation**, not a product. The seven-layer stack is in `docs/ARP-architecture.md`. Read that before architectural decisions.

The team: **Ian Borders** is the human operator (Kybernesis founder, builder of KyberBot). Headless Domains operates the `.agent` TLD on their side in parallel. Claude Code is the primary build agent.

## 2. Repo + infrastructure

| Thing | Value |
|---|---|
| GitHub repo | `github.com/KybernesisAI/arp` |
| Local path | `/Users/ianborders/arp` |
| Default branch | `main` |
| npm scope | `@kybernesis` (NOT `@arp` — unavailable on npm) |
| GHCR namespace | `ghcr.io/kybernesisai` (lowercase per GHCR rules) |
| Spec domain (placeholder) | `arp.spec` — not registered yet, used as a label in docs |
| License | MIT |

## 3. Tech pins (don't deviate without flagging in the PR description)

- **Language:** TypeScript 5.5+, strict mode, no `any`
- **Runtime:** Node.js 24 LTS
- **Package manager:** pnpm 10+ with workspaces
- **Monorepo tool:** Turborepo (`pnpm run <task>` routes through `turbo run <task>` — respects `^build` ordering)
- **HTTP:** Hono
- **Web UI:** Next.js 16 App Router (RSC-first), Tailwind, shadcn/ui
- **Mobile:** React Native via Expo (Phase 8 only; not yet built)
- **Hosting:** Vercel (Fluid Compute) for cloud-side; sidecar runs anywhere Docker does
- **Storage:** SQLite (`better-sqlite3`) for agent-local; Neon Postgres for multi-tenant Cloud (Phase 7)
- **Crypto:** `@noble/ed25519`, `jose`, `canonicalize` (RFC 8785 JCS)
- **Cedar:** `@cedar-policy/cedar-wasm` with an ARP extension for `@obligation(...)` annotations
- **DIDComm:** signed JWM via `@noble/ed25519` + `jose` directly (Phase 2 chose not to use `@veramo/did-comm` for weight reasons)
- **HNS resolution:** DoH against `https://hnsdoh.com/dns-query`
- **Testing:** vitest; Playwright for Next.js E2E
- **CI:** GitHub Actions; `actions/setup-node@v4` with pnpm cache
- **Release:** Changesets for npm packages. **Dormant until Phase 9.**

## 4. Cross-phase invariants (HARD RULES — do not violate)

1. **Never import DIDComm-adjacent libraries outside `@kybernesis/arp-transport`.** The `Transport` interface is the single isolation point. A2A swap-in depends on it. If you reach for `@veramo/did-comm` or `didjwt` from `@kybernesis/arp-runtime` or any adapter — stop. Extend the Transport interface instead.
2. **Never `npm publish` before Phase 9.** The release workflow exists but stays dormant. Publishing stays on the `next` tag only.
3. **Never push a branch to origin without explicit user approval.** Execute locally, commit locally, wait for the human to say push.
4. **Never force-push, hard-reset, or use `--no-verify`.** If a hook fails, investigate.
5. **Never commit `.env*` files or keys.** They're gitignored. Private keys belong in the sidecar's data dir (0600), not in the repo.
6. **Every well-known document payload must validate against its JSON Schema in `packages/spec/json-schema/*.json`.** Templates in `packages/templates/` are the source of truth for shapes; any divergence is a bug.
7. **Scope catalog obligations must merge into audit entries + outbound replies.** See `packages/runtime/src/runtime.ts` `effectiveObligations` — do not drop `record.token.obligations` on the floor.
8. **Owners are attributes, not parents.** The agent's DID (`did:web:samantha.agent`) is sovereign; the owner DID is published as an attribute inside the DID document, not as a naming hierarchy parent. See `docs/ARP-architecture.md §Core design principle`.
9. **`packages/scope-catalog/generated/` is gitignored.** Rebuilds from YAML on every `pnpm run build`. Never hand-edit. Never stage it.
10. **No `@arp/*` package names.** All packages use `@kybernesis/arp-*` (e.g. `@kybernesis/arp-spec`, `@kybernesis/arp-adapter-kyberbot`).

## 5. Phase system — how we ship

Every build increment is scoped as a **phase**. Phase briefs live in `docs/ARP-phase-<N>-<name>.md` and are written in **lockdown style** — they pin tech, enumerate atomic tasks, define acceptance gates, and forbid asking clarifying questions mid-run. A fresh Claude Code session paste-loads the phase brief and executes autonomously.

**Build sequence:**

| # | Phase | Doc | Status |
|---|---|---|---|
| 0 | Roadmap & global rules | `docs/ARP-phase-0-roadmap.md` | reference |
| 1 | Shared Contract (`@kybernesis/arp-spec`, `templates`, `scope-catalog`) | `docs/ARP-phase-1-shared-contract.md` | ✅ merged (PR #1) |
| 2 | Runtime Core (PDP, transport, registry, audit, resolver, TLS) | `docs/ARP-phase-2-runtime-core.md` | ✅ merged (PR #3) |
| 3 | Sidecar Packaging (Docker, systemd, first-boot) | `docs/ARP-phase-3-sidecar.md` | ✅ merged (PR #4) |
| 4 | Pairing + Owner App (Next.js + admin API) | `docs/ARP-phase-4-pairing-owner-app.md` | ✅ merged (PR #6) |
| 5 | Reference Agents + Testkit (local scope) | `docs/ARP-phase-5-reference-agents-testkit.md` | ✅ merged (PR #7) |
| 6 | SDKs + 5 required adapters + authoring CLI + skill | `docs/ARP-phase-6-sdks-adapters.md` | ✅ merged (PR #8) |
| 7 | ARP Cloud (multi-tenant, outbound client, Stripe) | `docs/ARP-phase-7-cloud.md` | ✅ merged (PR #9) + drain fix (PR #10) + Neon HTTP driver (PR #11) |
| 8 | Mobile Apps (iOS + Android via Expo) | `docs/ARP-phase-8-mobile.md` | ✅ scaffold merged (PR #12 monorepo pointer; app at `github.com/KybernesisAI/arp-mobile`) — public launch deferred to Phase 10 |
| 8.5 | Auth & Identity Shift (Self.xyz demotion + did:key + terminology) | `docs/ARP-phase-8-5-auth-identity-shift.md` | ✅ merged (PR #14) |
| 8.75 | Brand & Design Scaffold (Swiss / editorial system, three-surface middleware, placeholder pages) | design spec: `docs/ARP-design-system.md` | ✅ merged (PR #17) |
| 9 | Headless Integration + Public Launch | `docs/ARP-phase-9-launch.md` | **in flight** — 9a public sites (PR #19+#20), 9b cloud v2.1 endpoints + push register (PR #26, hook-timeout in-branch hotfix), 9c-9e pending |

Phases 5B (live deployment of reference agents), 7, and 8 can run in parallel from `main` once the prior phase's runtime layer is stable.

**Parallel hot-fix pattern:** if a post-merge CI run on `main` fails, cut a tiny fix branch off `main`, commit the minimum fix, open a PR, `gh pr merge --auto --squash --delete-branch`. Don't roll back the phase commit — fix forward.

## 6. Operating rules for THIS repo

- **Branch naming:** `phase-<N>-<short-name>`, `fix-<short-description>`, `ci-<short-description>`, `docs-<short-description>`.
- **Commit style:** conventional commits scoped to the affected package (e.g. `feat(runtime): ...`, `fix(scope-catalog): ...`, `docs(pdp): ...`, `ci: ...`) with task numbers: `[phase-N/task-M]` or `[phase-N/review]`.
- **Commit cadence:** one logical change per commit. Don't mash unrelated edits. PRs are squash-merged anyway, so atomic commits show up as the PR history.
- **PR body:** include acceptance gate results, conservative-calls list, commits list, handoff note for next phase, done-when checklist.
- **Merge:** `gh pr merge <N> --auto --squash --delete-branch`. Auto-merge queues once CI passes or merges immediately if no required checks are configured. Pre-Phase-9, checks aren't blocking — be careful about post-merge CI regressions.
- **Delete branches** after merge. `git fetch --prune origin` + `git branch -D <branch>` to clean locally.
- **Keep `main` green.** If CI fails post-merge, fix within an hour.

## 7. Review-pass checklist (Claude's job when a phase reports "done")

When a fresh Claude Code session reports phase completion and hands the branch back, the continuing Claude (you) runs this checklist before pushing:

```bash
cd /Users/ianborders/arp

# 1. Branch state
git status
git log --oneline origin/main..<branch>

# 2. DIDComm isolation still holds
grep -rn "@veramo/did-comm\|didjwt" --include="*.ts" --include="*.json" \
  packages/ apps/ adapters/ examples/ 2>/dev/null \
  | grep -v node_modules | grep -v packages/transport/
# Must return empty.

# 3. Cold-cache gates — wipe everything, rebuild from scratch
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
# All four must exit 0.

# 4. Phase-specific acceptance test
pnpm --filter @kybernesis/arp-phase-<N>-acceptance test

# 5. Prior-phase regression suites still green
# Usually covered by `pnpm run test` recursive — just verify no skips.
```

Risk areas to spot-check per phase (look at these specifically, don't trust "done" alone):

- **Phase 1:** scope-YAML count (should be 50), catalog manifest regenerates cleanly, JSON Schemas valid against Ajv2020, Cedar compiler handles the `normalizeBareEntityTypes` cases
- **Phase 2:** audit chain tamper detection, memory partitioning cross-connection test, DID-pinned TLS round-trip, Cedar PDP evaluates all 10 worked examples from the policy-examples doc
- **Phase 3:** Docker image ≤300 MB, first-boot idempotent, SIGTERM graceful within 5s, drain-settle race (ship a settle period before quiescence poll — this caught CI hot in Phase 3)
- **Phase 4:** consent UI snapshots deterministic, admin API 401/200 path, pairing round-trip + tamper rejection, owner-app e2e
- **Phase 5:** cross-connection isolation 1000× zero-leaks, revocation-races no-inconsistent-state, **`record.token.obligations` merges into audit entries** (caught Phase-5 review; do not regress)
- **Phase 6:** adapter size budgets, DIDComm isolation still holds, each required adapter's conformance test invokes `runAudit` + asserts 8/8, LangGraph uses real `@langchain/langgraph`
- **Phase 7:** tenant isolation (no cross-tenant query ever, adversarial test passes 5/5), WebSocket reconnect after network drop (100 msgs × kill-at-50 regression green), Stripe webhook idempotency via `stripe_events` PK dedup, DIDComm isolation holds (cloud-runtime verifies envelopes via `@kybernesis/arp-transport` only), cloud-client has zero `@kybernesis/arp-*` runtime deps (stays user-installable footprint tiny)
- **Phase 8:** keychain key persistence, biometric gates fire on `critical` scopes, push tokens rotate correctly
- **Phase 8.5:** `grep -rn "selfxyz" --include="*.ts" packages/ apps/ adapters/` returns empty; `@kybernesis/arp-resolver` exposes `resolveDid` + `parseDidKey`; owner-app + cloud-app onboarding compile without importing `@kybernesis/arp-transport` from the root (client code must use `@kybernesis/arp-transport/browser`); did:key signing round-trips through `@kybernesis/arp-pairing::verifyBytes`; `DidDocumentSchema` accepts did:key documents (service + principal optional); Headless gets `docs/ARP-tld-integration-spec-v2.1.md`.
- **Phase 8.75:** `grep -rn "style={{" apps/cloud/app/layout.tsx` returns empty; `grep -rn "#[0-9a-f]\{6\}" apps/cloud/components/ui/` returns empty (no raw hex inside primitives); `grep -rn "self.xyz\|Self.xyz\|selfxyz" apps/cloud/` returns empty across the new surface; three-hostname middleware dispatch test suite green (`apps/cloud/tests/middleware.test.ts` should cover 17+ assertions); onboarding flow still end-to-end functional (did:key mint → tenant create → agent provision → dashboard renders with new design system); HNS gateway branch in `middleware.ts` unchanged; `app.arp.run` existing URLs (`/dashboard`, `/onboarding`, `/agent/<did>`, `/billing`) all still reachable without rewrites.
- **Phase 9:** all `@kybernesis/*` packages at `1.0.0` on `latest`, ghcr image signed + tagged, app store builds submitted

## 8. What to do when you find a gap in review

Two options: fix-now vs defer.

**Fix-now when:**
- The gap is a correctness bug (e.g. Phase 5's dropped obligations)
- The fix is small (under ~30 LOC plus a regression test)
- The test surface is clear

**Defer when:**
- The gap is scope creep vs. an explicit conservative call
- The fix requires cross-package coordination
- A tracking issue suffices and Phase N+1 naturally covers it

Fix-now pattern:
1. Make the source change
2. Add a regression test that red-fails without the fix
3. Run the full gate (`pnpm run test`)
4. Commit as `fix(<package>): <description> [phase-<N>/review]`
5. Include the fix in the PR body's "Review-pass additions" section

## 9. How we coordinate with Headless Domains

Headless shipped their TLD-side integration in parallel with our Phase 4. Their work:

- Provisioner (Python port of `@kybernesis/arp-templates`) at `utils/arp_provisioner.py` in their repo
- DNS orchestrator (`utils/arp_dns.py`)
- Well-known hosting for `.well-known/did.json`, `agent-card.json`, `arp.json`
- Owner subdomain + representation.jwt hosting
- "Setup ARP Local" / "Setup ARP Cloud" buttons in their dashboard
- Reserved names enforced (all 17 from the spec)
- Registrar API stubs at `/api/v1/arp/domains/...`

Outstanding asks (do not send now, bundled for Phase 9 coordination):
- Optional "Custom DIDComm endpoint URL" field in Setup ARP Local (so tunnel-backed users can override the default endpoint) — documented in `docs/ARP-headless-parallel-build.md` Task 5 addendum
- JSON Schema validation at their CI against our `packages/spec/json-schema/*.json` — prevents drift between their Python port and our TS truth
- Two-file download convention — handoff.json + private_key.txt — already working, doc clarification on our side is the only change needed

We run `npx @kybernesis/arp-testkit audit <domain>` against a Headless-provisioned test domain at Phase 9 prep as the compliance co-sign gate.

## 10. User preferences (accumulated)

- Prefers concise answers; bullet > paragraph when possible
- Prefers "ship once it's right" over "ship convoluted then polish"
- Chose **Option A** for user testing: don't test with real non-technical users until Phase 7/8/9 ship the consumer UX. Dev-test cycles (Ian ↔ Janice pairing) are shelved.
- Wants clean operating mechanics — no manual terminal gymnastics in the target UX
- Writes notes in Obsidian at `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Samantha/` — all ARP docs are mirrored there + in `docs/` in this repo
- Uses auto-mode extensively; expects autonomous execution + approval gates

## 11. The human-in-the-loop decisions (never decide these autonomously)

- Actual domain registrations (`.agent`, `.chatbot`, or ICANN like `arp.cloud`)
- VPS provider + region selection
- Stripe prices + plan structure
- npm `latest` tag promotions
- Docker image production pushes to GHCR
- App Store / Play Store submissions
- Production DNS flips
- Domain transfers
- Headless integration production flip (Phase 9 co-sign)

## 12. Commands you'll use constantly

```bash
# Git / GH
cd /Users/ianborders/arp
git status
git log --oneline origin/main..HEAD
git checkout -b phase-N-short-name
git push -u origin phase-N-short-name
gh pr create --base main --head phase-N-short-name --title "..." --body "..."
gh pr merge <N> --auto --squash --delete-branch
gh run list --branch main --workflow CI --limit 1
gh run watch <id> --exit-status
gh run view <id> --log-failed

# Gates
pnpm install --frozen-lockfile
pnpm run typecheck && pnpm run build && pnpm run test && pnpm run lint

# Filter
pnpm --filter @kybernesis/arp-<package> test
pnpm --filter "./adapters/*" test
pnpm --filter @kybernesis/arp-phase-<N>-acceptance test

# Cold-cache verification
rm -rf packages/*/dist apps/*/dist adapters/*/dist packages/*/json-schema \
       packages/scope-catalog/generated node_modules packages/*/node_modules \
       apps/*/node_modules adapters/*/node_modules tests/*/node_modules \
       examples/*/node_modules
pnpm install --frozen-lockfile

# Docker (Phase 3 smoke)
docker build -t arp-sidecar:local -f apps/sidecar/Dockerfile .
bash scripts/validate-image-size.sh
bash tests/phase-3/atlas-smoke.sh
```

## 13. Files you'll read most often

- `docs/ARP-phase-0-roadmap.md` — big picture + dependency graph + global rules
- `docs/ARP-architecture.md` — seven-layer system design
- `docs/ARP-installation-and-hosting.md` — the three install modes + handoff bundle shape
- `docs/ARP-policy-examples.md` — Cedar worked examples + full variable catalog
- `docs/ARP-scope-catalog-v1.md` — the 50 scope templates
- `docs/ARP-tld-integration-spec-v2.md` — the TLD-side contract (used by Headless)
- `docs/ARP-adapter-authoring-guide.md` — the adapter contract (used by community adapter authors)
- `docs/ARP-session-handoff.md` — **this session's state when/if you need to resume**

## 14. Known tech debt (not blocking, tracked)

- **`arp-phase-<N>-acceptance` workspaces emit a "no output files" turbo warning** — cosmetic; `pnpm run build` in those workspaces is a passthrough. Fix: declare `outputs: []` explicitly in their turbo configs. Phase 9 prep cleanup item.
- **Node 20 actions deprecation in CI** — `actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4` run on Node 20; forced to Node 24 by June 2026. Bump at Phase 9.
- **Adapter structural types (Phase 6 conservative call #1)** — KyberBot / OpenClaw / Hermes-Agent / NanoClaw use `*Like` structural projections of their public APIs rather than real package deps. Real wiring validates at Phase 9 when the user installs each framework alongside the adapter. Low risk — docs are public — but worth re-validating at Phase 9 prep.
- **Python `arp-sdk` lives at `python/arp-sdk/` in-tree for now.** Splits to a separate `arp-sdk-python` repo at Phase 9 publish time. v0.1.0 ships the full public API + obligation engine; Cedar-WASM + DIDComm transport are stubbed for v1.1.
- **PGlite-only for apps/cloud + apps/cloud-gateway in v0.** Real Postgres driver wiring (node-postgres + drizzle) lands at Phase 7 production deploy prep. Today everything runs against an in-process PGlite WASM database — fine for dev + tests, but not for durability.
- **`ARP_CLOUD_PRINCIPAL_FIXTURES` env-var-based principal key store in apps/cloud.** For v0 the cloud app resolved principal DID → pubkey from a semicolon-delimited env var. Phase 8.5 added inline `did:key:` decoding (no external resolution needed — the key is in the DID itself); the fixture path is retained for dev/test. Phase 9 prep can delete the fixture path.
- **WebSocket session registry is in-process.** A single cloud-gateway node owns all WS sessions. For multi-node deployments you'd swap `packages/cloud-runtime/src/sessions.ts` for a Redis pub/sub broker. v0.2 ticket; not blocking for single-region deployment.
- **Principal-key UX is browser-held did:key in v1 (Phase 8.5).** Passkey / WebAuthn, magic-link email, and server-held KMS-wrapped principal keys are explicitly Phase 9+ consumer-UX polish. Recovery = 12-word BIP-39-style phrase the user saves at signup.
- **Client code must import browser helpers from `@kybernesis/arp-transport/browser`**, not from the root `@kybernesis/arp-transport` entry — the root pulls in `better-sqlite3` + `node:fs` (mailbox + keystore) and Turbopack cannot bundle them for the browser. Added Phase 8.5.
- **Design tokens live under `apps/cloud/`** (`apps/cloud/tailwind.config.ts` + `apps/cloud/app/globals.css` + `apps/cloud/components/ui/`) and are not extracted to a shared `@kybernesis/arp-ui` package yet. Phase 9 spec/docs/status sites must match the same tokens — either by copying the config into each app, or (preferred) by extracting the design system to a shared private package. See `docs/ARP-design-system.md §10`. Added Phase 8.75.
- **Anthropic design file URL referenced in the Phase 8.75 brief returned 404.** Tokens were extracted from a local HTML mock at `/Users/ianborders/Downloads/Swiss Design/ARP Landing.html` (Swiss / editorial: paper + ink + signal palette, Space Grotesk + Instrument Sans + JetBrains Mono). If the upstream design file is ever recoverable, retrofit is localised to `apps/cloud/tailwind.config.ts` + `apps/cloud/app/globals.css` since every component references named tokens. Added Phase 8.75.
- **`proxy` migration for Next.js 16.** The cloud app `middleware.ts` triggers a "middleware is deprecated, use proxy instead" warning on build. Harmless in v16; follow-up to rename/restructure when we next touch it. Added Phase 8.75.
- **v2.1 `/onboard` Option-A flow signs the representation JWT in the browser, not server-side.** The v2.1 spec §3.3 envisions cloud-managed principal keys for Option A, but Phase 8.5's identity model is browser-held `did:key`; the cloud never holds the private key. Workaround: the JWT's `iss` is `did:web:arp.cloud:u:<tenantId>` (cloud-managed alias) but the signature is produced in-browser using the user's did:key key. The alias DID doc at `/u/<tenantId>/did.json` publishes the SAME public key, so the round-trip verifies. WebAuthn / passkey migration in slice 9d changes this; until then the cloud is still browser-held. Added Phase 9 slice 9b.
- **`registrar_bindings.tenant_id` linkage is principal-DID-string-exact.** `POST /internal/registrar/bind` matches the `principal_did` on the tenants row by literal string equality. Registrars that pass the `did:web:arp.cloud:u:<uuid>` alias link to NULL (the tenants row's `principal_did` is the raw `did:key:z...`); a future reconciliation job can fill those in. Registrars that pass the did:key form directly link to the tenant correctly. Not urgent — the representation_jwt is still stored, so the binding is recoverable. Added Phase 9 slice 9b.
- **`apps/cloud/tests/*` routes tests mock `next/headers` inline.** Every session-authed route test duplicates the same ~20-line `vi.mock('next/headers', ...)` stub because sharing a testing helper is not wired up. Minor code smell; extract to `apps/cloud/tests/helpers/cookies.ts` at Phase 9 prep cleanup. Added Phase 9 slice 9b.

## 15. How to resume after context compaction

If you are a continuing Claude session and your context window just compacted:

1. Read this `CLAUDE.md` top to bottom (you're doing that now)
2. Read `docs/ARP-session-handoff.md` for the specific session state
3. Check `git log origin/main --oneline -10` to confirm where the build is
4. Check `git status` in any active phase branch
5. If the user asks for the next phase opener, consult `docs/ARP-phase-0-roadmap.md` for which phase is next and then open the corresponding `docs/ARP-phase-<N>-<name>.md`
6. Use the opener template in `docs/ARP-session-handoff.md §Phase opener template` — don't reinvent the structure

---

*Last updated on `phase-8-5-auth-identity-shift` branch after Phase 8.5 acceptance gates passed (2026-04-24). Update the phase status table in §5 and `docs/ARP-session-handoff.md` after the Phase 8.5 PR merges.*
