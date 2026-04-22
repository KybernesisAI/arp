# ARP × `.agent` TLD Integration Specification

**Audience:** operators of the Handshake `.agent` TLD (Headless Domains et al.)
**Purpose:** tell the TLD side exactly what to do so `.agent` domains are natively ARP-compatible.
**Companion doc:** `ARP-architecture.md`
**Version:** 0.1 — April 2026

---

## 1. Context in one paragraph

The Agent Relationship Protocol (ARP) is the communications + permissions layer that sits on top of the `.agent` naming layer. For ARP to work, every `.agent` second-level domain (SLD) must expose a small, fixed set of DNS records and HTTPS-served JSON files at well-known paths. The TLD operators control the registration/resolution plane; we control the protocol plane. This doc defines the seam between them.

---

## 2. Division of responsibility

| Plane | Owner | Responsibilities |
|---|---|---|
| TLD + registration | Headless / `.agent` ops | HNS zone, registrar API, hybrid resolver, ACME-compatible DNS, reserved-name policy |
| Protocol + tooling | ARP team | Spec, SDKs, Cedar PDP, DIDComm runtime, consent UX, scope catalog |
| Interface | **This document** | DNS records, well-known paths, registration-flow integration |

Neither side touches the other's plane. The only shared surface is what's specified below.

---

## 3. What the TLD side must provide

### 3.1 DNS primitives

Every `.agent` SLD must support publishing:

- `A` / `AAAA` records at the apex
- `CNAME` records on any subdomain (including the owner subdomain)
- `TXT` records at reserved names (see §5)
- Owner-controlled zone management (so the owner can create arbitrary subdomains like `ian.samantha.agent`)

### 3.2 Resolver

The HNS → DNS bridge (hybrid resolver) must:

- Resolve all record types above from both HNS-aware and traditional DNS clients
- Be reachable from standard stub resolvers (so browsers, `curl`, `did-resolver` libraries all work out of the box)
- Cache with sane TTLs (recommend 300s default, overridable per record)
- Support DNSSEC where available

### 3.3 HTTPS / ACME

Every `.agent` SLD must be able to obtain a valid Let's Encrypt (or equivalent ACME CA) certificate. This means the resolver must pass HTTP-01 and/or DNS-01 challenges end-to-end. **This is the single most important technical requirement** — `did:web` resolution fails without it, and the entire identity layer rides on `did:web` in v0.

### 3.4 Registrar API

Programmatic endpoints for:
- Domain registration
- Record create / update / delete (all types above)
- Subdomain provisioning
- Key/nameserver configuration
- Bulk operations (for our onboarding tooling)

Auth via API key or OAuth; either is fine.

---

## 4. Reserved names (never auction, never allow registration)

### 4.1 Protocol-reserved (under-dot prefix)
```
_arp.agent
_did.agent
_principal.agent
_didcomm.agent
_revocation.agent
_well-known.agent
```

These must never resolve as normal SLDs. They may later be used for protocol-wide records at the TLD level.

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

Hold for ecosystem infrastructure. Do not auction.

### 4.3 Premium / editorial reserve
Hold all single-letter and single-digit SLDs (`a.agent` through `z.agent`, `0.agent` through `9.agent`) plus a short common-word list (`my.agent`, `the.agent`, `your.agent`, `our.agent`). These can be allocated later via editorial process.

### 4.4 Protocol version bumps
Reserve `_arp-v1.agent`, `_arp-v2.agent`, etc. for future protocol negotiation.

---

## 5. Required DNS records per agent SLD

For every registered `.agent` SLD (example: `samantha.agent`), the following records MUST be publishable and SHOULD be populated at registration time with sensible defaults.

### 5.1 Apex records

| Name | Type | Value | Purpose |
|---|---|---|---|
| `samantha.agent` | A/AAAA | IP of agent's server | HTTPS endpoint |
| `_arp.samantha.agent` | TXT | `v=1; caps=didcomm,a2a,x402; pdp=cedar` | Protocol version + feature flags |
| `_did.samantha.agent` | TXT | `did=did:web:samantha.agent; fp=<sha256>` | DID doc pointer + fingerprint for fast verify |
| `_didcomm.samantha.agent` | TXT | `url=https://samantha.agent/didcomm; v=2` | DIDComm v2 endpoint |

### 5.2 Owner subdomain records

