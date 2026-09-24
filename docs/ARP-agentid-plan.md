# AgentID — Master Plan (identity-first .agent product on ARP)

**Status:** locked 2026-09-17. This is the canonical plan. When this doc and any other doc disagree, this doc wins until it is amended here.
**Owner:** Ian Borders. **Build agent:** Claude Code.
**Sibling repos:** `~/arp` (this repo: protocol + cloud), `~/platform` (Kybernesis `@kybernesis/*` Eve packages), `~/kybernesis-admin` (control plane, agent.kybernesis.ai), `~/kyber-studio` (desktop client).
**Vault mirror:** `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/ARP/ARP-agentid-plan.md`.

---

## 1. Thesis

The product is a **permanent identity for an AI agent**: a `.agent` name that people can find, other agents can trust, and the owner controls. Everything else (agent-to-agent connection, permissions, audit, payments) hangs off the name as add-ons.

- **Identity is primary.** Registration of the `.agent` name is the entry point and the thing we sell first.
- **ARP is the engine, not the brand.** The protocol stays open source under the ARP name at `arp.run` / `spec.arp.run`. The customer-facing product is branded **AgentID** (working name; lander at `agent.arp.run`). Domain/brand may change to highlight `.agent`; nothing in the plan depends on the final name.
- **No naming-root or crypto vocabulary in customer copy.** Handshake, HNS, keys, DIDs, blockchains: developer docs only. Customers see "a name," "verified," "yours."
- **Neutral by construction.** Must work for any agent on any platform, open source or not. The Kybernesis control plane is one linkable authority among many, never a requirement.
- **Kybernesis Eve agents are the first and best-integrated ecosystem.** They are the wedge into `kybernesis.ai`, not the ceiling.

## 2. Decisions (locked)

