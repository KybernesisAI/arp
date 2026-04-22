# ARP Phase 2 — Runtime Core

**Reader:** Claude Code. Directives only. If two instructions conflict, lower-numbered section wins.

**Companion docs:** `ARP-phase-0-roadmap.md`, `ARP-phase-1-shared-contract.md`, `ARP-architecture.md`, `ARP-policy-examples.md`, `ARP-hns-resolution.md`.

---

## 0. Reader orientation

**Phase goal:** build the core agent runtime — an HTTP server that receives DIDComm messages, evaluates Cedar policies, manages connections, logs audit events, and sends responses. Standalone library + example binary; not yet packaged as a sidecar.

**Tech pins (in addition to Phase 0 globals):**
- HTTP framework: **Hono**
- DIDComm: **`@veramo/did-comm`** for v2 messaging
- Cedar: **`@cedar-policy/cedar-wasm`**
- Database (local): **`better-sqlite3`** for Connection registry and audit log
- Crypto: **`@noble/ed25519`**, **`jose`** (JWT/JWS), **`canonicalize`** (JCS)
- HNS DoH: **native fetch** against `https://hnsdoh.com/dns-query`
- DID resolution: **`did-resolver`** + custom HNS-aware web resolver
- TLS: Node's built-in `tls`/`crypto` for self-signed cert generation

**Out of scope for this phase:** Docker packaging (Phase 3), pairing UX (Phase 4), owner web app (Phase 4), mobile app (Phase 8), Cloud hosting (Phase 7), SDK wrappers (Phase 6).

**Error contract:** same as Phase 1 — `Result<T, E>` at package boundaries; structured errors with `code` + `message`.

**Concurrency model:** each agent runs in a single Node process. No clustering in v0. Fluid Compute compatibility preserved (stateless request handlers; state goes through the registry).

---

## 1. Definition of done

- [ ] Seven packages scaffolded, built, tested, linted (see §3)
- [ ] Two-agent simulated end-to-end test (Samantha ↔ Ghost) passes
- [ ] Cedar PDP correctly evaluates all 10 worked examples from `ARP-policy-examples.md`
- [ ] HNS DoH resolver resolves a known `.agent` test domain and returns expected records
- [ ] Self-signed TLS cert generation + DID-doc pinning round-trip works
- [ ] Connection registry persists across restart (SQLite on disk)
- [ ] Audit log is tamper-evident (hash-chain verification utility runs green)
- [ ] Revocation propagation (peer-poll model) works in integration test
- [ ] `pnpm -r build/test/typecheck/lint` all green
- [ ] Memory partitioning enforced per-connection in the reference agent binary

---

## 2. Prerequisites

- Phase 1 complete (`@kybernesis/arp-spec`, `@kybernesis/arp-templates`, `@kybernesis/arp-scope-catalog` published to workspace)

---

## 3. Repository additions

Add these packages to the existing monorepo:

```
arp/packages/
├── runtime/            # HTTP server + dispatch
├── pdp/                # Cedar evaluator + obligation pipeline
├── transport/          # DIDComm v2 client + mailbox
├── registry/           # Connection DB (SQLite)
├── audit/              # Append-only hash-chained log
├── resolver/           # HNS DoH + did:web resolution
└── tls/                # DID-pinned self-signed cert gen + validation
```

Add one binary:

```
arp/apps/
└── runtime-bin/        # The reference standalone agent executable used in tests
```

---

## 4. Implementation tasks

### Task 1 — `@kybernesis/arp-resolver`

1. `resolveHns(name: string): Promise<{ a: string[]; txt: Record<string, string[]> }>` — queries `https://hnsdoh.com/dns-query` (DoH, RFC 8484) for A and TXT records
2. `resolveDidWeb(did: string): Promise<DidDocument>` — splits `did:web:<domain>` → `https://<domain>/.well-known/did.json`; for `.agent` domains, routes DNS through HNS DoH, TLS validation deferred to `@kybernesis/arp-tls`
3. Cache resolver results with 300s TTL (in-memory LRU, 1000 entries)
4. Export fallback to local `hnsd` when `ARP_HNSD_LOCAL=true` env var is set

