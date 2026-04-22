# ARP × `.agent` TLD Integration — Implementation Spec v0.1

**Reader:** this document is written for an autonomous coding agent. Every requirement is phrased as an executable directive. Where a choice exists, this document picks one and commits to it. Do not ask for clarification — implement as specified. If an instruction conflicts with another, the lower-numbered section wins.

---

## 0. Orientation

**Project type:** backend service + registrar integration for a Handshake TLD (`.agent`).

**Language / runtime:** TypeScript on Node.js 24 LTS. No other runtimes.

**Framework:** Hono for HTTP, running on Vercel Functions (Fluid Compute) in production, plain Node for local dev.

**Package manager:** `pnpm`.

**Repo layout (create exactly this):**
```
/
├── packages/
│   ├── spec/                      # JSON schemas + constants, no runtime code  (@arp/spec)
│   ├── templates/                 # DID doc, agent card, arp.json generators   (@arp/templates)
│   ├── sdk/                       # Bootstrap SDK consumed by registrar        (@arp/sdk)
│   ├── testkit/                   # Automated §9 test suite                    (@arp/testkit)
│   └── owner-app/                 # Reference owner UI (Next.js 16 App Router)
├── apps/
│   └── registrar-integration/     # Reference registrar-side integration
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

**Libraries (use these exact versions or the latest minor):**

| Purpose | Package |
|---|---|
| DID resolution | `did-resolver` + `web-did-resolver` |
| Key generation | `@noble/ed25519` |
| JWT signing | `jose` |
| JSON canonicalization | `canonicalize` (RFC 8785 JCS) |
| Hashing | Node built-in `crypto` (SHA-256) |
| DIDComm v2 | `@veramo/did-comm` |
| Cedar policy engine | `@cedar-policy/cedar-wasm` |
| UCAN tokens | `@ucans/ucans` |
| HTTP framework | `hono` |
| ACME client | `acme-client` |
| Schema validation | `zod` |

**Out of scope for v0 (do not implement):**
- x402 payment rails (stub the interface only)
- Self.xyz integration beyond accepting a DID string (no VC verification logic yet)
- Scope catalog content (stub with an empty array; catalog lives in a separate work item)
- Audit log chaining (log to plain JSON file, hash-chain comes in v0.2)
- Directory service / `registry.agent`
- Multi-principal agents (assume exactly one principal for v0)
- Agent transfer flow (owner subdomain rewrite)

**Error handling contract:** every HTTP endpoint returns `{ ok: boolean, data?: T, error?: { code: string, message: string } }`. Never throw across boundaries. Log errors with structured JSON (`pino`).

**Idempotency:** all registration steps in §7 MUST be idempotent. Re-running produces the same state without error. Use deterministic IDs (sha256 of inputs).

---

## 1. Context

The Agent Relationship Protocol (ARP) is a communications + permissions layer on top of the `.agent` naming layer. This spec defines the seam between the TLD/registrar (operated by the `.agent` owners) and the ARP protocol (owned by this codebase). The TLD side operates DNS + registration; the ARP side defines records + well-known documents + runtime.

Companion: `ARP-architecture.md` in the same directory.

---

## 2. Responsibility split

| Plane | Owner | Responsibilities |
|---|---|---|
| TLD + registration | Registrar (Headless / `.agent` ops) | HNS zone, registrar API, hybrid resolver, ACME, reserved-name policy |
| Protocol + tooling | ARP codebase (this repo) | Spec artifacts, SDKs, Cedar PDP, DIDComm runtime, consent UX |
| Interface | §3–§9 below | DNS records, well-known paths, registration-flow integration |

---

## 3. TLD-side requirements (verify these before shipping)

### 3.1 DNS primitives
Registrar MUST allow every `.agent` SLD to publish:
- `A` and `AAAA` records at apex
- `CNAME` on any subdomain
- `TXT` records at the names listed in §5
- Arbitrary owner-created subdomains (including `{owner}.{agent}.agent`)

### 3.2 Resolver
Hybrid HNS→DNS bridge MUST:
- Answer queries from standard stub resolvers (tested: `dig`, `node:dns`, `curl` with system resolver)
- Honor per-record TTLs
- Return authoritative answers within 500ms p95

### 3.3 ACME / HTTPS
Every `.agent` SLD MUST be able to obtain a Let's Encrypt certificate via HTTP-01 challenge. This is the critical-path dependency. If this fails, the entire v0 is non-functional.

### 3.4 Registrar API
Registrar MUST expose REST endpoints for:
- `POST /domains` — register SLD
- `GET /domains/:name` — read state
- `PUT /domains/:name/records` — upsert records (replace set for a given name+type)
- `DELETE /domains/:name/records/:recordId` — remove single record
- `POST /domains/:name/subdomains` — create subdomain
- `POST /domains/:name/certs` — trigger ACME issuance

Auth: bearer token in `Authorization` header.

---

## 4. Reserved names (registrar MUST refuse registration)

### 4.1 Protocol-reserved
```
_arp.agent
_did.agent
_principal.agent
_didcomm.agent
_revocation.agent
_well-known.agent
_arp-v1.agent
_arp-v2.agent
_arp-v3.agent
```

### 4.2 Infrastructure-reserved
```
system.agent
registry.agent
discovery.agent
directory.agent
gateway.agent
bootstrap.agent
test.agent
example.agent
```

### 4.3 Premium holdback
All single-letter and single-digit SLDs: `a.agent` through `z.agent`, `0.agent` through `9.agent`.

Common words held for editorial allocation: `my.agent`, `the.agent`, `your.agent`, `our.agent`, `an.agent`, `this.agent`, `that.agent`.

---

## 5. Required DNS records per registered SLD

Example SLD: `samantha.agent`. Replace literally for any other SLD.

### 5.1 Apex

| Name | Type | TTL | Value (exact format) |
|---|---|---|---|
| `samantha.agent` | A | 300 | IPv4 of agent server |
| `samantha.agent` | AAAA | 300 | IPv6 of agent server (optional) |
| `_arp.samantha.agent` | TXT | 300 | `v=1; caps=didcomm,a2a; pdp=cedar` |
| `_did.samantha.agent` | TXT | 300 | `did=did:web:samantha.agent; fp=SHA256_JCS_OF_DID_DOC` |
| `_didcomm.samantha.agent` | TXT | 300 | `url=https://samantha.agent/didcomm; v=2` |
| `_revocation.samantha.agent` | TXT | 300 | `url=https://ian.samantha.agent/revocations.json; poll=300` |

