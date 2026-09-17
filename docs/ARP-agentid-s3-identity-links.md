# AgentID — Slice S3: Identity links

**Parent:** `docs/ARP-agentid-plan.md` §3 + §6 (S3). **Status:** built 2026-09-17 (L1–L5 ✅; L6 this edit). Live gate: migration 0011 on prod, gateway redeploy (`railway up`), NIP-05 check on the mirror. **S3b (cross-repo, open):** the control plane must emit the ES256 statement `{sub:'agent:<org>/<name>', did, challenge}` from an admin action; until then Kybernesis links stay pending.
**Branch:** `agentid-s3-identity-links`. Commits tagged `[agentid/s3]`.
**Goal:** a `.agent` name is the root identity; other identities attach to it as **verified links** with two-way proofs. First link kinds: **Buzz / nostr**, **Kybernesis control plane**, **runtime endpoint**, **web origin**. The DID document, the public profile, and the records page all reflect verified links; a NIP-05 document is served for nostr so any nostr client sees the name as verified.

---

## 1. Model

`agent_links` (migration 0011), tenant-scoped, one row per attachment:

| column | notes |
|---|---|
| `id`, `tenant_id`, `agent_did` | owner + subject |
| `kind` | `nostr` \| `kybernesis` \| `runtime` \| `web` |
| `value` | canonical form: nostr → **hex pubkey** (npub accepted on input); kybernesis → `agent:<org>/<name>`; runtime/web → `https://` origin or URL |
| `label` | optional display label (e.g. "Buzz", "Kybernesis") |
| `challenge` | random nonce minted at creation; embedded in the proof the other side must produce |
| `proof_json` | what verified it (the signed nostr event, the JWS, the fetched verification doc) |
| `status` | `pending` \| `verified` \| `revoked` |
| `verified_at`, `revoked_at`, `created_at`, `updated_at` | |

Unique on `(agent_did, kind, value)`.

## 2. Proofs (what "verified" means per kind)

| kind | our side → theirs | their side → ours |
|---|---|---|
| `nostr` | DID doc `alsoKnownAs: nostr:npub…`; gateway serves NIP-05 `GET /.well-known/nostr.json?name=_` → `{ names: { _: <hex> } }` on the mirror | A **signed nostr event** (any kind; we use 27235-style) whose `content` equals our challenge string `agentid-link:<agentDid>:<challenge>`, `pubkey` equals the linked hex key, valid id + Schnorr signature. The agent's kind-0 profile can then set `nip05: _@<sld>.agent` (or `_@<sld>.agent.arp.run` for ICANN-only clients). |
| `kybernesis` | DID doc `alsoKnownAs: kybernesis:agent:<org>/<name>` + `service` `KybernesisControlPlane` (issuer URL) | A compact **ES256 JWS** signed by the control plane's per-org key (verified against `<issuer>/api/jwks`), claims `{ iss: <issuer>, sub: 'agent:<org>/<name>', did: <agentDid>, challenge }`. The control plane emits it from the admin ("Link .agent name") — cross-repo, lands in `kybernesis-admin` after this slice; until then the row stays `pending`. |
| `runtime` | DID doc `service` `AgentRuntime` (URL) | `GET <url>/.well-known/agentid-verification` returns `{ did: <agentDid>, challenge: <challenge> }`. The S4 `@kybernesis/identity` package serves this for Eve; any runtime can. |
| `web` | `alsoKnownAs: <origin>` | `GET <origin>/.well-known/agentid-verification` (same doc) **or** a `<meta name="agentid" content="<agentDid>:<challenge>">` tag on the origin's root page. |

A link shows as verified only after its proof checks. Revoking a link removes it from the DID doc + NIP-05 immediately (well-known docs are rebuilt on every change).

## 3. Tasks

| # | Task | Done when |
|---|---|---|
| L1 | Migration 0011 + `agentLinks` schema + `TenantDb` helpers (`createLink`, `listLinks`, `getLink`, `updateLink`, `deleteLink`) + tests | cloud-db tests green |
| L2 | `apps/cloud/lib/links.ts`: normalizers (npub→hex, kybernesis handle, URL origin), `makeChallenge`, proof verifiers per kind (nostr event: id + Schnorr via `@noble/curves`; kybernesis JWS via `jose` JWKS; runtime/web via fetch), `rebuildWellKnown(tenantDb, agentDid, env)` → DID doc `alsoKnownAs`/`service` from verified links | unit tests with generated keys + mocked fetch |
| L3 | Routes: `GET/POST /api/names/[sld]/links`, `POST /api/names/[sld]/links/[id]/verify` (accepts `{ proof }` for nostr/kybernesis; fetches for runtime/web), `DELETE /api/names/[sld]/links/[id]` | route tests, supplier-neutral bodies |
| L4 | Gateway: `GET /.well-known/nostr.json` (NIP-05) for the resolved agent from a verified nostr link; mirror proxy already covers `/.well-known/*` | gateway test |
| L5 | UI: **Identities** panel on `/names/<sld>` (add link → shows the challenge + per-kind instructions → verify → verified badge → remove); profile page lists verified links | manual smoke |
| L6 | Docs: plan §6, brief progress, vault mirror; note the control-plane emitter as the S3b cross-repo follow-up | merged |

## 4. Out of scope (deliberate)

- Emitting the kybernesis JWS from the control plane (needs a `kybernesis-admin` change: an admin action that signs `{sub, did, challenge}` with the org key). Tracked as **S3b**.
- Publishing the nostr key as a DID `verificationMethod` (schema only allows Ed25519 today). `alsoKnownAs` + NIP-05 is the interoperable proof; a `Multikey` VM can come with S5's card work.
- Fetching kind-0 profiles from relays server-side (would need a WebSocket client on Vercel). The signed-event proof establishes key control; the profile's `nip05` is the user's side and is visible in any nostr client.