| # | Decision | Rationale |
|---|---|---|
| D1 | `cloud.arp.run` (the `apps/cloud` Next.js app + `cloud-db` + `cloud-runtime` + `gateway.arp.run`) is the base everything is built on. | Tenants, agents, connections, billing, pairing, audit already exist there. |
| D2 | We are the registrar. Headless Domains gives us full control to register, take payment, and manage records for `.agent`. Billing lives in ARP Cloud (Stripe already wired). | Collapses the v2.1 "Headless redirects to us" flow into one purchase path we own. |
| D3 | The `.agent` identity is the root; other identities attach to it as **verified links** (Buzz npub, control-plane registration, Eve deployment, endpoints, ICANN mirror). | Mirrors how the control plane already links npubs; DID document already has the fields (`verificationMethod`, `alsoKnownAs`, `service`). |
| D4 | Links are **two-way proofs** (Keybase pattern). A link shows as verified only when both sides point at each other. | Self-claimed metadata is worthless for trust. |
| D5 | **A2A-first transport, DIDComm optional.** ARP becomes an A2A extension + signed-card profile that binds DID and `.agent` name; the Connection Token rides as the bearer credential. Gateway keeps mailbox semantics for offline agents. | A2A v1.0 (Mar 2026) has signed cards (JWS/JCS, same primitives we use), 150+ orgs, extension mechanism (1.0.1). DIDComm has no framework adoption. ARP's value is what A2A lacks: consent, scoped tokens, policy, obligations, audit, revocation. |
| D6 | **Thin package for Eve**, not a runtime in the Eve process. ARP Cloud hosts identity + policy + audit; the Eve agent is an HTTP-reachable backend. Package = `@kybernesis/identity` in `~/platform` following its five attachment surfaces. | Mirrors exactly how `@kybernesis/enterprise` + `@kybernesis/dispatch` already treat the control plane (issuer + directory, offline verify). Zero DIDComm/Cedar/SQLite in the Eve bundle. |
| D7 | Every `.agent` gets an **ICANN mirror hostname** serving the same signed card. *(Implemented S2 as `<sld>.agent.arp.run` on the Vercel app, proxying machine paths to the gateway; Railway's plan caps custom domains.)* | Browsers and mainstream A2A clients cannot resolve HNS. Required for interop, not a convenience. |
| D8 | Three integration tiers (see §4). Tier 0 needs only a URL. | Keeps closed-source ecosystems (Grok bots etc.) in scope. |
| D9 | Human-in-loop decisions stay per CLAUDE.md §11: domain registrations/renames, pricing, npm `latest` promotions, prod DNS, store submissions, Headless production flip. | Unchanged. |

## 3. Identity model

The agent's DID document at `https://<name>.agent/.well-known/did.json` (mirrored on the ICANN host) is the source of truth.

| Attachment | DID doc field | Proof (both directions) |
|---|---|---|
| Buzz / nostr key | `verificationMethod` (secp256k1) + `alsoKnownAs: nostr:npub…` | NIP-05: `<name>.agent/.well-known/nostr.json` maps `_` → hex pubkey; agent's kind-0 profile sets `nip05: _@<name>.agent`. |
| Kybernesis control plane | `alsoKnownAs: agent:<org>/<name>` + `service` (issuer URL) | Control plane calls `POST /internal/registrar/bind` (v2.1 contract, exists) with a signed statement; agent credential gains a `did` claim. |
| Eve deployment / any runtime | `service` (A2A / session endpoint) | Nonce challenge: console issues a nonce, the agent returns it from its endpoint or embeds it in its card. |
| ICANN mirror | `alsoKnownAs: https://<mirror-host>` | Mirror serves the identical signed card; card `signature` covers both names. |
| Owner (principal) | `principal` attribute (existing) + `_principal` TXT | Representation JWT (existing v2.1 flow). |

Console surface: an **Identities** panel on the agent page (attach / verify / remove). Data: one new table, roughly `agent_links(tenant_id, agent_did, kind, value, proof_json, verified_at, revoked_at)`.

## 4. Integration tiers (how any ecosystem plugs in)

| Tier | Gets | Needs from the agent | Who |
|---|---|---|---|
| 0 · Identity | name, DID doc, signed card, profile page, health probe, verified links | a URL (or nothing, if hosted-only) | anyone, incl. closed source |
| 1 · Connected | pairing, scoped connections, Cedar policy, audit, revocation via cloud-bridge adapters or hosted push | an HTTP endpoint that answers a prompt, or a bridge daemon | OpenClaw, Hermes, LangGraph, custom |
| 2 · Native | first-class package in the ecosystem's own conventions | package install | Eve via `@kybernesis/identity` (first), others later |

## 5. Known hardening gaps (from the 2026-08 deep-read in the vault; verified by grep, not yet fixed)

These are inputs to slice S1/S4/S5, listed so they are not rediscovered:

- **No outbound send in `@kybernesis/arp-sdk`** (`packages/sdk/src/agent.ts`): library mode can answer but not initiate. Outbound lives only in `arpc` + `cloud-bridge`.
- **Delivery is WebSocket-only** (`packages/cloud-runtime/src/dispatch.ts`): no push-to-URL / webhook; offline → `queued_no_session`, 7-day expiry. A serverless (Vercel) agent cannot be reached without a daemon. → S4 adds a **push delivery mode** + delivery-target registration.
- **`SessionRegistry` and `apps/cloud/lib/challenge-store.ts` are in-process Maps** → single-instance only; challenge store already broken on multi-instance Vercel.
- ~~**Scope catalog reads the filesystem in `apps/cloud/lib/catalog.ts`**~~ → **fixed in S1** (bundled `generated/scopes.json` import, `ARP_SCOPE_CATALOG_DIR` kept as dev override).
- **Docs oversell the code:** no JWE/encryption (`jose` declared, never imported); no PDP egress re-check; agent card served with `supported_scopes: []` and consumed by nobody but testkit; DID-pinned TLS validators have zero non-test callers; no peer revocation polling; x402 has no settlement code; context-isolation layer is key-partitioning only.
- **`/response`-typed messages bypass the PDP** in the cloud path (`auto_allow_response`); `drainQueue` redelivers with `obligations: []`.
- **No replay protection** beyond `UNIQUE(msg_id)`; `created_time` never freshness-checked.
- **Two incompatible handoff shapes**: spec `HandoffBundleSchema` (no private key) vs the dashboard's download (`agent_private_key_multibase`, unvalidated).
- ~~**`ARP_CLOUD_SESSION_SECRET` defaults to an insecure string**~~ → **fixed in S1** (throws on `VERCEL_ENV=production` when unset; prod has it set). Still open: self-test writes a placeholder `tokenJws` into a real `connections` row.
- **`arpc` hard-exits on openclaw/hermes** even though SDK adapters exist; two "adapter" concepts share the word.
- **Cedar schema is decoration** (3 entity types, catalog uses 6+; request validation off).
- Stale docs: CLAUDE.md §5 says Phase 10 in progress; handoff dated 2026-04-25; ~110 PRs since; PR #35 (v1.0.0) stale since April; KyberBot unification roadmap names the wrong reference implementation.

## 6. Sequence (slices, in order)

Each slice is independently shippable, lands via PR to `main`, and is done when its gate passes. No slice starts before the previous one's PR is merged unless noted.

| Slice | Name | Deliverable | Done when |
|---|---|---|---|
| **S0** | AgentID lander | `agent.arp.run` visual reference (PR #150) | ✅ live 2026-09-17 |
| **S1** | ARP revival + docs lock-in (✅ PR #151, 2026-09-17) | cold-cache gates green on `main`; CLAUDE.md §5 + handoff refreshed to post-Phase-10 truth; this plan doc + vault mirror; PR #35 disposition (Ian decides); prod hosts verified | gates green, docs merged, memory saved |
| **S2** | Registrar-in-console — ✅ COMPLETE 2026-09-17 (PRs #152–#155). Brief: `docs/ARP-agentid-s2-registrar-in-console.md`. Buy a `.agent` name in the console → identity on the mirror `<sld>.agent.arp.run` (served by the Vercel app, proxied to the gateway), cloud-held exportable key, public profile `agent.arp.run/<sld>`, per-name records `/names/<sld>`, self-hosted owner proof. Proven live with `agentid-test.agent` (1 Gem). Open: reseller flag; upstream webhook 404 → cron; browser purchase smoke; price placeholder | Headless registrar + DNS API client; name search + checkout (Stripe); purchase creates tenant + DID doc + well-known hosting + DNS records as side effects; every registered name serves a card at the gateway even with no runtime attached; profile page per name (Tier 0) | buy a test name end-to-end from the console; card + DID doc resolve; testkit `audit <name>` passes identity probes |
| **S3** | Identity links — ✅ built 2026-09-17 (brief `docs/ARP-agentid-s3-identity-links.md`): `agent_links` (nostr / kybernesis / runtime / web) with challenge + two-way proofs (signed nostr event; ES256 statement via control-plane JWKS; fetched `/.well-known/agentid-verification` or meta tag), DID doc rebuilt from verified links (`alsoKnownAs` + `AgentRuntime` / `KybernesisControlPlane` services), NIP-05 `/.well-known/nostr.json` on the mirror, Identities panel on `/names/<sld>`, verified links on the profile. **S3b open:** control-plane emitter in `kybernesis-admin` | `agent_links` table + Identities panel; Buzz link via NIP-05 (first); control-plane link via registrar-bind; runtime link via nonce challenge; DID doc emits `alsoKnownAs` / `verificationMethod` / `service` from links | samantha.agent shows verified Buzz + control-plane + runtime links; nostr client shows NIP-05 verified |
| **S4** | Eve thin package + push delivery — ARP side ✅ live 2026-09-18 (PR #159: push delivery to Eve/generic runtimes with JWKS-verified ES256 tokens, replies signed by the cloud-held key, agent-API connections/send, attach/detach runtime + panel, freshness gate). Platform side ✅ published `@kybernesis/identity@0.1.0` (npm + registry, platform PR #73). S3b ✅ (kybernesis-admin PR #19, deployed). **Live two-agent gate ✅ 2026-09-18** (Kyber ↔ Sid on exe.dev, see the S4 brief; PRs #167–#170 fixed re-provision, DID-doc schema, same-tenant agent API, deny mapping). Tool-invoked leg ✅ later the same day on the real names `kyber.agent` ↔ `sid.agent` (identity 0.1.1 renames ARP peer tools to `ask_<name>_agent` to avoid colliding with control-plane peers). All four S4 gate items closed. Brief: `docs/ARP-agentid-s4-eve-package-push.md` | `@kybernesis/identity` in `~/platform` (channel `arpAuth()` in the dispatch auth walk; `arpPeers()` dynamic tools from `/api/connections`; extension with contact skill; registry item); ARP side: cloud-bridge Eve adapter (Eve session API) + **push delivery mode** in cloud-runtime; handoff shape unification | two Eve agents in two tenants pair via cloud.arp.run, exchange a message, and hit a visible policy denial; no daemon involved |
| **S5** | A2A transport + signed card + mirror — **✅ merged + live 2026-09-18** (PR #162; follow-ups #163 gateway lazy card backfill, #164 testkit probe shape, #165 unsigned card for exported custody) (brief `docs/ARP-agentid-s5-a2a-transport.md`): `/.well-known/agent-card.json` is the A2A v1.0 card signed with the identity key (EdDSA, JCS, `jku` = mirror `/.well-known/jwks.json`); ARP card at `arp-card.json` + extension `https://arp.run/ext/arp/v1`; mirror `POST /a2a` JSON-RPC (`message/send`, `tasks/get`, `tasks/cancel`, `agent/getAuthenticatedExtendedCard`) with the Connection Token as bearer → `dispatchInbound` (AUTH_REQUIRED / REJECTED / COMPLETED / SUBMITTED); `@kybernesis/arp-transport-a2a` (outbound: card resolve + JSON-RPC client + `Transport.send` adapter) wired into the agent-API send for non-hosted peers; testkit `a2a-card` probe (12/12) + `--resolver mirror`; RFC-0005 on the spec site; profile + records pages show the A2A endpoint + signed-card badge; weekly `rebuild-cards` cron backfills/re-signs cards. S5b: `message/stream`, push-notification configs, gRPC, exported-custody card signing via `arpc`. | `packages/transport-a2a` implementing `Transport`; ARP as A2A extension; signed agent card (JWS/JCS) binding DID + `.agent` + mirror host; `supported_scopes` actually populated; ICANN mirror host per name; testkit probes updated | a stock A2A client resolves and addresses a `.agent` identity via the mirror with zero custom code |
| **S6** | **S6a zero-code connect ✅ 2026-09-18** (brief `docs/ARP-agentid-s6-zero-code-connect.md`; ARP PR #173 + platform PR #75): an owner connects an agent to its name with one field + one click — gateway-signed connect token, runtime self-configures into `.eve/arp-identity.json`, no env vars, no redeploy; Kybernesis scaffolds ship ARP-ready. Proven on Kyber + Sid from clean hosts (4–5 s each). **Gift a name ✅ 2026-09-20** (side quest): `/names/<sld>` → "Give this name" → one-use link (`/gift#<token>`, 30-day TTL, SHA-256 stored); recipient accepts signed-in → registration moves accounts, giver's identity/links/owner proof retired, fresh cloud-custody identity minted for the recipient. Name stays on our registrar account, so no upstream transfer call (Headless `POST /api/v1/domains/transfer` exists for moving a name OUT to another registry account; deliberately not exposed — it needs supplier vocabulary). Migration 0015 `name_gifts`. **Reference pair fully integrated 2026-09-20:** `kyber.agent` (owner ian; runtime + Buzz NIP-05 + control-plane links verified) and `sid.agent` (owner ian; runtime + control-plane) paired 30 days with asymmetric grants; identity 0.3.0 `intent` → ARP scope; Cedar deny/allow proven live via the agent API and via Sid's own tool call, audited both sides (handoff 2026-09-20). **S6c identity profile ✅ live 2026-09-21** (brief `docs/ARP-agentid-s6c-identity-profile.md`; ARP PRs #215/#216, platform PR #77 = buzz 0.9.12 `profile --from-agentid`, kybernesis-admin PR #20): the `.agent` identity is the source of truth for name/description/picture/accent — edited on `/names/<sld>`, served at `https://<sld>.agent.arp.run/avatar.png` + `/.well-known/agent-profile.json`, listed in the identity document (`AgentProfile` service) and the signed A2A card (`iconUrl`), shown on the badge; Buzz kind-0 published from the host key; control plane reads it as the default presentation when the link is verified both ways. Kyber + Sid have pictures, accents and descriptions. **S6d owner account ✅ 2026-09-21:** `/account` (account name = default owner label; email + 6-digit code sign-in from any device, Resend; passkeys, rotation, recovery phrase moved under it); email sessions read everything but cannot sign — key actions still need the phrase or a passkey on that device. **Domain migration (locked 2026-09-24):** everything moves to agentid.dev — lander, profiles `agentid.dev/<sld>`, console `cloud.agentid.dev`, machine surface `<sld>.agentid.dev`, gateway `gateway.agentid.dev`, mail `@agentid.dev`; clean cut, no compatibility layer (Ian is the only user); brief `docs/ARP-agentid-domain-migration.md`. **S6b next:** ecosystem tiers + commerce, pick-from-platform connect, hosted secret store for disk-less hosts. | Tier-1 adapters revalidated (OpenClaw, Hermes, LangGraph; `arpc` no longer hard-exits); Tier-0 onboarding for URL-only agents; pricing tiers live (name / Connect / Payments); MPP (Stripe Machine Payments Protocol) evaluation for the Payments add-on; storefront copy finalised; brand/domain decision executed | first non-Kybernesis agent registered + connected; pricing live |

Hardening items from §5 are scheduled into the slice that touches the code: S1 (docs, session secret default, catalog filesystem read), S4 (push delivery, handoff shapes, response bypass, drainQueue obligations, replay freshness), S5 (card capabilities, revocation polling, egress re-check decision).

## 7. Open questions (need Ian or external input)

1. Headless registrar API: exact endpoints for register / renew / DNS records, and whether we set our own price or pass theirs through (theirs today: 50 Gems/yr ≈ $26 human, 1 Gem via MPP for agents).
2. Final brand + domain (AgentID at `agent.arp.run` is the working placeholder).
3. Name price, Payments take-rate, and whether Connect stays at $5/agent/mo.
4. PR #35 (v1.0.0 bump of all 25 packages): merge at S6, or close and re-cut.
5. Whether the control plane should itself become ARP-aware (org principal = DID) beyond the link, or stay a pure link target. Default: link only until S6.

## 8. Operating rules for this plan

- Branch per slice: `agentid-s<N>-<short-name>`. Conventional commits tagged `[agentid/s<N>]`.
- Every docs change mirrors to the vault `ARP/` folder in the same step (`CLAUDE.md` → `ARP-CLAUDE-md.md`).
- Pushes and merges follow CLAUDE.md §4/§6; Ian approves pushes unless he has said "deploy" / "ship" for that slice.
- Update §6 status column and the memory file when a slice lands.
