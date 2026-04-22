# ARP — Our Codebase & the Independence Model

**Purpose:** define what we build, what they build, and the contract between us — in a way that keeps ARP as an independent protocol layer that is not blended with any TLD operator's code.

---

## 1. The guiding principle

> **There is exactly one shared thing between us and the TLD operators: the spec. Everything else is separate codebases, separate deployments, separate release cycles, separate security boundaries.**

If we ever find ourselves importing their internal modules, sharing a database, or calling a private API, we have failed at this principle. Interop happens only through public HTTP, DNS, and the published `@kybernesis/arp-spec` and `@kybernesis/arp-templates` packages.

This is the same architectural posture a webmail client has toward a DNS host: the webmail client doesn't need the DNS provider's codebase — it just speaks DNS and HTTPS.

---

## 2. The seam diagram

```
┌─────────────────────────────┐        ┌─────────────────────────────┐
│  THEIR CODEBASE             │        │  OUR CODEBASE               │
│  (TLD + registrar plane)    │        │  (ARP protocol plane)       │
│                             │        │                             │
│  • HNS zone                 │        │  • Agent runtime            │
│  • Hybrid resolver          │        │  • DIDComm mailbox          │
│  • Registrar API            │        │  • Cedar PDP                │
│  • ACME / cert issuance     │        │  • Relationship registry    │
│  • Default .well-known host │        │  • Owner app                │
│  • Checkout UI              │        │  • Pairing flow             │
│  • "ARP-ready" checkbox     │        │  • Audit log                │
│                             │        │  • SDKs + adapters          │
└──────────────┬──────────────┘        └──────────────┬──────────────┘
               │                                      │
               │     ┌──────────────────────────┐    │
               └────▶│  SHARED CONTRACT         │◀───┘
                     │  (KybernesisAI/arp,      │
                     │   public, MIT)           │
                     │                          │
                     │  • JSON schemas          │
                     │  • DNS record formats    │
                     │  • Well-known paths      │
                     │  • Scope catalog         │
                     │  • Cedar schema          │
                     │  • Handoff bundle shape  │
                     │  • Protocol versioning   │
                     └──────────────────────────┘
```

Both sides depend on the shared-contract packages published from `github.com/KybernesisAI/arp` (the `@kybernesis/arp-spec` and `@kybernesis/arp-templates` npm packages). Neither side writes to the other's plane. All runtime interop is via:
- DNS queries (any standard resolver)
- HTTPS GETs to `/.well-known/*`
- Standard registrar API calls (our owner app calls theirs like any other API consumer)

---

## 3. Our repo layout

```
arp/ (our repo — public, we own governance)
├── packages/
│   ├── spec/                  # Shared contract (@kybernesis/arp-spec). Published to npm. THEY import this.
│   ├── arp-templates/         # Pure template functions. Published. They may import.
│   ├── arp-runtime/           # Agent HTTP server (DIDComm, PDP, endpoints)
│   ├── arp-pdp/               # Cedar policy engine wrapper + obligations
│   ├── arp-transport/         # DIDComm v2 client/server
│   ├── arp-registry/          # Per-connection DB
│   ├── arp-resolver/          # .agent → DID doc → agent card client library
│   ├── arp-pairing/           # QR / deep-link pairing flow
│   ├── arp-scope-catalog/     # Scope templates + Cedar compiler
│   ├── arp-audit/             # Append-only hash-chained log
│   ├── arp-payments/          # x402 adapter (stubbed v0)
│   ├── arp-selfxyz/           # Self.xyz VC bridge
│   ├── arp-sdk/               # Agent developer library
│   ├── arp-testkit/           # Compliance tests against any .agent domain
│   └── arp-owner-app/         # Consent / address-book UI (Next.js 16)
├── apps/
│   ├── samantha-reference/    # Our demo agent
│   └── ghost-reference/       # Second demo agent
└── docs/                      # Spec site, governance, versioning
```

**Only two packages cross the seam** (published to npm, consumed by their codebase):
- `@kybernesis/arp-spec` — schemas + constants (data, no logic)
- `@kybernesis/arp-templates` — pure functions generating default JSON (stateless, no network calls)

Everything else is ours alone — our infra, our release cadence, our security boundary.

---

## 4. Build sequence

### Phase A — Publish the shared contract *(ship first, unblocks everything)*
1. `@kybernesis/arp-spec` — JSON schemas for DID doc, agent card, `arp.json`, representation VC, revocations, Connection Token, handoff bundle
2. `@kybernesis/arp-templates` — template functions matching those schemas
3. Scope catalog v1 + Cedar schema at stable public URLs
4. Public spec site — versioned (v0.1 → v1.0), permissive license, documented governance