For owner-binding at `{owner}.{agent}.agent` (example: `ian.samantha.agent`):

| Name | Type | Value | Purpose |
|---|---|---|---|
| `ian.samantha.agent` | CNAME or A | Points to owner's control-plane endpoint | Owner-only API host |
| `_principal.ian.samantha.agent` | TXT | `did=did:web:ian.self.xyz; rep=<vc-url>` | Principal DID + Representation VC URL |

### 5.3 Revocation distribution (optional at TLD level, recommended)

| Name | Type | Value | Purpose |
|---|---|---|---|
| `_revocation.samantha.agent` | TXT | `url=https://ian.samantha.agent/revocations.json; poll=300` | Where to fetch revocation list + poll interval |

---

## 6. Required well-known HTTPS paths

Each agent apex MUST serve these JSON documents over HTTPS:

### 6.1 `/.well-known/did.json`

The W3C DID document. Minimum viable shape:

```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:web:samantha.agent",
  "controller": "did:web:ian.self.xyz",
  "verificationMethod": [{
    "id": "did:web:samantha.agent#key-1",
    "type": "Ed25519VerificationKey2020",
    "controller": "did:web:samantha.agent",
    "publicKeyMultibase": "z6Mk..."
  }],
  "authentication": ["did:web:samantha.agent#key-1"],
  "assertionMethod": ["did:web:samantha.agent#key-1"],
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

### 6.2 `/.well-known/agent-card.json`

A2A-compatible agent capabilities card:

```json
{
  "arp_version": "0.1",
  "name": "Samantha",
  "did": "did:web:samantha.agent",
  "description": "Ian's personal agent",
  "endpoints": {
    "didcomm": "https://samantha.agent/didcomm",
    "a2a":     "https://samantha.agent/a2a",
    "pairing": "https://samantha.agent/pair"
  },
  "accepted_protocols": ["didcomm/v2", "a2a/1.0"],
  "supported_scopes": ["scope-catalog-v1"],
  "payment": {
    "x402_enabled": true,
    "currencies": ["USDC"],
    "pricing_url": "https://samantha.agent/.well-known/pricing.json"
  },
  "vc_requirements": ["self.xyz/human", "self.xyz/adult"]
}
```

### 6.3 `/.well-known/arp.json`

Quick protocol introspection:

```json
{
  "version": "0.1",
  "capabilities": ["didcomm-v2", "cedar-pdp", "ucan-tokens", "x402"],
  "scope_catalog": "https://arp.spec/scope-catalog/v1",
  "policy_schema": "https://arp.spec/cedar-schema/v1"
}
```

### 6.4 `{owner-subdomain}/.well-known/representation.jwt`

Example: `https://ian.samantha.agent/.well-known/representation.jwt`

Signed (by principal DID) JWT containing a W3C Verifiable Credential that asserts "`did:web:ian.self.xyz` represents-as `did:web:samantha.agent` until `<expiry>`, with these delegation limits." This is the cryptographic proof of the owner binding.

### 6.5 `{owner-subdomain}/revocations.json`

Append-only list of revoked Connection Tokens and key fingerprints, signed by the principal DID. Pollable at the interval advertised in the `_revocation` TXT record.

---

## 7. Registration flow — what Headless adds

When a buyer registers a new `.agent` SLD (e.g., `samantha.agent`), the checkout flow must offer a **"Set up as ARP agent"** one-click option. If selected, the registrar does the following, in order:

1. **Generate a keypair client-side** (Ed25519). Private key stored in the buyer's wallet/keychain; public key retained for provisioning. Private key never touches the server.
2. **Generate a default DID document** using §6.1 as the template, with the new public key and a placeholder `principal` pointing to a DID the buyer will bind next.
3. **Generate a default agent card** using §6.2 as the template.
4. **Generate `arp.json`** using §6.3 as the template.
5. **Publish the apex DNS records** per §5.1.
6. **Provision Let's Encrypt cert** for the apex + wildcard.
7. **Host the well-known JSON files** on a default agent-hosting endpoint (Headless-provided unless the buyer overrides with their own server).
8. **Collect owner binding:** prompt the buyer for their principal DID (e.g., their Self.xyz DID). Create:
   - The owner subdomain (`{owner}.{agent}.agent`)
   - The `_principal` TXT record per §5.2
   - A placeholder `representation.jwt` that the buyer signs with their principal key