**Computation rules:**
- `SHA256_JCS_OF_DID_DOC` = lowercase hex of SHA-256 of RFC 8785 JCS canonicalization of the JSON in `/.well-known/did.json`. Recompute on every DID-doc change; update TXT atomically after publishing new doc.

### 5.2 Owner subdomain

For owner `ian` on agent `samantha.agent`:

| Name | Type | TTL | Value |
|---|---|---|---|
| `ian.samantha.agent` | CNAME | 300 | Owner control-plane hostname |
| `_principal.ian.samantha.agent` | TXT | 300 | `did=did:web:ian.self.xyz; rep=https://ian.samantha.agent/.well-known/representation.jwt` |

---

## 6. Required well-known HTTPS paths

All documents served with:
- `Content-Type: application/json; charset=utf-8`
- `Cache-Control: public, max-age=300`
- CORS: `Access-Control-Allow-Origin: *` (these are public metadata)

### 6.1 `/.well-known/did.json` — complete example

Serve this exact shape. Populate the three placeholder fields marked `// REPLACE`.

```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:web:samantha.agent",
  "controller": "did:web:ian.self.xyz",
  "verificationMethod": [
    {
      "id": "did:web:samantha.agent#key-1",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:web:samantha.agent",
      "publicKeyMultibase": "z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp"
    }
  ],
  "authentication": ["did:web:samantha.agent#key-1"],
  "assertionMethod": ["did:web:samantha.agent#key-1"],
  "keyAgreement": ["did:web:samantha.agent#key-1"],
  "service": [
    {
      "id": "did:web:samantha.agent#didcomm",
      "type": "DIDCommMessaging",
      "serviceEndpoint": "https://samantha.agent/didcomm",
      "accept": ["didcomm/v2"]
    },
    {
      "id": "did:web:samantha.agent#agent-card",
      "type": "AgentCard",
      "serviceEndpoint": "https://samantha.agent/.well-known/agent-card.json"
    }
  ],
  "principal": {
    "did": "did:web:ian.self.xyz",
    "representationVC": "https://ian.samantha.agent/.well-known/representation.jwt"
  }
}
```

Fields to replace for each new agent:
- `id`, all `did:web:samantha.agent` references → the new SLD's DID
- `controller`, `principal.did` → buyer-supplied principal DID
- `publicKeyMultibase` → Ed25519 public key in multibase z-base-58-btc encoding per W3C Multibase
- `service[0].serviceEndpoint`, `service[1].serviceEndpoint`, `principal.representationVC` → the new SLD's URLs

JSON schema lives at `packages/spec/schemas/did-doc.json`. Validate before serving.

### 6.2 `/.well-known/agent-card.json` — complete example