**Acceptance:** integration test resolves at least one well-known HNS name (use `welcome.nb` or similar test domain) and parses its records.

### Task 2 — `@kybernesis/arp-tls`

1. `generateAgentCert(did: string, publicKeyMultibase: string): { certPem: string; keyPem: string; fingerprint: string }` — produces a self-signed X.509 cert with:
   - CN = the agent DID
   - SAN = the agent's apex hostname (parsed from `did:web:<host>`)
   - Ed25519 key (generated internally)
   - 10-year validity
2. `computeFingerprint(certPem: string): string` — SHA-256 of DER, lowercase hex
3. `validatePinnedCert(peerCertPem: string, expectedFingerprint: string): boolean`
4. Utility to inject the cert + key into a Node TLS server

**Acceptance:** round-trip test — generate cert, publish fingerprint, connect TLS client validating against fingerprint, assert success. Tamper with fingerprint; assert failure.

### Task 3 — `@kybernesis/arp-registry`

1. Schema: SQLite with tables:
   ```sql
   CREATE TABLE connections (
     connection_id TEXT PRIMARY KEY,
     label TEXT,
     self_did TEXT NOT NULL,
     peer_did TEXT NOT NULL,
     purpose TEXT,
     token_jws TEXT NOT NULL,
     cedar_policies_json TEXT NOT NULL,
     status TEXT CHECK (status IN ('active','suspended','revoked')) DEFAULT 'active',
     created_at INTEGER NOT NULL,
     expires_at INTEGER,
     last_message_at INTEGER,
     metadata_json TEXT
   );

   CREATE TABLE connection_spend (
     connection_id TEXT NOT NULL,
     window_start INTEGER NOT NULL,
     amount_usd_cents INTEGER NOT NULL,
     PRIMARY KEY (connection_id, window_start)
   );

   CREATE TABLE revocations (
     type TEXT NOT NULL,
     id TEXT NOT NULL,
     revoked_at INTEGER NOT NULL,
     reason TEXT,
     PRIMARY KEY (type, id)
   );

   CREATE INDEX idx_conn_peer ON connections(peer_did);
   CREATE INDEX idx_conn_status ON connections(status);
   ```
2. Exports:
   - `openRegistry(path: string): Registry`
   - `Registry.createConnection(token: ConnectionToken): Promise<Connection>`
   - `Registry.getConnection(id: string): Promise<Connection | null>`
   - `Registry.listConnections(filter: ConnectionFilter): Promise<Connection[]>`
   - `Registry.revokeConnection(id: string, reason: string): Promise<void>`
   - `Registry.recordSpend(id: string, cents: number): Promise<void>`
   - `Registry.getSpendWindow(id: string, windowSec: number): Promise<number>`
3. All writes are transactional; all reads use prepared statements; no string-interp SQL

**Acceptance:** CRUD tests covering happy path + error paths. Registry persists across process restart.

### Task 4 — `@kybernesis/arp-audit`

1. Append-only log written to a JSON Lines file in the agent's data dir (`audit/<connection_id>.jsonl`)
2. Each line:
   ```json
   {
     "seq": 42,
     "timestamp": "2026-04-22T...",
     "msg_id": "...",
     "decision": "allow",
     "policies_fired": ["..."],
     "obligations": [...],
     "spend_delta_cents": 2,
     "prev_hash": "sha256:...",
     "self_hash": "sha256:..."
   }
   ```
3. `self_hash = sha256(JCS_canonicalize(entry minus self_hash))`
4. Verification utility: `verifyAuditChain(path: string): { valid: boolean; firstBreakAt?: number }`