9. **Emit a handoff bundle** — zip or encrypted blob containing: the DID doc, agent card, keypair reference, DNS state, and a one-shot bootstrap token for the ARP SDK to take over.

If the buyer does *not* select "Set up as ARP agent," the domain is registered bare — no records published, no certs issued, buyer configures manually. Don't block either path.

---

## 8. Reserved scope at the TLD level

The TLD operators SHOULD publish, at the TLD itself, a few discoverable records so agent clients can bootstrap without prior knowledge:

| Name | Type | Value | Purpose |
|---|---|---|---|
| `_arp.agent` | TXT | `spec=https://arp.spec/v0.1; registry=https://registry.agent` | Where to find the ARP spec + optional directory |
| `_did-method.agent` | TXT | `method=web; fallback=hns` | DID methods in use on this TLD |

These are optional for v0 but help future clients discover capabilities without hardcoding.

---

## 9. Minimum viable integration test

Before declaring the integration live, verify end-to-end with a test domain (`arp-test.agent`):

1. ✅ Register `arp-test.agent` via the registrar API.
2. ✅ Publish the §5.1 apex DNS records.
3. ✅ Issue a Let's Encrypt cert (HTTP-01 challenge must succeed).
4. ✅ Serve `/.well-known/did.json` over HTTPS with a valid cert.
5. ✅ Resolve `did:web:arp-test.agent` using a vanilla `did-resolver` npm package from a fresh machine → must return the DID doc.
6. ✅ Query `_arp.arp-test.agent` TXT record via `dig @<hybrid-resolver>` → must return the expected value.
7. ✅ Create subdomain `test-owner.arp-test.agent` → must resolve, serve `representation.jwt` over HTTPS.
8. ✅ From another machine, fetch `/.well-known/agent-card.json` and parse it against the JSON schema (we will publish this at `arp.spec/schema/agent-card-v1.json`).
9. ✅ Revoke a dummy Connection Token via the `revocations.json` flow; verify a fresh GET returns the updated list within one poll interval.

If any step fails, stop and fix before continuing. Test 5 (Let's Encrypt + `did:web` round-trip) is the critical path — everything else depends on it.

---

## 10. What we (ARP team) will deliver to the TLD side

To make §7 executable:

1. **Template generators** — scripts that produce valid DID docs, agent cards, `arp.json`, and revocation-list seeds. Headless embeds these in the registration flow.
2. **JSON schemas** for each well-known document — published at stable URLs under `arp.spec/schema/*`.
3. **Reference bootstrap SDK** — a TS/Python library Headless calls during checkout to do steps 1–9 of §7.
4. **Test suite** — the §9 tests, automated, runnable in Headless's CI.
5. **Owner app starter kit** — a reference web app so new buyers have somewhere to go after checkout to manage their agent.
6. **Spec pinning** — permanent versioned URLs (`arp.spec/v0.1`, `arp.spec/v1.0`) so Headless can hardcode references without breaking on our side.

---

## 11. Open questions parked for a follow-up conversation

- **Fee structure** — does ARP-enabled registration cost more than bare registration? Split?
- **Governance** — who arbitrates reserved-name disputes?
- **Naming disputes** — trademark holders wanting `pepsi.agent` etc. Editorial policy?
- **Transfer mechanics** — exact protocol when an agent's owner changes (owner-subdomain rewrite + all-connection re-consent).
- **Abandonment** — what happens when an SLD expires mid-connection?
- **Gateway agents** — agents hosted on Headless vs. self-hosted. Feature parity?
- **Directory service** — do we launch `registry.agent` as an opt-in yellow pages?

None of these block v0. Flag them, defer them, revisit after the first 10 live agents.

---

## 12. Summary — the five things Headless has to do

1. Confirm the hybrid resolver passes ACME challenges and supports TXT/CNAME at required names.
2. Publish the reserved-names list (§4) and honor it.
3. Add the "Set up as ARP agent" checkbox to the checkout flow, implementing §7.
4. Expose the registrar API surface described in §3.4.
5. Run the §9 test suite against a staging domain and share the results.

That's the whole contract on their side. Everything else — the protocol, the SDKs, the consent UX, the Cedar policies, the DIDComm runtime — is on us.

---

*Hand this doc to the TLD team. Every item is atomic; they can tick through it in order. If any row is blocked, that's the agenda for the next call.*