```json
{
  "arp_version": "0.1",
  "name": "Samantha",
  "did": "did:web:samantha.agent",
  "description": "Personal agent",
  "created_at": "2026-04-22T00:00:00Z",
  "endpoints": {
    "didcomm": "https://samantha.agent/didcomm",
    "a2a": "https://samantha.agent/a2a",
    "pairing": "https://samantha.agent/pair"
  },
  "accepted_protocols": ["didcomm/v2", "a2a/1.0"],
  "supported_scopes": [],
  "payment": {
    "x402_enabled": false,
    "currencies": [],
    "pricing_url": null
  },
  "vc_requirements": [],
  "policy": {
    "engine": "cedar",
    "schema": "https://samantha.agent/.well-known/policy-schema.json"
  }
}
```

JSON schema lives at `packages/spec/schemas/agent-card.json`.

### 6.3 `/.well-known/arp.json` — complete example

```json
{
  "version": "0.1",
  "capabilities": ["didcomm-v2", "cedar-pdp", "ucan-tokens"],
  "scope_catalog_url": "https://samantha.agent/.well-known/scope-catalog.json",
  "policy_schema_url": "https://samantha.agent/.well-known/policy-schema.json"
}
```

### 6.4 `{owner-subdomain}/.well-known/representation.jwt`

A JWS-signed JWT (RFC 7519 + RFC 7515) where:
- `alg`: `EdDSA`
- `kid`: the principal's DID + key ref (e.g., `did:web:ian.self.xyz#key-1`)
- Payload: a W3C Verifiable Credential with the shape:

```json
{
  "iss": "did:web:ian.self.xyz",
  "sub": "did:web:samantha.agent",
  "iat": 1745280000,
  "exp": 1776816000,
  "vc": {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    "type": ["VerifiableCredential", "AgentRepresentation"],
    "credentialSubject": {
      "id": "did:web:samantha.agent",
      "representedBy": "did:web:ian.self.xyz",
      "scope": "full",
      "constraints": {
        "maxConcurrentConnections": 100,
        "allowedTransferOfOwnership": false
      }
    }
  }
}
```

### 6.5 `{owner-subdomain}/revocations.json`

```json
{
  "issuer": "did:web:ian.self.xyz",
  "updated_at": "2026-04-22T00:00:00Z",
  "revocations": [
    {
      "type": "connection",
      "id": "conn_7a3f...",
      "revoked_at": "2026-04-22T10:00:00Z",
      "reason": "user_requested"
    },
    {
      "type": "key",
      "fingerprint": "sha256:abc123...",
      "revoked_at": "2026-04-15T08:00:00Z"
    }
  ],
  "signature": {
    "alg": "EdDSA",
    "kid": "did:web:ian.self.xyz#key-1",
    "value": "..."
  }
}
```

Signature covers the JCS canonicalization of the document with the `signature` field omitted.

---

## 7. Registration flow — exact steps

Invoked when a buyer completes checkout for `samantha.agent` AND selects "Set up as ARP agent" checkbox.

Execute in order. Each step is idempotent (re-running produces same state).

1. **Generate Ed25519 keypair** using `@noble/ed25519`. Private key returned to the buyer's browser wallet; public key retained server-side for provisioning only. Private key MUST NOT be persisted on the registrar.
2. **Derive DID** as `did:web:samantha.agent`.
3. **Build DID document** from template in `packages/arp-templates` with:
   - `id` = derived DID
   - `publicKeyMultibase` = Ed25519 public key in multibase encoding (`z` prefix, base58btc)
   - `controller` and `principal.did` = placeholder `did:web:unbound.agent` (buyer will bind next)
4. **Build agent card** from template with defaults; `name` = the SLD's first label (`samantha`), `description` = `"Personal agent"`.
5. **Build `arp.json`** from template (static content, only URL substitutions).
6. **Publish DNS records per §5.1** via registrar API. All apex records. Order: A/AAAA first, then TXT records (so `_did` TXT references a live DID doc).
7. **Issue ACME cert** via `POST /domains/samantha.agent/certs`. Block until issuance succeeds or fails. On failure, roll back DNS and return error.
8. **Host the well-known files** at `https://samantha.agent/.well-known/{did,agent-card,arp}.json`. Default hosting: Vercel Functions project owned by the registrar, with the apex pointed at it via A record from step 6. If buyer provides a custom endpoint during checkout, A record targets that instead and hosting is the buyer's responsibility.
9. **Collect owner binding** — prompt buyer for their principal DID (text input, validated against regex `^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$`).
10. **Create owner subdomain** via registrar API. Name: `{owner-label}.samantha.agent` where `{owner-label}` is the first label of the principal DID's method-specific-id or a buyer-supplied string (whichever the buyer picks).
11. **Provision representation JWT** — buyer signs the §6.4 payload with their principal key in their wallet; signed JWT is uploaded and served at `https://{owner}.samantha.agent/.well-known/representation.jwt`.
12. **Publish `_principal` TXT record** per §5.2.
13. **Update DID doc** — replace placeholder `controller` and `principal.did` with the real principal DID; republish; recompute `SHA256_JCS_OF_DID_DOC`; update `_did` TXT record.
14. **Emit handoff bundle** as JSON:

```json
{
  "agent_did": "did:web:samantha.agent",
  "principal_did": "did:web:ian.self.xyz",
  "public_key_multibase": "z6Mk...",
  "well_known_urls": {
    "did": "https://samantha.agent/.well-known/did.json",
    "agent_card": "https://samantha.agent/.well-known/agent-card.json",
    "arp": "https://samantha.agent/.well-known/arp.json"
  },
  "dns_records_published": ["A", "AAAA", "_arp TXT", "_did TXT", "_didcomm TXT", "_revocation TXT", "_principal TXT"],
  "cert_expires_at": "2026-07-22T00:00:00Z",
  "bootstrap_token": "one-time JWT scoped to arp-sdk takeover, exp 15min"
}
```

Return this bundle to the buyer's browser; the arp-sdk consumes it to take over runtime operation.

---

## 8. TLD-level discoverability records (implement in v0)

At the `.agent` TLD zone itself:

| Name | Type | TTL | Value |
|---|---|---|---|
| `_arp.agent` | TXT | 3600 | `spec=https://github.com/KybernesisAI/arp/releases/tag/v0.1; registry=none` |
| `_did-method.agent` | TXT | 3600 | `method=web; fallback=none` |

---

## 9. Acceptance test suite

Package `arp-testkit` runs these against a live staging domain. All MUST pass before declaring the integration shipped.

```ts
// packages/arp-testkit/tests/tld-integration.spec.ts
import { test, expect } from 'vitest';

const TEST_DOMAIN = 'arp-test.agent';

test('1. Register domain via registrar API', async () => { /* ... */ });
test('2. Publish apex DNS records', async () => { /* ... */ });
test('3. ACME cert issuance succeeds', async () => { /* ... */ });
test('4. did.json served over HTTPS with valid cert', async () => { /* ... */ });
test('5. did:web:arp-test.agent resolves via vanilla did-resolver', async () => { /* ... */ });
test('6. _arp TXT record queryable via dig', async () => { /* ... */ });
test('7. Owner subdomain resolves + serves representation.jwt', async () => { /* ... */ });
test('8. agent-card.json validates against JSON schema', async () => { /* ... */ });
test('9. Revocation list updates within poll interval', async () => { /* ... */ });
test('10. All §7 steps idempotent (run twice, no diff)', async () => { /* ... */ });
```

Each test has a clear assertion. Test 5 is the critical path — if it fails, stop all other work and fix the resolver/ACME pipeline first.

---

## 10. Deliverables from this codebase

Implement in this order:

1. `packages/spec/` (published as `@arp/spec`) — JSON schemas (`did-doc.json`, `agent-card.json`, `arp-json.json`, `representation-vc.json`, `revocations.json`), constants (reserved names, TTLs, library versions).
2. `packages/arp-templates` — pure functions that produce valid JSON given inputs.
3. `packages/arp-sdk` — the bootstrap SDK the registrar integration calls. Exports `bootstrapAgent(input): Promise<HandoffBundle>` implementing §7.
4. `packages/arp-testkit` — the §9 test suite, runnable against any `.agent` staging environment via env-var config.
5. `apps/registrar-integration` — a reference Hono app that wraps `arp-sdk` and exposes an HTTP API the registrar frontend calls during checkout.
6. `packages/arp-owner-app` — Next.js 16 reference app for the owner to manage their agent post-registration.

README.md at repo root explains how to run the §9 tests end-to-end against a test domain.

---

## 11. v0 decisions (do not reopen)

- DID method: `did:web` only.
- Transport: DIDComm v2 mailbox only. A2A-HTTPS stub is defined but not wired.
- Language: TypeScript.
- One principal per agent.
- One registrar (Headless) assumed; multi-registrar support is v0.2.
- No x402 in v0.
- No audit chain in v0 (plain append-only JSON log).
- No scope catalog content in v0 (empty array validates).
- Reserved-names list is closed for v0.

---

## 12. Done-when checklist

- [ ] Repo scaffolded per §0 layout
- [ ] All packages build with `pnpm -r build`
- [ ] JSON schemas published at `packages/spec/schemas/*`
- [ ] Templates produce spec-valid outputs for synthetic inputs
- [ ] `bootstrapAgent()` implements §7 steps 1–14 idempotently
- [ ] `arp-testkit` green against a staging `.agent` domain
- [ ] Reference owner app can load a registered agent's DID doc and render the agent card
- [ ] README has one-command local bootstrap (`pnpm dev`)
- [ ] Zero `TODO` or `FIXME` in shipped code paths

When every box is checked, v0 ships.
