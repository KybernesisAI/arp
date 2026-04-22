# ARP Phase 5 — Reference Agents + Compliance Testkit

**Reader:** Claude Code. Directives only.

**Companion docs:** `ARP-phase-0-roadmap.md`, `ARP-phase-2-runtime-core.md`, `ARP-phase-3-sidecar.md`, `ARP-phase-4-pairing-owner-app.md`, `ARP-tld-integration-spec-v2.md`.

---

## 0. Reader orientation

**Phase goal:** publish two public reference agents and the compliance testkit that validates any `.agent` domain's ARP implementation.

**Tech pins:**
- `@kybernesis/arp-testkit`: published npm package with CLI + programmatic API
- Test runner: Vitest for unit; Playwright for any browser-level tests
- Reference agents deployed on cheap always-on hosting (a small DigitalOcean droplet or Fly machine is fine for v0)
- Hosting of reference agents: use the Phase 3 sidecar image; ops are proof that the sidecar works in anger

**Out of scope:** owner-app UX polish (Phase 4 ships functional), load testing (v0.2+), adversarial red-team testing (post-launch).

---

## 1. Definition of done

- [ ] `@kybernesis/arp-testkit` package published, usable via CLI (`npx @kybernesis/arp-testkit audit <domain>`)
- [ ] Testkit covers all tests listed in `ARP-tld-integration-spec-v2.md §9` plus our own additions
- [ ] `samantha.agent` and `ghost.agent` reference deployments live, running sidecar v0.1
- [ ] Reference agents pair, exchange messages under the 5 bundles in `ARP-scope-catalog-v1.md §6`, revoke cleanly
- [ ] Cross-connection isolation test passes on reference agents
- [ ] Testkit reports emitted as JSON + human-readable summary
- [ ] CI runs testkit against reference deployments nightly; failures create GitHub issues

---

## 2. Prerequisites

- Phases 1–4 complete
- Two `.agent` domains registered (`samantha.agent`, `ghost.agent`)
- Two internet-reachable hosts (VPS, Fly, or any provider)

---

## 3. Repository additions

```
arp/
├── packages/
│   └── testkit/
│       ├── src/
│       │   ├── cli.ts
│       │   ├── audit.ts             # full compliance audit
│       │   ├── probes/              # individual test modules
│       │   │   ├── dns.ts
│       │   │   ├── well-known.ts
│       │   │   ├── did-resolution.ts
│       │   │   ├── tls-fingerprint.ts
│       │   │   ├── didcomm-probe.ts
│       │   │   ├── pairing-probe.ts
│       │   │   ├── revocation.ts
│       │   │   └── cross-connection.ts
│       │   └── report.ts
│       ├── tests/
│       ├── package.json
│       └── README.md
├── apps/
│   ├── samantha-reference/
│   │   ├── src/                     # minimal agent logic (see §4)
│   │   ├── handoff.json             # committed for demo purposes (test keypair)
│   │   ├── Dockerfile.compose       # layers on sidecar image
│   │   ├── fly.toml                 # or provider equivalent
│   │   └── README.md
│   └── ghost-reference/
│       └── ...                      # identical structure
└── tests/
    └── phase-5/
        ├── bundle-coverage.test.ts
        ├── cross-connection-isolation.test.ts
        └── revocation-races.test.ts
```

---

## 4. Implementation tasks

### Task 1 — `@kybernesis/arp-testkit` probes

Each probe is a pure async function returning `{ name, pass, details, duration_ms }`.

Implement:

| Probe | What it checks |
|---|---|
| `dns` | `_arp`, `_did`, `_didcomm`, `_revocation` TXT records exist with correct formats |
| `well-known` | `did.json`, `agent-card.json`, `arp.json` served with 200 + correct JSON Schema |
| `did-resolution` | `did:web:<name>` resolves via vanilla `did-resolver` using our HNS DoH resolver |
| `tls-fingerprint` | Cert served at `<name>:443` matches the fingerprint in DID doc |
| `didcomm-probe` | Sends a minimal DIDComm v2 ping; expects a signed ack within 5s |
| `pairing-probe` | Full pairing flow using a test principal; Connection Token issued; revoke succeeds |
| `revocation` | After revoking a test connection, subsequent message rejected; revocation list updated within poll interval |
| `cross-connection` | With two test connections to the same peer, fact set in connection A is never returned in connection B |

Each probe carries its own pass/fail semantics; aggregate reporting in `audit.ts`.

**Acceptance:** unit tests for each probe using a mocked agent; integration test harness spins up a local sidecar and runs all probes against it.

### Task 2 — Testkit CLI

`@kybernesis/arp-testkit` ships as a CLI:
```
npx @kybernesis/arp-testkit audit <domain> [--json] [--verbose]
npx @kybernesis/arp-testkit probe dns <domain>
npx @kybernesis/arp-testkit probe well-known <domain>
...
npx @kybernesis/arp-testkit compare <domain-a> <domain-b>     # diff capabilities
```

Output (human mode):
```
ARP Compliance Audit — samantha.agent
====================================

  ✓ DNS records                         (312ms)
  ✓ Well-known documents                (421ms)
  ✓ DID resolution                      (189ms)
  ✓ TLS fingerprint pinning             (234ms)
  ✓ DIDComm ping                        (812ms)
  ✓ Pairing flow                      (4.1s)
  ✓ Revocation propagation              (1.2s)
  ✓ Cross-connection isolation        (3.5s)

  8/8 passed · 10.8s total
```

JSON mode emits one object per probe + a summary record.

**Acceptance:** CLI runs against a local sidecar and emits the expected summary; JSON output validates against a schema in `@kybernesis/arp-spec`.

