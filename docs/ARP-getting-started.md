# ARP — Getting Started Runbook

**Purpose:** practical, step-by-step instructions for taking the 24 design + phase docs and actually building ARP with Claude Code sessions.

**Audience:** you (Ian). Written like a pilot's checklist — follow in order, don't skip.

---

## 1. Pre-flight (one-time setup, do before any Claude Code session)

Some phases can't start without these in place. Front-load them.

### 1.1 Accounts & services

**Repo:** `https://github.com/KybernesisAI/arp.git` — already provisioned.
**Local path:** `/Users/ianborders/arp` (i.e., `~/arp`).

| Item | Required by phase | Why |
|---|---|---|
| **GitHub org `KybernesisAI`** | 1 | Monorepo home (already exists) |
| **npm scope `@kybernesis`** | 1 | Package publishing (already exists: `npmjs.com/~kybernesis`) |
| **`.agent` domains** — `samantha.agent`, `ghost.agent`, `arp-test.agent` | 5 | Reference agents + testing |
| **VPS or equivalent** (DigitalOcean, Fly, Hetzner) × 2 | 5 | Reference-agent hosting |
| **Vercel account + team** | 7 | ARP Cloud hosting |
| **Neon Postgres via Vercel Marketplace** | 7 | Multi-tenant DB |
| **Stripe account (test + live keys)** | 7 | Billing |
| **Apple Developer account** ($99/yr) | 8 | iOS builds |
| **Google Play Console** ($25 one-time) | 8 | Android builds |
| **Firebase project (FCM)** | 8 | Android push |
| **Self.xyz developer access** (staging key minimum) | 4 | VC presentation integration |
| **Headless Domains API access** | 9 | Programmatic registration |
| **Cloudflare account** (free tier ok) | Various | DNS + Tunnel for local testing |

Tick each one done before starting the phase that needs it. Phase docs will block if these are missing.

### 1.2 Tools on your Mac

```bash
# Node 24 LTS via nvm or fnm
fnm install 24 && fnm use 24

# pnpm 9+
npm install -g pnpm

# Docker Desktop (already have for KyberBot)

# GitHub CLI
brew install gh && gh auth login

# Cloudflare tunnel (for local dev and phase 8 testing)
brew install cloudflared

# Expo CLI (phase 8)
npm install -g expo eas-cli
```

### 1.3 Claude Code setup

- Install or update to the latest Claude Code version
- Open settings, confirm auto-mode is available (optional but helpful — the phase docs assume execution)
- Add an allowlist for `pnpm`, `docker`, `git`, `gh`, `curl` to reduce permission prompts:
  ```
  /allow pnpm
  /allow docker
  /allow git
  /allow gh
  /allow curl
  ```

---

## 2. Repo bootstrap (do this once, before Phase 1)

You want all 24 docs committed into the repo so every Claude Code session can reference them by path. This replaces pasting them on every session.

```bash
# Clone the existing repo
cd ~
git clone https://github.com/KybernesisAI/arp.git
cd arp

# Create docs dir and copy all ARP docs in
mkdir -p docs
cp "/Users/ianborders/Library/Mobile Documents/iCloud~md~obsidian/Documents/Samantha/ARP-"*.md docs/

git add docs
git commit -m "docs: ARP design + phase plans"
git push origin main
```

Verify:
```bash
ls docs | wc -l    # should be ~24
```

The docs stay in the repo. Updates to any doc are tracked in git. Claude Code sessions read them from `docs/*.md`.

---

## 3. Session model

### 3.1 One session per phase

Don't try to run phases 1–9 in one session. Context limits will bite, and you want human review between phases.

Each phase is a discrete unit:
1. Start a fresh Claude Code session
2. `cd` into the repo
3. Kick off the phase (command in §4)
4. Let it execute autonomously
5. Review the PR it produces
6. Merge
7. End the session
8. Next phase → new session

### 3.2 Session opening script

Same opener every time. Copy-paste this at the start of each phase session:

```
I'm working on ARP (Agent Relationship Protocol). The repo is at ~/arp. All design + phase docs are in docs/*.md.

Read docs/ARP-phase-0-roadmap.md for orientation.

Then execute docs/ARP-phase-<N>-<name>.md end-to-end.

Reference these docs as needed (don't re-read them unless necessary for a task):
- docs/ARP-architecture.md
- docs/ARP-our-codebase.md
- [+ any phase-specific ones from the phase doc's "Companion docs" header]

Operate autonomously. Commit after each atomic task. Open a PR at the end. Don't ask clarifying questions unless a phase doc's instructions genuinely conflict — otherwise pick the conservative option and flag it in the PR description.

Constraints that override anything in the docs:
- No publishing to npm or pushing to ghcr.io in this phase (keep credentials unused)
- No deployments to production environments without my explicit go-ahead
- No destructive git commands (force-push, hard-reset)
```

Adjust the constraints block per phase as needed (e.g., for phase 9 launch you'll lift the no-publish rule).

### 3.3 What to have open

| Window | Purpose |
|---|---|
| Claude Code terminal | Running the session |
| Second terminal tab | For you to run `git log`, `gh pr view`, check progress |
| The phase doc (in Obsidian or a viewer) | Quick reference to follow along |
| Browser tab to the repo | Review diffs |

---

## 4. Phase-by-phase runbook

### Phase 1 — Shared Contract
**Prereqs:** GitHub org + repo created, Node 24 + pnpm installed
**Opener:** standard + phase-1 doc
**Human intervention needed:** none during execution
**Acceptance:** `pnpm -r build/test/typecheck/lint` green; three packages exist in `packages/`
**Duration:** likely 1–2 Claude Code sessions (may need to break long session into two)
**Deliverable:** PR #1 — "Phase 1: shared contract"

### Phase 2 — Runtime Core
**Prereqs:** Phase 1 merged
**Opener:** standard + phase-2 doc
**Human intervention:** none during execution. May need to provide test-only HNS resolution access (the DoH URL is public; no auth needed)
**Acceptance:** two-agent integration test passes
**Duration:** 2–3 sessions
**Deliverable:** PR #2

### Phase 3 — Sidecar Packaging
**Prereqs:** Phase 2 merged, Docker running
**Opener:** standard + phase-3 doc
**Human intervention:** none. The `image-publish.yml` workflow exists but won't actually publish — it's dormant until Phase 9
**Acceptance:** `docker build` succeeds, Atlas smoke test passes
**Duration:** 1–2 sessions
**Deliverable:** PR #3

### Phase 4 — Pairing + Owner App
**Prereqs:** Phase 3 merged, Self.xyz staging key acquired
**Opener:** standard + phase-4 doc + `ARP-policy-examples.md` + `ARP-scope-catalog-v1.md`
**Human intervention:** set up Self.xyz staging access, provide credentials via `.env.local` (never commit)
**Acceptance:** end-to-end pairing demo passes
**Duration:** 3–4 sessions
**Deliverable:** PR #4

### Phase 5 — Reference Agents + Testkit
**Prereqs:** Phase 4 merged, two `.agent` domains + two VPSes provisioned
**Opener:** standard + phase-5 doc
**Human intervention:**
- You register `samantha.agent` and `ghost.agent` at Headless Domains
- You spin up two small VPSes (Hetzner CPX11 or similar, ~$5/mo each)
- You hand Claude Code the SSH keys, handoff bundles, VPS IPs via env vars
**Acceptance:** `npx @kybernesis/arp-testkit audit samantha.agent` returns 8/8
**Duration:** 2 sessions
**Deliverable:** PR #5 + two live reference agents

### Phase 6 — SDKs + Adapters
**Prereqs:** Phase 5 merged, Phase 2 runtime stable
**Can run in parallel with:** Phases 7 + 8 (each in its own session branch)
**Opener:** standard + phase-6 doc + `ARP-adapter-authoring-guide.md`
**Human intervention:** provide working installs of KyberBot + OpenClaw + Hermes-Agent + NanoClaw + LangGraph (evaluation licenses where needed)
**Acceptance:** all 5 required adapters pass conformance
**Duration:** 3–5 sessions (one per adapter)
**Strategy:** run one adapter per session so context stays focused
**Deliverable:** PR #6 (one PR per adapter is fine; coalesce at end)

### Phase 7 — ARP Cloud
**Prereqs:** Phase 5 merged, Vercel + Neon + Stripe accounts
**Can run in parallel with:** Phase 6
**Opener:** standard + phase-7 doc
**Human intervention:**
- Vercel team set up; Claude Code can deploy to staging environments once you provide project IDs
- Stripe test keys in `.env.local`
- Production keys NOT provided until Phase 9 launch
**Acceptance:** `npx @kybernesis/arp-testkit audit atlas.agent --via cloud` returns 8/8 on a staging tenant
**Duration:** 4–6 sessions
**Deliverable:** PR #7

### Phase 8 — Mobile Apps
**Prereqs:** Phase 7 API surface stable, Apple + Play accounts + Firebase provisioned
**Can run in parallel with:** Phases 6 + 7 if you have the bandwidth, but mobile will rebase onto Phase 7's API
**Opener:** standard + phase-8 doc (note: separate repo `arp-mobile`)
**Human intervention:**
- Sign in to Expo EAS via the terminal
- Provide Apple + Google signing credentials via EAS secrets
- Do actual App Store / Play Store submissions (Claude Code can't log in to those dashboards)
**Acceptance:** TestFlight + Play internal track accept the builds
**Duration:** 4–6 sessions
**Deliverable:** mobile repo populated, builds in stores' internal tracks

### Phase 9 — Launch
**Prereqs:** Phases 1–8 all merged + green
**Opener:** standard + phase-9 doc
**Human intervention:**
- You schedule the Headless integration review call
- You decide the launch date
- You flip Stripe production keys (not Claude Code)
- You hit publish on store listings
- You post the launch blog yourself
**Acceptance:** public beta open; Headless registration flow live; `@kybernesis/arp-*` at `1.0.0` on `latest`
**Duration:** 2–4 sessions + real-world coordination time
**Deliverable:** public launch

---

## 5. Parallel tracks (optional)

If you want to move faster once the foundation is stable:

```
Phase 1 ──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 4 ──▶ Phase 5 ──┬──▶ Phase 6 ──┐
                                                          ├──▶ Phase 7 ──┼──▶ Phase 9
                                                          └──▶ Phase 8 ──┘
```

Phases 6, 7, 8 can run in parallel once Phase 5 merges. Use separate git worktrees or branches so each Claude Code session has its own working copy:

```bash
# from ~/arp
git worktree add ../arp-phase-6 main
git worktree add ../arp-phase-7 main
git worktree add ../arp-phase-8 main
```

Then run three Claude Code sessions simultaneously, each in its own worktree. Coordinate merges carefully — you're the human merge conductor.

---

## 6. Human decision points (where Claude Code must pause)

Flag these moments during execution. Your phase doc's "Common pitfalls" section often calls them out, but here's the authoritative list:

| Decision | Phase | Why Claude Code can't decide |
|---|---|---|
| Actual `.agent` domain names | 5, 7 | You own the decision + the money |
| VPS provider + region | 5 | Your cost + latency constraints |
| Stripe plan prices | 7 | Business decision |
| Domain DNS flip from staging to production | 5, 7, 9 | Irreversible blast-radius |
| npm package `latest` tag promotion | 9 | Releases are judgment |
| App Store / Play Store submissions | 8 | Requires you logged in |
| Headless production flip | 9 | Cross-team coordination |
| Launch date | 9 | Calendar decision |

Anything else — scaffolding, code, tests, PRs, docs — Claude Code owns.

---

## 7. Failure modes and how to handle them

### 7.1 "Phase docs conflict with reality"

If a phase doc says "use X library" and X turns out to be broken / unavailable:
1. Claude Code should flag the conflict in the PR description
2. Do NOT let it silently pick a different library; that violates the phase contract
3. You decide: update the phase doc to name the replacement, or work around it

### 7.2 "Context window exhausted mid-phase"

Phases 4 and 7 are the likeliest offenders. If Claude Code starts losing track:
1. End the session with a "commit everything so far + write a progress note" instruction
2. Start fresh session
3. Opener: "Resume Phase N from docs/phase-progress.md and continue"
4. Phase docs are designed to be resumable — atomic tasks, clear commit points

### 7.3 "Tests fail and Claude Code is stuck"

Don't let it retry the same thing forever. After 2 failed attempts at a specific test:
1. Read the test and the failing code yourself
2. Either: fix it manually and commit, then tell Claude Code "continue from here"
3. Or: update the phase doc to be clearer and restart the task

### 7.4 "I want to change a design decision mid-build"

Change the design docs FIRST (not the code). Commit the doc change. Then tell Claude Code: "The design has changed; see doc update at <path>. Rework the affected tasks."

This keeps docs as the source of truth.

### 7.5 "A phase completed but something feels wrong"

Don't merge. Stay in review. Ask Claude Code to add more tests, explain a specific choice, or refactor a section. Merging a half-baked phase cascades into phase N+1.

---

## 8. Progress tracking

Keep a `PROGRESS.md` at the repo root that each session updates:

```markdown
# Build Progress

## Phase 1 — Shared Contract
- Status: ✅ Complete
- PR: #1 (merged 2026-04-25)
- Notes: —

## Phase 2 — Runtime Core
- Status: 🚧 In progress
- PR: #2
- Blocker: HNS DoH resolver hits rate limit during test runs; added backoff
- Next session: continue at Task 7 (runtime HTTP server)

## Phase 3 — Sidecar Packaging
- Status: ⏳ Not started
- Prereqs: Phase 2 merged
```

First line of each Claude Code session opener: "Read PROGRESS.md. Update it at the end of the session."

---

## 9. The minimum commands you'll actually run

Cheat sheet of commands you'll use repeatedly:

```bash
# Start a new phase session (after cd ~/arp)
# (open Claude Code, paste the opener script, paste the phase doc reference)

# Between sessions — review a PR
gh pr view <n>
gh pr checkout <n>
pnpm install
pnpm -r build && pnpm -r test

# Merge a PR
gh pr merge <n> --squash --delete-branch

# Parallel tracks
git worktree add ../arp-phase-<n> main

# Reference agent checks (after phase 5)
npx @kybernesis/arp-testkit audit samantha.agent
npx @kybernesis/arp-testkit audit ghost.agent

# Cloud smoke test (after phase 7)
npx @kybernesis/arp-testkit audit atlas.agent --via cloud
```

---

## 10. Total time estimate

| Track | Sessions | Wall-clock with reviews |
|---|---|---|
| Phase 1 | 1–2 | 3 days |
| Phase 2 | 2–3 | 1 week |
| Phase 3 | 1–2 | 3–4 days |
| Phase 4 | 3–4 | 1.5 weeks |
| Phase 5 | 2 | 1 week |
| Phase 6 (parallel) | 3–5 | 2 weeks |
| Phase 7 (parallel) | 4–6 | 3 weeks |
| Phase 8 (parallel) | 4–6 | 3 weeks + store review |
| Phase 9 | 2–4 | 1 week + coordination |

**Serial only:** ~16 weeks.
**With phases 6/7/8 in parallel:** ~10–12 weeks to public launch.

Most of the non-session time is you reviewing PRs, coordinating with Headless, and waiting on app stores.

---

## 11. The very first thing to do right now

1. Register the three test `.agent` domains at Headless
2. Run the §2 "Repo bootstrap" commands (clones `https://github.com/KybernesisAI/arp.git` into `~/arp`)
3. Start Claude Code in `/Users/ianborders/arp`
4. Paste the §3.2 opener with `<N>=1`
5. Let it go

Everything else flows from that.

---

*Getting Started Runbook v0.1 — April 2026*