**Acceptance:** write 100 entries, verify chain, tamper with one, assert `verifyAuditChain` detects at that index.

### Task 5 — `@kybernesis/arp-pdp`

1. Wraps `@cedar-policy/cedar-wasm`
2. Exports:
   ```ts
   type PdpDecision = {
     decision: 'allow' | 'deny';
     obligations: Obligation[];
     policies_fired: string[];
     reasons: string[];
   };

   function createPdp(schemaJson: string): Pdp;

   interface Pdp {
     evaluate(input: {
       cedarPolicies: string[];          // permit/forbid set
       obligationPolicies: string[];     // the ARP-extended @obligation rules
       principal: Entity;
       action: string;
       resource: Entity;
       context: Record<string, unknown>;
     }): PdpDecision;
   }
   ```
3. Obligation rules: parse `@obligation("name")` annotation from our Cedar extension; collect params; return alongside allow/deny
4. Deny-by-default; permits + forbids evaluated per Cedar semantics; forbid wins over permit

**Acceptance:** tests mirror the 10 worked examples in `ARP-policy-examples.md`. For each, construct the evaluation input and assert the expected decision + obligations.

### Task 6 — `@kybernesis/arp-transport`

1. DIDComm v2 over HTTPS using `@veramo/did-comm`
2. Exports:
   - `createTransport(options: { did: string; keyStore: KeyStore; resolver: DidResolver }): Transport`
   - `Transport.send(to: string, payload: DidCommMessage): Promise<void>`
   - `Transport.listen(handler: (msg: DidCommMessage, meta: MessageMeta) => Promise<void>): void`
   - Inbound mailbox (SQLite-backed; peers POST, we poll from handler loop)
3. Envelope shape from `ARP-architecture.md §Layer 3`. Reject malformed envelopes with 400.

**Acceptance:** two in-process agents exchange a signed DIDComm message end-to-end; signature validates; message is stored in mailbox and delivered to handler.

### Task 7 — `@kybernesis/arp-runtime`

1. Hono server exposing:
   - `POST /didcomm` — inbound DIDComm v2 envelope
   - `GET /.well-known/did.json` — served from templates + current key state
   - `GET /.well-known/agent-card.json` — same
   - `GET /.well-known/arp.json` — same
   - `GET /.well-known/revocations.json` — proxied from owner subdomain if separate host
   - `POST /pair` — accept pairing proposals (handler delegated to Phase 4 later; stub returns 501 in Phase 2)
   - `GET /health` — returns `{ ok: true, version, uptime_ms }`
2. Request pipeline on `/didcomm`:
   ```
   decrypt+verify → load Connection Token → verify not revoked →
   PDP.evaluate → if allow → dispatch to handler → egress PDP re-check →
   audit.log → send reply
   ```
3. Config loaded from env + a `handoff.json` file path
4. Startup sequence:
   a. Load handoff bundle
   b. Read private key from local keystore (path from env)
   c. Generate TLS cert if absent, pin fingerprint in DID doc
   d. Open registry, audit log
   e. Start resolver with cache
   f. Start DIDComm transport
   g. Start Hono server on configured port
5. Graceful shutdown on SIGTERM: stop accepting new requests, finish in-flight, close DB, flush audit

**Acceptance:** `apps/runtime-bin` starts the reference agent, serves well-known docs, accepts a signed DIDComm message, evaluates a test policy, returns a reply.

### Task 8 — Reference agent binary (`apps/runtime-bin`)

1. TS binary that wires all the packages together
2. CLI:
   - `runtime-bin start --handoff <path>` — start the agent
   - `runtime-bin status` — query `/health` on localhost
   - `runtime-bin audit verify <connection_id>` — run the audit chain verifier
3. No custom agent logic — this is a reference harness used for tests

**Acceptance:** `runtime-bin start` boots; `runtime-bin status` returns ok within 3s of start; `runtime-bin audit verify` runs green.