### Task 3 — `samantha-reference` agent

Minimal agent logic:
1. Uses `@kybernesis/arp-runtime` directly (not a custom framework) to demonstrate the bare-bones path
2. Responds to Phase 4's pairing invitations
3. Has a small knowledge base per connection (for demoing the memory-isolation story)
4. Simple tools: `summarize`, `check_availability`, `read_project_file` (mocked content)
5. All tool responses go through egress PDP

Deployment:
- `Dockerfile.compose` layers config on top of the sidecar image
- `fly.toml` (or DigitalOcean/Hetzner equivalent) with persistent volume for registry + audit

**Acceptance:** `https://samantha.agent/.well-known/did.json` resolves; testkit full audit returns 8/8 green.

### Task 4 — `ghost-reference` agent

Same structure as Samantha, different identity. Used as the counterparty for demos.

**Acceptance:** ghost.agent also passes 8/8 in testkit audit.

### Task 5 — Scope-bundle coverage test

`tests/phase-5/bundle-coverage.test.ts`:

For each of the 5 bundles in `ARP-scope-catalog-v1.md §6`:
1. Compile the bundle via `@kybernesis/arp-scope-catalog`
2. Issue a Connection Token from Samantha to Ghost
3. Ghost invokes every action the bundle implies should be allowed → PDP allows
4. Ghost invokes one action the bundle forbids → PDP denies
5. Assert obligations fired as expected

**Acceptance:** all 5 bundles pass.

### Task 6 — Cross-connection isolation stress test

`tests/phase-5/cross-connection-isolation.test.ts`:

1. Samantha has Connections A and B to the same peer (Ghost) for different projects
2. Under A, Ghost asks Samantha to remember a secret ("Project Alpha launch date is July 1")
3. Under B, Ghost asks Samantha "what do you know about Project Alpha?"
4. Assert: Samantha's response contains no reference to Connection A's content
5. Do this for 10 different memory types (facts, preferences, documents, contacts, etc.)

**Acceptance:** zero leaks across 10 categories. Test re-runs 100x to catch flakiness.

### Task 7 — Revocation race tests

`tests/phase-5/revocation-races.test.ts`:

1. Samantha issues Connection Token; Ghost begins sending messages at 10/sec
2. At T=2s, Samantha revokes
3. Assert: all messages sent at T < 2s - ε are processed; all at T > 2s + propagation_window are rejected
4. No messages in the grey zone produce inconsistent state (audit + registry agree)

**Acceptance:** no inconsistent state in 100 runs.

### Task 8 — Nightly compliance workflow

`.github/workflows/testkit-nightly.yml`:
1. Runs at 02:00 UTC every night
2. Executes `npx @kybernesis/arp-testkit audit samantha.agent` and `npx @kybernesis/arp-testkit audit ghost.agent`
3. If any probe fails, creates a GitHub issue labeled `testkit-regression` with the JSON report attached
4. Posts summary to the repo's discussions or a Slack webhook if configured

**Acceptance:** workflow file validates; manual trigger produces a summary artifact.

### Task 9 — Demo scripts

Scripted demos for docs + recordings:
- `demos/pair-samantha-ghost.sh` — scripted pairing flow end to end
- `demos/cross-connection-isolation.sh` — shows the isolation story in action
- `demos/revoke-and-verify.sh` — revokes, then proves peer is rejected

Each is an executable shell script that uses the testkit CLI + plain `curl` for clarity.

**Acceptance:** each demo runs start-to-finish without manual intervention; produces a deterministic transcript.

### Task 10 — Testkit docs

README for `@kybernesis/arp-testkit`:
- Install: `npm i -g @kybernesis/arp-testkit` or `npx @kybernesis/arp-testkit`
- Run an audit
- Interpret the output
- Run individual probes
- Contribute a probe (template + acceptance criteria)

---

## 5. Acceptance tests

```bash
pnpm install
pnpm -r build
pnpm --filter @kybernesis/arp-testkit test
pnpm --filter tests/phase-5 test
npx @kybernesis/arp-testkit audit samantha.agent --json > /tmp/samantha-audit.json
npx @kybernesis/arp-testkit audit ghost.agent --json > /tmp/ghost-audit.json
# Both audits must show 8/8 pass
```

---

## 6. Deliverables

- `@kybernesis/arp-testkit` on npm (pre-release)
- `samantha.agent` and `ghost.agent` live
- Nightly compliance workflow
- Demo scripts
- First public "ARP certified" badge criteria (based on testkit pass rate)

---

## 7. Handoff to Phase 6

Phase 6 (SDKs + Adapters) consumes:
- Testkit as the conformance bar for each adapter
- Reference agents as interop targets for adapter tests

Each adapter in Phase 6 must, as part of its acceptance, run full testkit audit green when wired to a reference agent.

---

## 8. v0 decisions (do not reopen)

- Reference agents use the sidecar image; no custom runtime fork
- Two reference agents only (Samantha + Ghost); more come with adapter examples in Phase 6
- Testkit probes are sequential (not parallel) for clearer reports
- No rate-limiting or anti-abuse on reference agents in v0 (they're demos)
- Nightly cadence only; no real-time monitoring until Phase 9

---

## 9. Common pitfalls

- **Reference agent keys:** commit a throwaway keypair for the handoff to simplify onboarding, but rotate before public demo. Document the rotation in the README.
- **Cross-connection tests are probabilistic if memory isolation has bugs.** Run each test 100x before declaring green — one leak in 100 is still a leak.
- **DIDComm ping tests can be flaky on cold starts.** Warm the runtime with a health check before probing.
- **Testkit output shouldn't mutate state** (no test connections left behind). Use short-lived test principals and clean up.
