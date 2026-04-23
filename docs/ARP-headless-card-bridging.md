# ARP × Headless Agent Card — Bridging Analysis

**Purpose:** reference doc explaining how Headless Domains' existing agent-card JSON format relates to the ARP agent-card spec, what's compatible, what's missing, and how both formats can coexist at the same domain without conflict.

**Companion docs:** `ARP-tld-integration-spec-v2.md` (the authoritative TLD-side contract), `ARP-architecture.md` (the system design), `ARP-headless-parallel-build.md` (the executable brief for Headless's Claude Code).

---

## 1. Context

Headless Domains currently issues proprietary agent-card JSON when a user provisions a `.chatbot` / `.agent` domain. Sample:

```json
{
  "agent": {
    "capabilities": ["general"],
    "description": "Autonomous agent hosted at ian.chatbot",
    "name": "Ian",
    "owner_id": "powerlobster-squad-ianborders",
    "payment_endpoints": { "mpp": "N/A (Pending Integration)" },
    "protocols": ["mpp"],
    "trust": {
      "attestations": ["headlessdomains", "powerlobster"],
      "human_backed": true
    },
    "uptime": "https://ian.chatbot/status",
    "version": "1.0.0",
    "webhooks": { "default": "https://ian.chatbot/webhook" }
  },
  "skills": ["https://headlessdomains.com/skills/ian.chatbot.md"]
}
```

This is a Headless-proprietary shape. ARP's agent card has a different shape (defined in `ARP-tld-integration-spec-v2.md §6.2`). The two can coexist — nothing in Headless's JSON conflicts with ARP, but ARP adds ~9 required artifacts on top that don't exist today.

**`.chatbot` vs `.agent` — no ARP impact.** ARP is HNS-TLD-agnostic. The protocol treats whatever TLD the domain lives on as a label; resolution goes through HNS DoH either way. Everything in `ARP-tld-integration-spec-v2.md` applies to `.chatbot` exactly the same as `.agent`.

---

## 2. Field-by-field map

| Headless field | ARP equivalent | Status |
|---|---|---|
| `agent.name` | `name` | ✓ maps directly |
| `agent.description` | `description` | ✓ maps directly |
| `agent.version` | *(agent-version; not the ARP spec version)* | Keep; ARP adds `arp_version: "0.1"` as a separate field |
| `agent.owner_id` (e.g. `"powerlobster-squad-ianborders"`) | `principal.did` (e.g. `did:web:ian.self.xyz`) | ⚠ Proprietary ID; must resolve to a DID URI |
| `agent.webhooks.default` | `endpoints.didcomm` | ⚠ Different semantics: webhook = one-way POST; DIDComm = bidirectional signed JWM |
| `agent.protocols: ["mpp"]` | `accepted_protocols: ["didcomm/v2", "a2a/1.0"]` | ⚠ Different layer; MPP is payments, not transport |
| `agent.payment_endpoints.mpp` | `payment.x402_enabled` + `payment.pricing_url` | ⚠ x402 is ARP v0; MPP can coexist as an extension |
| `agent.trust.human_backed: true` | Replaced by Self.xyz VC (cryptographic proof) | ⚠ Boolean → verifiable credential |
| `agent.trust.attestations` | Optional metadata; could inform `vc_requirements` | 🔄 Soft map |
| `agent.uptime` | — | Optional; keep as extension |
| `agent.capabilities` | `supported_scopes` (pinned to catalog version) | 🔄 Different semantics; capabilities are freeform strings, scopes are catalog-constrained |
| `skills` | — | Optional; surfaced via Phase 6 MCP adapter if desired |

---

## 3. What's missing entirely (ARP-required artifacts not in Headless's JSON today)

Nine items must exist at the domain before an ARP peer can pair with it:

1. **`/.well-known/did.json`** — W3C DID document with verification method (Ed25519 public key in multibase), controller, service endpoints, principal reference, and TLS fingerprint pin.
2. **`/.well-known/agent-card.json`** — ARP-shaped card at this exact path. Separate file from Headless's existing card.
3. **`/.well-known/arp.json`** — protocol version + capabilities introspection.
4. **`endpoints.didcomm`** — HTTPS endpoint accepting signed DIDComm v2 JWM envelopes.
5. **`endpoints.pairing`** — handles Connection Token countersignature.
6. **Owner subdomain** — e.g. `owner.ian.chatbot` — serving:
   - `/.well-known/representation.jwt` — signed VC binding the agent's DID to the owner's principal DID
   - `/.well-known/revocations.json` — signed append-only list
7. **DNS TXT records** per `ARP-tld-integration-spec-v2.md §5.1`:
   - `_arp.<domain>` — version + capability bits
   - `_did.<domain>` — DID URI + SHA-256 JCS fingerprint of the DID doc
   - `_didcomm.<domain>` — DIDComm endpoint URL + version
   - `_revocation.<domain>` — revocation list URL + poll interval
8. **DID-pinned TLS cert.** The cert's SHA-256 DER fingerprint lives in the DID doc's `tlsCertificatePin`. No Let's Encrypt dependency for agent-to-agent; peers validate against the pin.
9. **Principal DID binding via Self.xyz.** The agent's DID doc references a `principal.did` that itself holds verifiable credentials (adult, verified human, country, etc.) issued by Self.xyz.

---

## 4. A bridged example — both formats live at `ian.chatbot`

Headless keeps their existing card at their existing URL. ARP adds its own set at `/.well-known/*`. The ARP agent card can cross-reference the Headless card under `extensions` so ARP-aware clients see both.

### `https://ian.chatbot/.well-known/did.json`

```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:web:ian.chatbot",
  "controller": "did:web:ian.self.xyz",
  "verificationMethod": [{
    "id": "did:web:ian.chatbot#key-1",
    "type": "Ed25519VerificationKey2020",
    "controller": "did:web:ian.chatbot",
    "publicKeyMultibase": "z6Mk..."
  }],
  "authentication": ["did:web:ian.chatbot#key-1"],
  "keyAgreement": ["did:web:ian.chatbot#key-1"],
  "service": [
    {
      "id": "did:web:ian.chatbot#didcomm",
      "type": "DIDCommMessaging",
      "serviceEndpoint": "https://ian.chatbot/didcomm",
      "accept": ["didcomm/v2"]
    },
    {
      "id": "did:web:ian.chatbot#agent-card",
      "type": "AgentCard",
      "serviceEndpoint": "https://ian.chatbot/.well-known/agent-card.json"
    }
  ],
  "principal": {
    "did": "did:web:ian.self.xyz",
    "representationVC": "https://owner.ian.chatbot/.well-known/representation.jwt"
  },
  "tlsCertificatePin": {
    "algorithm": "sha256",
    "value": "a3f5b2e1..."
  }
}
```

### `https://ian.chatbot/.well-known/agent-card.json`

```json
{
  "arp_version": "0.1",
  "name": "Ian",
  "did": "did:web:ian.chatbot",
  "description": "Autonomous agent hosted at ian.chatbot",
  "created_at": "2026-04-23T00:00:00Z",
  "endpoints": {
    "didcomm": "https://ian.chatbot/didcomm",
    "a2a":     "https://ian.chatbot/a2a",
    "pairing": "https://ian.chatbot/pair"
  },
  "accepted_protocols": ["didcomm/v2", "a2a/1.0"],
  "supported_scopes": ["scope-catalog-v1"],
  "payment": {
    "x402_enabled": false,
    "currencies": [],
    "pricing_url": null
  },
  "vc_requirements": ["self_xyz.verified_human"],
  "policy": {
    "engine": "cedar",
    "schema": "https://ian.chatbot/.well-known/policy-schema.json"
  },
  "extensions": {
    "headless_card":  "https://ian.chatbot/agent.json",
    "mpp_pending":    true,
    "uptime_url":     "https://ian.chatbot/status",
    "attestations":   ["headlessdomains", "powerlobster"],
    "skills_url":     "https://headlessdomains.com/skills/ian.chatbot.md"
  }
}
```

Everything Headless-proprietary lives under `extensions`. ARP-aware clients use only the top-level keys; Headless-aware clients keep reading their own file at their own URL. No conflict.

---

## 5. Coexistence rules

| Concern | Rule |
|---|---|
| Two cards, two URLs | Headless's card stays at its current URL. ARP's card goes to `/.well-known/agent-card.json`. Never overload one path for both formats. |
| Discovery | DNS `_arp.<domain>` TXT advertises the ARP presence; clients that don't read TXT can fetch `/.well-known/arp.json` directly. |
| Proprietary fields | All non-ARP data goes under `extensions` in the ARP card. Unknown top-level keys MUST be preserved by readers but MUST NOT influence semantics. |
| Owner identity | `agent.owner_id` (Headless) and `principal.did` (ARP) MAY refer to the same person; the ARP side is the cryptographic truth. |
| Payment | MPP and x402 can coexist. ARP clients use x402; other clients continue to use MPP. |
| Skills | Headless `skills[]` is opaque to ARP. Phase 6 MCP adapter can surface them as ARP tools if desired. |

---

## 6. What the Headless side has to build

Summary — details in `ARP-headless-parallel-build.md`:

1. A provisioner that generates the DID doc, ARP agent card, and `arp.json` using `@kybernesis/arp-templates`.
2. Well-known hosting for the three JSON files (or delegation to the sidecar/cloud once the user's runtime takes over).
3. DNS TXT record orchestration via their existing registrar API.
4. Owner-subdomain creation with the Representation VC.
5. A handoff-bundle emitter that returns the portable install artifact to the buyer.
6. UI buttons ("Setup ARP Local" / "Setup ARP Cloud") on their domain-management dashboard.

All of this is parallelizable with our remaining phases (4–9). Headless can start today; we run `@kybernesis/arp-testkit` against a Headless-provisioned test domain when Phase 5 ships to certify compliance.

---

## 7. Short answer

**Nothing in Headless's existing JSON actively conflicts with ARP — everything maps cleanly to either a direct field, a semantic equivalent, or an `extensions` blob.** The bridging work is entirely additive: ARP needs new artifacts at new paths, with new crypto (DIDs, VCs, DID-pinned TLS), and Headless's existing format continues to work unchanged alongside it.

*Bridging analysis v0.1 — 2026-04-23*