### Task 9 — Per-connection memory partitioning (prototype layer)

Reference agent needs to demonstrate the isolation model for Phase 5 demos:

1. In-memory store keyed by `connection_id`
2. Any write from a handler is tagged with the current connection
3. Reads filter strictly by `connection_id`
4. Expose simple API: `memory.set(conn, key, value)`, `memory.get(conn, key)`
5. Does not apply to the reference agent's "knowledge" — just proves the isolation boundary

**Acceptance:** regression test — agent writes fact under connection A, asks under connection B, receives null. Never leaks.

### Task 10 — Two-agent integration test harness

At `tests/phase-2/two-agents.test.ts`:

1. Spin up two `runtime-bin` instances on localhost:4401 and :4402
2. Pre-seed both with a valid Connection Token (signed by a test principal key)
3. Agent A sends DIDComm envelope to Agent B
4. Agent B's PDP evaluates the test policy (allow), replies
5. Assert the full round-trip completes with expected audit entries on both sides
6. Repeat with a deny-triggering request; assert denial + audit reflects it
7. Revoke the connection; send another request; assert rejection with revocation reason

**Acceptance:** all three cases pass.

---

## 5. Acceptance tests (phase-level)

From repo root:
```bash
pnpm install
pnpm -r typecheck
pnpm -r build
pnpm -r test
pnpm -r lint
pnpm --filter tests/phase-2 test
```

All exit 0.

---

## 6. Deliverables

- Seven working packages in the monorepo
- Reference agent binary (`runtime-bin`) usable for integration tests
- Integration test suite proving end-to-end happy path + revocation
- README per package
- Updated changesets bumping each package to `0.2.0`

---

## 7. Handoff to Phase 3

Phase 3 (Sidecar) consumes:

- `@kybernesis/arp-runtime` as the binary to containerize
- `handoff.json` as the input config format (already defined in `@kybernesis/arp-spec`)
- `runtime-bin` startup logic (port binding, config loading, graceful shutdown)

Phase 3 adds Docker + systemd + first-boot UX on top of what this phase produces. No refactors into Phase 2 packages should be required.

---

## 8. v0 decisions (do not reopen)

- SQLite (single-writer) for agent-local state; no Postgres in this phase
- DID-pinned TLS only; no Let's Encrypt
- DIDComm v2 only; A2A-HTTPS stubbed
- Cedar policies with `@obligation` annotation as our extension; parsed by a custom shim in `@kybernesis/arp-pdp`
- Single-process, single-agent per binary; no multi-tenancy (that's Phase 7)
- No retries on DIDComm sends in v0 beyond the library's defaults
- HNS DoH against `hnsdoh.com`; `hnsd` local override via env only

---

## 9. Common pitfalls

- **Cedar WASM init is async.** Cache the initialized engine; don't re-init per request.
- **JCS canonicalization is strict about key ordering and number formatting.** Use the library; don't roll your own.
- **better-sqlite3 is sync.** Wrap calls in `await Promise.resolve()` if you want awaitable APIs for consistency, but it's genuinely blocking. Acceptable for v0.
- **DIDComm v2 uses JWM (JSON Web Message).** Don't confuse with JWS/JWE alone.
- **Fingerprint computation:** SHA-256 of DER bytes, not PEM bytes. Strip PEM headers first.
- **Audit log `prev_hash` of first entry is all-zeros.** Genesis entry has `prev_hash: "sha256:00...00"`.
- **Do not import DIDComm types outside `@kybernesis/arp-transport`.** The runtime, PDP, registry, and all other packages must talk to transport via the `Transport` interface only. This keeps future transports (A2A, etc.) as drop-in swaps rather than cross-package rewrites. If you find yourself reaching for `@veramo/did-comm` in `@kybernesis/arp-runtime` or anywhere else, stop — add the capability to `@kybernesis/arp-transport`'s interface instead.
