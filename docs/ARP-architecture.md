# Agent Relationship Protocol (ARP)

A communication and permissions protocol for agent-to-agent interaction, built on top of the identity layer provided by Handshake `.agent` domains and Self.xyz verifiable credentials.

---

## One-sentence pitch

> A Connection-first, capability-scoped, per-purpose communication protocol that uses Handshake for sovereign names, DIDs + Self.xyz for verifiable identity, Cedar + UCAN for human-readable permissions, and DIDComm for private messaging — letting any two people pair their agents with the precision of an OAuth consent screen and the sovereignty of owning their own DNS.

---

## Core design principle: **Owners are attributes, not parents**

Every other decision in this architecture flows from this one rule.

An agent is not a *child of* its owner — it is a sovereign entity that *declares* an owner as one of its verifiable attributes. The owner relationship is published (via a Representation VC, an owner subdomain, and the `principal` field in the agent's DID document), but it lives alongside the agent's identity, not above it.

**Concrete implications this principle forces:**

- **Naming:** the agent's name (`samantha.agent`) is at the apex; the owner appears as a subdomain (`ian.samantha.agent`), not as a parent domain.
- **DID:** the agent's DID (`did:web:samantha.agent`) is the primary identifier; the owner's DID is referenced as a `principal` attribute inside the DID document.
- **Transferability:** ownership can change without a rename. The owner subdomain rewrites; the agent's identity, keys, and pending connections persist.
- **Multi-principal support:** an agent can declare multiple principals (e.g., a shared team agent) by publishing multiple Representation VCs — impossible if the owner were encoded as a parent.
- **Trust signaling:** counterparties never infer trust from the name hierarchy. They resolve the DID document, verify the Representation VC, and check Self.xyz attestations. The name is a label; the attributes are the truth.
- **Revocation symmetry:** just as the owner can revoke the agent's permissions, the agent's identity outlives any single owner. The keys, the audit log, the connection history all belong to the agent, not the human.

If you ever find yourself writing code that assumes "the agent belongs to a user, so the user owns the agent's data/keys/connections," stop — you've violated this principle. The agent *represents* the owner; it is not *owned by* the owner in a hierarchical sense.

---

## Naming convention

Each agent is a first-class sovereign entity at the apex of a `.agent` domain. The owner is published as a subdomain, not as a parent domain.

```
samantha.agent                ← the agent (sovereign identity)
 └─ ian.samantha.agent        ← owner binding / owner-only endpoint

ghost.agent                   ← another agent
 └─ nick.ghost.agent          ← its owner binding
```

**Why agents at the apex:** agents are the actors on the network. Making them sovereign (rather than children of a human domain) supports transfer of ownership without a rename, enables multi-principal agents (shared team agents), and gives each agent a brandable identity consistent with the "agent economy" framing.

**What the owner subdomain does (mandatory):**
1. **Binding proof host** — publishes the Representation VC signed by the owner, cross-verifying the principal reference in the agent's DID document.
2. **Owner-only control plane** — privileged endpoint where the owner issues commands, rotates keys, and revokes connections.
3. **Ownership-transfer signal** — on transfer, the owner subdomain rewrite is the unambiguous DNS-level signal that forces counterparties to re-consent.

---

## The seven-layer stack

```
┌───────────────────────────────────────────────────────────────┐
│ 7. Audit              Tamper-evident per-connection log       │
├───────────────────────────────────────────────────────────────┤
│ 6. Payments           x402 settlement, caps enforced by PDP   │
├───────────────────────────────────────────────────────────────┤
│ 5. Context Isolation  Per-connection memory & tool scoping    │
├───────────────────────────────────────────────────────────────┤
│ 4. Policy             Cedar PDP dispatched by connection_id   │
├───────────────────────────────────────────────────────────────┤
│ 3. Transport          DIDComm v2 (A2A-HTTPS for public svc)   │
├───────────────────────────────────────────────────────────────┤
│ 2. Pairing            UCAN/Biscuit envelope + Cedar policies  │
├───────────────────────────────────────────────────────────────┤
│ 1. Identity           DIDs + W3C VCs + Self.xyz ZK proofs     │
├───────────────────────────────────────────────────────────────┤
│ 0. Naming             Handshake .agent → agent card + DID doc │
└───────────────────────────────────────────────────────────────┘
```

### Layer 0 — Naming (Handshake `.agent`)

Each agent owns an apex `.agent` domain via Headless Domains. The HNS record publishes:

- Pointer to the DID document (`did:web:samantha.agent`)
- Agent card URL (`/.well-known/agent-card.json`)
- Current public keys + key-rotation history
- Revocation endpoint
- Supported protocols/versions

**Why it works:** We already own the `.agent` TLD. No ICANN, no CA, no platform can revoke a name. HNS is DNS-compatible, so existing HTTP libraries "just work" — no custom resolver required for the prototype.

### Layer 1 — Identity (DIDs + Self.xyz)

- **Agent DID:** `did:web:samantha.agent` resolves to a DID document listing the agent's keys and its principal.
- **Principal DID:** Each human has their own DID (e.g., `did:web:ian.self.xyz`), separate from any agent they own.
- **Representation VC:** Published at `ian.samantha.agent/.well-known/representation.jwt`, signed by the owner's DID, asserting "samantha.agent acts for me, with these limits, until date X." Referenced from the agent's DID document.
- **Attribute VCs from Self.xyz:** The owner's Self.xyz credentials sit in their VC wallet — proofs of age, citizenship, employment, etc. Presented selectively during pairing ("prove over 18, prove US resident, don't reveal DOB or address").

**Example DID document for `did:web:samantha.agent`:**
```json
{
  "id": "did:web:samantha.agent",
  "controller": "did:web:ian.self.xyz",
  "verificationMethod": [...],
  "service": [
    { "type": "DIDCommMessaging", "serviceEndpoint": "https://samantha.agent/didcomm" },
    { "type": "AgentCard",        "serviceEndpoint": "https://samantha.agent/.well-known/agent-card.json" }
  ],
  "principal": {
    "did": "did:web:ian.self.xyz",
    "representationVC": "https://ian.samantha.agent/.well-known/representation.jwt"
  }
}
```

**Why it works:** DIDs are a stable W3C standard. Self.xyz handles the hardest part (ZK proofs over government IDs) so we don't build a custody product. The agent↔principal binding is a plain signed credential — verifiable by anyone, revocable by the owner in one record update.

### Layer 2 — Pairing (Connection Tokens)

The "KYA handshake" produces a signed **Connection Token**. One token per **purpose**, not per peer — if Nick's agent needs access to three of Ian's projects, that's three separate Connection Tokens.

```json
{
  "connection_id": "conn_7a3f...",
  "label": "Project Alpha with Nick",
  "issuer":  "did:web:ian.self.xyz",
  "subject": "did:web:samantha.agent",
  "audience":"did:web:ghost.agent",
  "purpose": "project:alpha",
  "cedar_policies": ["permit(...) when {...}"],
  "required_vcs": ["self.xyz/over-18", "self.xyz/us-resident"],
  "counterparty_vcs_presented": ["hash1", "hash2"],
  "expires": "2026-10-22T00:00:00Z",
  "revocation": "https://ian.samantha.agent/revoke/conn_7a3f",
  "not_before": "2026-04-22T00:00:00Z",
  "nonce": "...",
  "sigs": {
    "ian":  "...",
    "nick": "..."
  }
}
```

Mutually signed. Wrapped in a UCAN or Biscuit envelope so it can be attenuated and chain-verified offline.

**Why it works:** UCAN/Biscuit solve offline verification and delegation chains; Cedar handles the fine-grained semantics. Neither is novel — the novelty is binding them to an HNS-resolvable DID and Self.xyz VCs.

### Layer 3 — Transport (DIDComm v2)

Encrypted mailbox-model messaging addressed by DID. Every envelope carries:

```json
{
  "from": "did:web:ghost.agent",
  "to":   "did:web:samantha.agent",
  "connection_id": "conn_7a3f...",
  "msg_id": "...",
  "timestamp": "...",
  "thread_id": "...",
  "body": { /* request-response, async task, etc. */ },
  "signature": "..."
}
```

**Why DIDComm over plain HTTPS:** E2E encryption between agents, not just transport encryption to a server. Mailboxes mean recipients don't need to be online. DIDs are first-class. **A2A-HTTPS remains the fallback** for discoverable public service agents (where mailbox semantics are overkill).

### Layer 4 — Policy (Cedar PDP)

Every inbound message dispatches through the Policy Decision Point:

```
incoming_msg
  → extract connection_id
  → load Connection Token
  → verify signatures + expiration + revocation
  → load Cedar policies
  → build evaluation context:
      principal = connection.audience (ghost.agent)
      action    = msg.body.action
      resource  = msg.body.resource
      context   = { time, purpose, presented_vcs, spend_so_far, ... }
  → Cedar.isAuthorized(...)
  → { allow | deny, obligations[] }
```

**Obligations** matter as much as the allow/deny bit: "allow, but redact field X," "allow, but log to audit," "allow, but require fresh consent," "allow, but cap at $5."

**Example Cedar policy (folder/project access):**
```cedar
permit (
    principal == Agent::"did:web:ghost.agent",
    action in [Action::"read", Action::"list"],
    resource in Project::"alpha"
) when {
    resource.classification != "confidential" &&
    context.time.within("09:00-17:00 America/New_York") &&
    context.stated_purpose in ["summarization", "scheduling"]
};

forbid (
    principal,
    action == Action::"share_external",
    resource
) when {
    resource.tags.contains("do-not-share")
};
```

**Why it works:** Cedar is formally verified — we can prove properties about policies ("no policy allows sharing tax IDs"). The PDP is small, stateless, and LLM-independent. If the LLM goes off the rails, the PDP still enforces.

### Layer 5 — Context Isolation

The layer most architectures skip, and where real agents leak data. For each connection:

- **Memory partition:** RAG/vector store filtered by `connection_id`. Retrieval during an Alpha request cannot pull Beta embeddings.
- **Tool scoping:** MCP tools presented to the LLM are filtered to only those allowed by the connection's resource scope. The model literally cannot see `delete_file` if the policy forbids it.
- **Information-barrier tags:** Every fact in long-term memory is tagged with the connection(s) it may flow to. Response generation masks facts without the current tag.
- **Egress filter:** The raw response is re-evaluated by the PDP for obligations (redact, summarize, block).

**Why it works:** Policy alone can't stop an LLM from mentioning something it knows. We have to *prevent it from knowing* during that turn. Partition before inference, filter at egress.

### Layer 6 — Payments (x402)

Agent card lists pricing per action. Connection Token's Cedar policy encodes spend caps:

```cedar
permit(principal, action == Action::"paid_query", resource)
when { context.aggregate_spend_usd + context.quoted_price <= 50 };
```

The PDP tracks per-connection aggregates. On allow, x402 settles; the audit log records the transaction. Payment caps are just another policy dimension — not a separate system.

### Layer 7 — Audit

Per-connection, hash-chained append-only log:

```
{seq, timestamp, msg_id, decision, policies_fired, obligations, spend_delta, prev_hash}
```

Principals can browse it in their agent's UI. Optionally publish the Merkle root to chain or to the HNS record for transparency. Counterparties can be granted audit-read access — mutual auditability is a trust primitive.

---

## The Connection model

Your agent isn't one entity with "a policy" — it's a hub maintaining **many independent, per-relationship policy bundles**. The first-class object is the edge, not the peer.

```
samantha.agent
  ├─ Connection #1 → dave.agent    (purpose: "Project Orion")
  ├─ Connection #2 → ghost.agent   (purpose: "Project Alpha")
  ├─ Connection #3 → ghost.agent   (purpose: "Project Beta")
  ├─ Connection #4 → ghost.agent   (purpose: "Project Gamma")
  └─ Connection #5 → mike.agent    (purpose: "Project Delta")
```

Each Connection is its own signed pairing token with its own Cedar policy set. Same peer DID, different tokens, different scopes. Every inter-agent message carries a `connection_id` so the receiver's policy engine knows *which* ruleset to evaluate against.

**Why one token per connection (not per peer):**
- **Revocation is surgical.** Kill Alpha without touching Beta/Gamma.
- **Audit is per-purpose.** "What did Ghost ask about Beta?" is a single-connection query.
- **Consent re-prompts are scoped.** Adding Ghost to a 4th project is a new consent, not a re-sign of the existing token.
- **Attenuation chains stay clean.** If Ghost re-delegates downstream, the capability chain is per-purpose.

---

## Policy dimensions

The full taxonomy the scope catalog should cover:

1. **Resource scope** — folders, files, projects, calendars, contacts, MCP tools, data classifications (PII, financial, health)
2. **Action scope** — read / write / list / derive-only / share-onward
3. **Temporal** — time windows, expiration, rate limits
4. **Contextual** — stated purpose, request origin, network
5. **Identity-gated (Self.xyz)** — "only share with agents whose principal ZK-proved age 18+" or "proved US residency"
6. **Economic** — x402 spending caps per txn / per day / per counterparty
7. **Redaction & derivation** — return aggregates only, auto-strip SSNs, summaries-not-raw
8. **Chain-of-custody ("sticky" policies)** — downstream re-sharing forbidden, must delete after N days, must write to audit log
9. **Delegation depth** — can the receiving agent re-delegate? If yes, how attenuated?
10. **Consent re-prompt triggers** — actions matching pattern X require a fresh human tap, regardless of pre-granted scope

---

## UX layer: the consent stack

```
┌─────────────────────────────────────────┐
│ UI: Scope templates (fill-in-the-blank) │  ← what the user sees/picks
├─────────────────────────────────────────┤
│ Compile → Cedar policies                │  ← wire format
├─────────────────────────────────────────┤
│ Wrap → UCAN/Biscuit token (signed)      │  ← on the network
└─────────────────────────────────────────┘
```

Finite set of pre-defined **scope templates** (like OAuth scopes: `calendar.availability.read`, `projects.files.read:{project_id}`, `contacts.share:{attribute_list}`) that compile into Cedar. Power users get a "custom policy" escape hatch where raw Cedar gets reviewed by a policy-linter agent before signing.

From the owner's perspective, the mental model is an **agent address book**:

```
Ghost (ghost.agent)
├─ [●] Alpha      edit scopes │ audit │ revoke
├─ [●] Beta       edit scopes │ audit │ revoke
└─ [●] Gamma      edit scopes │ audit │ revoke

Dave (dave.agent)
└─ [●] Orion      edit scopes │ audit │ revoke

Mike (mike.agent)
└─ [●] Delta      edit scopes │ audit │ revoke

[+ New connection]
```

---

## The canonical flows

### Pairing flow (the "KYA handshake")

```
Ian's UI:  "Pair Samantha with Ghost for Project Alpha"
   │
   ├─ samantha.agent drafts pairing proposal (scopes from catalog, required VCs)
   ├─ Delivered to ghost.agent via DIDComm out-of-band (QR / deep link / email)
   │
Nick's UI: "samantha.agent requests: [scopes rendered in plain English]
            and asks you to prove: [VC list]"
   │
   ├─ Nick approves, ghost.agent presents VCs via ZK proofs
   ├─ Countersigns the Connection Token
   │
samantha.agent: verifies Nick's VCs + signature, countersigns, stores
ghost.agent:    verifies Ian's signature, stores
   │
   └─ Both agents now hold identical, mutually-signed Connection Token
```

### Message flow

```
ghost.agent                           samantha.agent
    │                                         │
    │ DIDComm envelope {conn_id, action}      │
    │────────────────────────────────────────▶│
    │                                         │  1. Decrypt + verify sig
    │                                         │  2. Load Connection Token
    │                                         │  3. Check revocation
    │                                         │  4. PDP: Cedar eval
    │                                         │  5. Dispatch to LLM with
    │                                         │     scoped memory+tools
    │                                         │  6. Generate response
    │                                         │  7. PDP re-check (egress)
    │                                         │  8. Apply obligations
    │                                         │  9. Log to audit chain
    │   DIDComm response                      │
    │◀────────────────────────────────────────│
```

### Revocation flow

Owner taps revoke → revocation list updated on HNS record or `/revocations` endpoint on the owner subdomain (`ian.samantha.agent/revoke`) → peer agent learns via poll/push → both sides mark connection dead → next message rejected with signed revocation proof.

**Revocation verbs:**

| Action | Effect |
|---|---|
| Revoke connection | That one pairing dies |
| Revoke peer | All connections with that DID die |
| Revoke resource | Every connection whose scope touches `project:alpha` loses that scope |
| Rotate identity | All tokens re-issued against new keys; peers notified via `did:web` resolution |
| Suspend | Connection paused but not destroyed (audit trail intact) |
| Transfer ownership | Owner subdomain rewrite forces re-consent on all active connections |

---

## Why this works — five defensible claims

1. **Every layer uses something already battle-tested.** HNS works. DIDs work. Cedar is formally verified. UCAN/Biscuit have production implementations. DIDComm v2 is specified with real libraries. Self.xyz is a shipping product. x402 is gaining adoption. We're not betting on any single new primitive surviving; we're composing survivors.

2. **The `Connection` as the unit of design prevents the cross-context leaks that kill multi-agent systems.** Most designs authorize by peer identity, which collapses the moment one human has multiple contexts with another. Per-connection tokens + per-connection memory + per-connection audit isolates purposes the way the real world actually works.

3. **Principals stay sovereign end-to-end.** The owner's keys sign the Representation VC, the Connection Tokens, the revocations. No platform can impersonate, silence, or deplatform them. If the company hosting Samantha disappears tomorrow, the owner's HNS record points to a new endpoint and every existing Connection Token still verifies.

4. **Humans can actually understand what they're approving.** The Cedar-schema → scope-catalog → plain-English consent flow means the owner sees "Allow Ghost to read Project Alpha files during business hours, up to $50 in paid queries" — not a JWT blob. Most "decentralized identity" projects die on this exact UX failure.

5. **It interoperates outward.** A2A-compatible agent cards mean public services (travel booking, shopping) reach Samantha with zero custom integration. x402 means any agent with a wallet can transact. DIDComm means any DID-speaking agent (Microsoft, ToIP, Veramo users) can pair. We own the protocol *between our users*, but we haven't walled ourselves off.

---

## Build phases

| Phase | Weeks | Deliverable |
|---|---|---|
| 0 | 1 | Scope catalog — ~50 scope templates + Cedar schema. Nothing else compiles without this. |
| 1 | 2–3 | Agent card spec + HNS resolution + DID doc publishing. Two test agents resolvable via `*.agent`. |
| 2 | 2–3 | Pairing flow: UCAN+Cedar Connection Token, mutual-sign UX, relationship registry. |
| 3 | 2–3 | DIDComm transport + PDP integration. Messages flow, policies enforced. |
| 4 | 2 | Per-connection memory isolation + egress filter. (Do this before adding more scope — retrofitting is painful.) |
| 5 | 1–2 | Revocation + audit log. Tamper-evident chain, revocation distribution. |
| 6 | 1–2 | Self.xyz VC presentation during pairing. |
| 7 | 1–2 | x402 integration + spend caps in Cedar. |
| 8 | ongoing | Scope-catalog growth, consent-UX polish, agent-framework SDKs (LangGraph, CrewAI adapters). |

**Total MVP: ~12–16 weeks** for a demo of two agents pairing over `.agent`, holding multi-purpose connections, enforcing policies, settling x402 payments, and revoking cleanly.

---

## Design principles (short list)

- **Agents are sovereign.** They own their apex domain, their DID, their keys. Owners are attributes, not parents.
- **Connections are first-class.** Every relationship is a purpose-scoped edge with its own policy and audit trail.
- **Context isolation is not optional.** Per-connection memory partitioning is built in from day one, not retrofitted.
- **Policies must be human-readable.** If the owner can't understand what they're approving, the policy is broken.
- **Every layer must compose outward.** No proprietary wire formats that can't speak to the broader agent ecosystem.
- **Revocation is a first-class verb.** Anything that can be granted must be instantly, surgically revocable.

---

*Version 0.2 — April 2026*