### Phase B — Agent runtime *(ours alone)*
5. `arp-runtime` — HTTP server running on every agent domain
6. `arp-pdp` — Cedar + obligation-rules evaluator
7. `arp-registry` — Connection database
8. `arp-transport` — DIDComm v2 + mailbox storage
9. `arp-audit` — per-connection hash-chained log

### Phase C — Owner-facing UX *(ours alone)*
10. Owner app — address book, connection management, audit viewer, revoke
11. Pairing flow — QR, deep links, mutual approval
12. Consent screen renderer — Cedar → plain English
13. Self.xyz wallet bridge

### Phase D — Developer SDKs *(ours alone)*
14. `@kybernesis/arp-sdk` — drop-in library for agent developers
15. Adapters — LangGraph, CrewAI, MCP server wrapper

### Phase E — Compliance & demos *(ours alone)*
16. `@kybernesis/arp-testkit` — automated compliance tests; how we certify a `.agent` domain
17. `samantha.agent` + `ghost.agent` reference deployments

### Phase F — Optional network services *(v0.2+)*
18. Public resolver/cache at `resolver.arp.spec`
19. Opt-in directory at `registry.agent`

---

## 5. Runtime interaction walkthrough

When a buyer registers `new-agent.agent`:

```
1. Buyer → their checkout UI → picks "ARP-ready"
2. Their server → imports @kybernesis/arp-templates → generates default DID doc, agent card, arp.json
3. Their server → their registrar API → publishes DNS records, issues Let's Encrypt cert,
                                          hosts the .well-known files
4. Their server → emits handoff bundle (shape defined in @kybernesis/arp-spec)
                → redirects buyer to our owner app
5. Buyer → our owner app → signs in, takes over key custody, configures agent
6. Our runtime → takes over hosting /didcomm etc. on new-agent.agent
   (A record flips from their default hosting to our runtime hosting)
```

Step 6 is the transition point:
- **Before:** their default hosting serves the static well-known files
- **After:** our runtime serves the dynamic agent

Both conform to the same spec; the buyer doesn't perceive the handoff except that more features become available.

---

## 6. What never crosses the seam

| Thing | Why it never crosses |
|---|---|
| Databases | We don't read their domain DB; they don't read our Connection registry |
| Private APIs | No "internal" endpoints on either side |
| Secrets / keys | Buyer's private key is custodied on the client; never touches either server |
| Deploy pipelines | We ship independently. Their outage doesn't break our runtime for already-registered agents |
| Auth tokens beyond public OAuth/API-key | Normal third-party API integration only |
| Build dependencies beyond `@kybernesis/arp-spec`/`@kybernesis/arp-templates` | No shared infrastructure libraries |

---

## 7. Governance of the shared contract

`github.com/KybernesisAI/arp` is the public monorepo containing the shared-contract packages. KybernesisAI maintains it in v0, but the governance model is deliberately open:

- **RFC-based changes.** Proposals as PRs, reviewed in the open
- **Semver.** Breaking changes require a major bump
- **Version pinning.** Both sides pin to a spec version; upgrades are explicit
- **Permissive license** (MIT or Apache 2)
- **Multiple implementers welcome.** A future TLD (`.bot`, `.ai`) could adopt ARP; another runtime could interoperate with ours

This is what makes ARP an independent protocol, not a product. The spec outlives any single implementation.

---

## 8. Why this structure wins

1. **We can pivot TLD operators.** If Headless goes away or changes terms, our runtime doesn't care — any `.agent`-compliant resolver works. If `.agent` itself were compromised, we could add `.ai` or `.bot` support as a config flag.
2. **They can replace their backend.** If they rearchitect their registrar, as long as the public API and DNS records still match the spec, our runtime is untouched.
3. **Third parties can implement either side.** A competing registrar could register `.agent` domains (if allowed by the TLD owners); a competing runtime could serve agents using the same spec. Neither displaces us — it validates us.
4. **Security boundaries are clean.** A bug in their code can't break our PDP. A bug in our code can't leak registrar credentials.
5. **Our release cadence is independent.** We ship runtime updates without coordinating a deploy with them.
6. **The spec is the moat, not the code.** Owning (and evolving) the protocol is more defensible than owning any single implementation of it.

---

## 9. One-paragraph summary

We build a separate codebase — our repo, our infrastructure, our team. The only things that cross the seam are two published npm packages (`@kybernesis/arp-spec` and `@kybernesis/arp-templates`) and the public well-known HTTPS paths + DNS records they define. The TLD operators implement the spec on their side using our published templates; we implement the runtime, owner UX, PDP, and SDKs on our side. Interop is through DNS, HTTPS, and the registrar's public API only. The shared contract is versioned and open-governed so that neither side is locked in to the other, and new TLDs or runtimes can adopt the protocol without coordinating with us.
