# ARP × Headless Domains — Parallel Build Brief

> **Update 2026-04-24 (Phase 8.5):** Self.xyz prompts have been removed from both Setup ARP flows. The authoritative amendment is `ARP-tld-integration-spec-v2.1.md`. If your in-flight implementation includes a Self.xyz sign-in widget, the migration is three small UX edits — see v2.1 §8.

**Reader:** Headless Domains engineering (human + their Claude Code / AI agent).
**Purpose:** executable plan for building the TLD-side ARP integration on Headless's side *in parallel with* the ARP core team's remaining phases. You can start today; nothing in this doc waits on us.
**Authoritative spec:** `ARP-tld-integration-spec-v2.md` in the ARP repo — that's the contract. This doc is the executable plan for implementing that contract.

---

## 0. Can you start now? Yes.

The TLD-side integration is fully self-contained. You need:

- The JSON schemas in `@kybernesis/arp-spec` (source in `github.com/KybernesisAI/arp` under `packages/spec/` — not published to npm yet, but readable now).
- The template functions in `@kybernesis/arp-templates` (same repo, `packages/templates/`).
- The DNS record conventions + well-known paths defined in `ARP-tld-integration-spec-v2.md §§ 4–6`.

**You don't need our runtime, SDK, or owner app to build your side.** The seam between us is public DNS + HTTPS + two npm packages. Once our Phase 9 ships, we run our compliance testkit against a staging domain you provision and confirm 8/8 green — that's the certification moment.

**Timeline:**

| ARP core side | Headless side |
|---|---|
| Phase 4 (pairing + owner app) — in progress | Scaffold provisioner + well-known hosting |
| Phase 5 (reference agents + testkit) | Dashboard UI + button flow |
| Phase 6 (SDKs + adapters) | Handoff emitter + local dev integration |
| Phase 7 (cloud) | Cloud-redirect target live on your side |
| Phase 8 (mobile) | — (no Headless dep) |
| Phase 9 (launch) | Compliance gate + production flip |

We recommend finishing Headless-side by the end of our Phase 7 so our Phase 8 testers can provision live `.chatbot` / `.agent` domains through your flow.

---

## 1. The UX you're building — two buttons on each owned domain

On the Headless domain-management dashboard, next to each registered domain add two buttons:

```
ian.chatbot         [ Manage DNS ]  [ Setup ARP Local ]  [ Setup ARP Cloud ]
dave.chatbot        [ Manage DNS ]  [ Setup ARP Local ]  [ Setup ARP Cloud ]
nick.chatbot        ✓ ARP Local active · [ Manage agent ] [ Revoke ARP ]
```

### Button: **Setup ARP Local**
User runs the agent on their own hardware (Mac + tunnel, or VPS with public IP). Maps to Mode B in `ARP-installation-and-hosting.md`.

Flow:
1. User clicks the button.
2. Browser-side: generate an Ed25519 keypair with `@noble/ed25519`. Store the public key; the private key goes into the user's browser wallet (or — if no wallet — prompt them to save it as a file they'll later drop into the sidecar's data dir).
3. Headless backend: call our `@kybernesis/arp-templates` to build a default DID doc, agent card, and `arp.json`. Host them at `https://<domain>/.well-known/did.json`, `agent-card.json`, `arp.json` (or delegate to the user's sidecar once running).
4. Headless backend: publish the four DNS TXT records per `ARP-tld-integration-spec-v2.md §5.1`.
5. Collect the owner's principal DID via the two-option chooser from `ARP-tld-integration-spec-v2.1.md §4`:
   - **Option A (recommended):** "Use ARP Cloud account" — redirect to `arp.cloud/onboard?domain=<sld>&registrar=headless&callback=<url>`. ARP Cloud returns a principal DID + signed representation JWT via your callback.
   - **Option B (advanced):** "Generate now" — in-browser Ed25519 keypair generation (`@noble/ed25519`), private key downloads as a recovery file, principal DID is `did:key:z...`. User must confirm "I've saved my recovery phrase" before continuing.
   Do not prompt for Self.xyz sign-in.
6. Create the owner subdomain (`<owner>.<domain>`) and publish the signed `representation.jwt`.
7. Emit a **handoff bundle** (see §5) and give the user two download options:
   - **Download handoff.json** — user drops it into `~/<agent>/handoff.json` and runs the sidecar docker command
   - **QR code** — user scans with our (future) mobile app for seamless install
8. Show the exact `docker run` command from `ARP-example-atlas-kyberbot.md` (or the VPS variant) with all placeholders pre-filled.
9. Mark the domain state = `arp_local_provisioned`. A background task polls the agent's `/health` every 5 min; once the sidecar is running and healthy, state → `arp_active`.

### Button: **Setup ARP Cloud**
Headless and we (via ARP Cloud) handle everything internet-facing. User just runs a tiny outbound client. Maps to Mode A.

Flow:
1. User clicks the button.
2. Browser-side: same Ed25519 keypair generation.
3. Headless backend: same DID doc / agent card / `arp.json` generation.
4. Headless backend: same DNS records, but point the domain's A record at `arp.cloud`'s ingress IP (we publish a stable IP + AAAA pair for this).
5. Headless backend: publish the well-known files AT `arp.cloud/agents/<did>/...` via our provisioning API (available once our Phase 7 ships — stub until then).
6. Redirect the user to `arp.cloud/onboard?domain=<sld>&registrar=headless` immediately after step 5. ARP Cloud onboards the user (browser-held did:key), creates the tenant, and calls back to your `POST /api/v1/arp/domains/<sld>/bind-principal` endpoint with the principal DID, public key multibase, and signed representation JWT. You then publish the `_principal` TXT record and host the representation JWT per §5.2 + §6.4 of the base spec.
7. Emit the handoff bundle + **redirect the user to `https://app.arp.spec/onboard?handoff=<b64>`** where they complete their account and install the cloud client locally.
8. Mark the domain state = `arp_cloud_provisioned`. We take over health monitoring once the user's cloud client connects.

---

## 2. Domain-state machine

```
              ┌─────────────────────────┐
              │  DOMAIN_REGISTERED       │  (user owns domain, no ARP)
              └──────────┬───────────────┘
                         │ click "Setup ARP Local/Cloud"
                         ▼
              ┌─────────────────────────┐
              │  ARP_PROVISIONING       │  (generating, DNS propagating)
              └──────────┬───────────────┘
                         │ well-known served + DNS recs live
                         ▼
              ┌─────────────────────────┐
              │  ARP_PROVISIONED        │  (handoff emitted; waiting for runtime)
              └──────────┬───────────────┘
                         │ /health poll succeeds OR cloud client connects
                         ▼
              ┌─────────────────────────┐
              │  ARP_ACTIVE             │  (agent live + pairable)
              └──────────┬───────────────┘
                 │              │
       [Revoke ARP]        [Owner transfers / rotates]
                 │              │
                 ▼              ▼
       DOMAIN_REGISTERED   ARP_PROVISIONING
```

Transition rules:
- `ARP_PROVISIONING` is transient (≤5 minutes); auto-rollback on timeout.
- `ARP_PROVISIONED` → `ARP_ACTIVE` happens when the agent responds to `/health` with `{ ok: true }` (local) or the cloud client authenticates over WebSocket (cloud).
- `ARP_ACTIVE` → revoked: wipes all DNS records, deletes well-known files, invalidates the handoff bundle's bootstrap token. Agent connections all die; peers see the revocation via DNS TXT + `revocations.json`.

---

## 3. Reader orientation (for your Claude Code session)

**Tech pins — use whatever Headless already uses.** This is your codebase; no impositions. The *contract* is what matters (DNS records, JSON shapes, ACME flow). Implementation language / framework is yours.

**Sources of truth, in order:**

1. `ARP-tld-integration-spec-v2.md` — THE CONTRACT. Every DNS record, every JSON shape, every HTTP response defined.
2. `ARP-installation-and-hosting.md` — the three install modes and what each expects from your provisioner.
3. `ARP-headless-card-bridging.md` — how your existing card format coexists with ARP's.
4. `ARP-scope-catalog-v1.md` — the 50 scopes your consent UX links to (you don't author scopes, you link to ours).
5. `ARP-hns-resolution.md` — HNS DoH strategy; relevant if you run your own resolver.

**Packages you'll consume from our repo** (readable at `github.com/KybernesisAI/arp`):

| Package | Purpose |
|---|---|
| `@kybernesis/arp-spec` (`packages/spec/`) | JSON schemas + constants (reserved names, TTLs, well-known paths). Validate every payload against these. |
| `@kybernesis/arp-templates` (`packages/templates/`) | Pure functions that produce valid DID docs, agent cards, `arp.json`, representation VCs, revocations. Call these from your provisioner. |
| `@kybernesis/arp-scope-catalog` (`packages/scope-catalog/`) | 50 scopes + compiler. You don't typically invoke the compiler; you just expose the catalog manifest URL in your consent UX. |

These three aren't published to npm yet (our Phase 9 releases to `latest`). Until then, either:
- Vendor them into your repo (pin to a commit SHA)
- Install from git (pnpm/npm both support `"@kybernesis/arp-spec": "github:KybernesisAI/arp#<sha>&path:/packages/spec"`)
- Mirror the schemas and templates manually (acceptable for a first pass; sync on our first npm release)

---

## 4. What to build — task list

### Task 1 — Provisioner service
A backend service that, given a domain + owner public key + principal DID:

1. Calls `@kybernesis/arp-templates` to build the DID doc, agent card, `arp.json`.
2. Signs and builds the Representation VC JWT (owner's key, EdDSA, JWS compact).
3. Returns a package of artifacts + metadata to the orchestrator.

Pure function. No side effects. Testable in isolation.

### Task 2 — DNS orchestrator
Extends your existing DNS management backend to publish:

- `A` or `AAAA` records at the apex
- `CNAME` at the owner subdomain
- Four TXT records (`_arp`, `_did`, `_didcomm`, `_revocation`) with exact formats from `ARP-tld-integration-spec-v2.md §5.1`

Idempotent. Replay-safe. Must handle partial failures (if `_did` TXT publish fails after `_arp` succeeded, roll back the whole set).

### Task 3 — Well-known file hoster
HTTPS endpoint (your infra or delegated to the sidecar) that serves:

- `/.well-known/did.json`
- `/.well-known/agent-card.json`
- `/.well-known/arp.json`

Content-Type: `application/json; charset=utf-8`. Cache-Control: `public, max-age=300`. CORS: `Access-Control-Allow-Origin: *`. These files are public metadata.

For **Setup ARP Local**: host these on Headless infrastructure until the user's sidecar is live, then the user's sidecar serves them from their host. The A record stays pointed at whichever is currently authoritative.

For **Setup ARP Cloud**: delegate to `arp.cloud/agents/<did>/*` (our Phase 7 API).

### Task 4 — Owner subdomain hoster
At `<owner>.<domain>`, serve:

- `/.well-known/representation.jwt` (signed VC)
- `/revocations.json` (signed list)

Same content-type/caching rules. On revocation, the user (via our owner app) POSTs a new signed revocations.json back to you for hosting.

### Task 5 — Handoff bundle emitter

> **Important: the handoff bundle is NOT the same thing as your existing agent card / manifest.** The agent card (your current `agent.json` and ARP's `/.well-known/agent-card.json`) is public discovery metadata, always live at a well-known URL, readable by anyone. The handoff bundle is a **private install artifact**: emitted once per provisioning, delivered directly to the buyer, consumed by the sidecar's first boot, and never served publicly. Two separate documents with two separate lifecycles.

Build the handoff bundle JSON per `ARP-installation-and-hosting.md §2`. Must include:

- `arp_version`, `agent_did`, `principal_did`, `public_key_multibase`
- `well_known_urls` (3 URLs)
- `owner_subdomain`
- `registrar` metadata (your API base + a time-limited API key the sidecar uses to rotate DNS records)
- `scope_catalog_version: "v1"`
- `bootstrap_token` — a 15-minute JWT scoped to the sidecar first-boot takeover
- `hosting_defaults` + `install_guides` URLs

Return to the user as a file download, a QR code (for scanning into a future mobile app), and/or a redirect to `app.arp.spec/onboard?handoff=<b64>`.

### Task 6 — "Setup ARP" buttons on dashboard
The UI in §1. Handle:

- Button click → modal walkthrough (explain what's happening)
- Progress indicator during `ARP_PROVISIONING`
- Success screen with `docker run` command (Local) or cloud redirect (Cloud)
- State display next to every domain (Registered / Provisioning / Active / Revoked)
- "Manage agent" link on active rows → deep-links to our owner app (`ian.<domain>.hns.to` via gateway, or `app.arp.spec` for cloud users)

### Task 7 — Reserved-names enforcement
Per `ARP-tld-integration-spec-v2.md §4`, refuse registration of:

- Protocol-reserved under-dot names: `_arp`, `_did`, `_principal`, `_didcomm`, `_revocation`, `_well-known`, `_arp-v1`, `_arp-v2`, `_arp-v3`
- Infrastructure-reserved: `system`, `registry`, `discovery`, `directory`, `gateway`, `bootstrap`, `test`, `example`
- Single-letter/digit + common words (held for editorial)

Apply to both `.chatbot` and `.agent` TLDs you operate.

### Task 8 — Compliance test plumbing
Provide a staging environment where we can point `@kybernesis/arp-testkit audit <domain>` and get 8/8 green (see `ARP-phase-5-reference-agents-testkit.md` for what the probes check). This is the certification gate at Phase 9.

### Task 9 — Registrar API surface
Expose REST endpoints we can call from our owner app / SDK (per `ARP-tld-integration-spec-v2.md §3.4`):

```
POST   /domains                   register SLD
GET    /domains/:name             read state
PUT    /domains/:name/records     upsert records (replace set for a given name+type)
DELETE /domains/:name/records/:id remove single record
POST   /domains/:name/subdomains  create subdomain
POST   /domains/:name/certs       trigger ACME issuance (if ACME-signed certs are wanted; v0 uses DID-pinned TLS which doesn't need this endpoint)
```

Auth via bearer token.

---

## 5. Acceptance (how you know you're done)

Per `ARP-tld-integration-spec-v2.md §12`:

- [ ] Hybrid resolver passes ACME challenges + supports TXT/CNAME at required names (verified end-to-end against Let's Encrypt staging)
- [ ] Reserved-names list from §4 published on your side and honored (attempts to register fail)
- [ ] "Setup ARP agent" checkbox / buttons live in your checkout + dashboard flows
- [ ] Registrar API endpoints from §3.4 exposed with documented auth
- [ ] `@kybernesis/arp-testkit audit <test-domain>` returns 8/8 green against a Headless-provisioned domain

Report those five results to us; we run the testkit audit ourselves and co-sign.

---

## 6. What's in motion on our side (so you can plan around it)

| Phase | What ships | Dependency for you |
|---|---|---|
| Phase 4 (in progress) | Owner app + pairing protocol + consent UI | None — you don't need our owner app to provision. Users can click the "Manage agent" link once your dashboard links to `ian.<domain>.hns.to` (gateway URL works pre-Phase 4 for static content; dynamic after Phase 4 merges). |
| Phase 5 | Reference agents (`samantha.agent`, `ghost.agent`) + `@kybernesis/arp-testkit` | Your staging provisioned test domain should pass the testkit audit. You can pre-test by pointing the testkit at any conformant stub agent. |
| Phase 6 | SDKs + adapters (KyberBot, OpenClaw, etc.) | None. Users install adapters independent of Headless. |
| Phase 7 | ARP Cloud multi-tenant runtime + `app.arp.spec` + `@kybernesis/arp-cloud-client` | Your "Setup ARP Cloud" button redirect target becomes live. Stub it before then (redirect to a holding page that says "ARP Cloud launches soon"). |
| Phase 8 | iOS + Android mobile apps | None. Your QR codes embed the handoff; the mobile app scans them. |
| Phase 9 | Public launch | We run the testkit audit against your staging → co-sign → you flip the "ARP" buttons to public. |

You can ship your side before we ship ours. Keep the buttons behind a feature flag until Phase 9 co-sign.

---

## 7. Hand-off artifacts we provide

You'll want these as inputs; we'll publish them as releases ship:

| Artifact | Source | Status |
|---|---|---|
| `@kybernesis/arp-spec` JSON Schemas | `github.com/KybernesisAI/arp/packages/spec/json-schema/` | Available now (on `main`) |
| `@kybernesis/arp-templates` functions | `github.com/KybernesisAI/arp/packages/templates/src/` | Available now |
| Scope catalog manifest | `github.com/KybernesisAI/arp/packages/scope-catalog/generated/manifest.json` | Available now |
| Cedar schema JSON | `packages/spec/src/cedar-schema.json` | Available now |
| ACME staging test domain | — | Phase 5 (you can pre-test with your own throwaway) |
| `@kybernesis/arp-testkit` | `github.com/KybernesisAI/arp/packages/testkit/` | Phase 5 |
| `arp.cloud` ingress IP + handoff-forwarding API | — | Phase 7 |

---

## 8. Contact / coordination

Questions? Open an issue in `github.com/KybernesisAI/arp` tagged `tld-integration`. We'll review and respond.

For the compliance audit at Phase 9: email when your staging is ready and we'll run the testkit.

---

## 8.5 Artifact glossary (quick reference)

For clarity when talking across teams:

| Name | Type | Lives at | New for you? |
|---|---|---|---|
| **Headless agent card** (e.g. `agent.json`) | Public metadata | Wherever you serve it today | No — you already have this |
| **ARP agent card** (`agent-card.json`) | Public metadata | `/.well-known/agent-card.json` on the agent's domain | Yes — new file, new path, different shape |
| **DID document** (`did.json`) | Public identity | `/.well-known/did.json` on the agent's domain | Yes — new |
| **arp.json** | Public protocol introspection | `/.well-known/arp.json` on the agent's domain | Yes — new |
| **Representation VC** (`representation.jwt`) | Public but signed | `/.well-known/representation.jwt` on the owner subdomain | Yes — new |
| **Revocations list** (`revocations.json`) | Public but signed | `/.well-known/revocations.json` on the owner subdomain | Yes — new |
| **Handoff bundle** (`handoff.json`) | **Private install artifact** | Emitted by your provisioner; **never served publicly**; handed to the buyer once at "Setup ARP" button click | Yes — new, completely different from any agent card |
| **Cedar policy schema** (`policy-schema.json`) | Public | `/.well-known/policy-schema.json` on the agent's domain (the sidecar serves this automatically) | No — the sidecar handles it |

Your existing agent card keeps being served at its current URL — don't touch it. The new ARP artifacts go to new paths and new files. The handoff bundle is the only artifact the user directly downloads / scans / carries between systems.

---

## 9. Short version

- **Yes, start now.** The spec (`ARP-tld-integration-spec-v2.md`) is complete and locked; our core-side phases don't gate you.
- **Build two buttons.** "Setup ARP Local" emits a handoff bundle + docker install instructions; "Setup ARP Cloud" emits a handoff bundle + redirect to `app.arp.spec`.
- **Your existing agent card coexists.** Nothing you're doing today conflicts with ARP. The ARP card goes at a new path; everything proprietary lives under `extensions`.
- **Compliance gate = `@kybernesis/arp-testkit audit <domain>` returns 8/8 green.** That's the Phase 9 co-sign moment.

*Parallel build brief v0.1 — 2026-04-23*
