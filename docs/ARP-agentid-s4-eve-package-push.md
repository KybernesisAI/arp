# AgentID — Slice S4: Eve thin package + push delivery

**Parent:** `docs/ARP-agentid-plan.md` §6 (S4), decisions D6 + hardening gaps in §5. **Status (2026-09-18):** ARP side ✅ merged + live (PR #159): migration 0012 on prod, gateway redeployed with `ARP_CLOUD_PUSH_SIGNING_JWK` / sealing key / issuer → `https://gateway.arp.run/.well-known/jwks.json` live, agent-API answering, attach panel on `/names/<sld>`. Platform side ✅ built + tested locally on `~/platform` branch `identity-package` (`packages/identity` 0.1.0, registry item `identity`, 7 tests) — **not yet published to npm nor deployed to registry.kybernesis.ai** (release gate = Ian). **E3 / S3b (control-plane emitter) still open.** Live gate (§3.2, two Eve agents) pending the publish.
**Branches:** `agentid-s4-push-delivery` (this repo) then `identity-package` in `~/platform`. Commits tagged `[agentid/s4]`.
**Goal:** a Vercel-hosted Eve agent can be reached by its `.agent` name and can reach its paired peers, with **no daemon, no WebSocket, no key in the Eve bundle**. ARP Cloud holds the identity, policy, audit, and key; the Eve agent is an HTTP backend plus a thin package that verifies ARP Cloud's tokens and exposes peers as tools — exactly the shape `@kybernesis/enterprise` + `@kybernesis/dispatch` already use for the control plane.

---

## 0. Ground truth (do not re-research)

- Today delivery is **WebSocket-only** (`packages/cloud-runtime/src/dispatch.ts`: `sessions.getByAgent` → `session.send`, else `queued_no_session`, 7-day expiry). No push-to-URL exists. Library mode has no outbound send. (Plan §5.)
- Outbound today: the bridge signs an envelope with the **exported** agent key and POSTs to `gateway/didcomm?target=<peer>`; replies correlate by `thid` (`packages/cloud-bridge/src/bridge.ts`). The gateway's forward path re-enters `dispatchInbound` on the recipient (`packages/cloud-runtime/src/forward.ts`).
- Cloud-custody identities (S2) keep the seed sealed in `agents.private_key_enc` (`v1:<iv>:<tag>:<ct>`, AES-256-GCM, key `ARP_CLOUD_KEY_ENCRYPTION_KEY`). The gateway does not currently have that env or an opener.
- Platform conventions (`~/platform/AGENTS.md`): five attachment surfaces; route auth must be a **channel** (`eveChannel({ auth: [...] })`), tools via `defineDynamic` on `turn.started` with a 6 s budget / 60 s cache, everything degrades (never throws) at boot; env trio pattern `<X>_ISSUER` / `<X>_AGENT` / `<X>_AGENT_CREDENTIAL`; `eve` is a peer dep pinned `>=0.51.0 <0.52.0`; packaging ESM `tsc -p tsconfig.build.json`, exports include `./package.json`, `files: [dist, NOTICE]`, registry item under `registry/registry/*.ts`.
- How the platform calls an Eve agent: `POST <base>/eve/v1/session {message}` with a bearer, then `GET /eve/v1/session/<id>/stream?startIndex=0` read **incrementally**, reply = `message.completed` with `finishReason === "stop"`, stop on `session.waiting` / `turn.completed`, fail on `turn.failed` / `session.failed` (`packages/dispatch/src/governed-peers.ts:162-235`).
- `kybernesisAuth()` returns a session principal `{ authenticator, issuer, principalId, principalType: 'agent', subject, attributes }` and returns `null` (never throws) on missing/invalid credentials (`packages/enterprise/src/kybernesis-auth.ts`).

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| S4-1 | **ARP Cloud (the gateway) is the issuer the Eve agent trusts.** It signs every push with an ES256 key (`ARP_CLOUD_PUSH_SIGNING_JWK`) and publishes `GET /.well-known/jwks.json` at `https://gateway.arp.run`. The Eve package verifies offline via JWKS, like `kybernesisAuth`. | One trust root, no per-agent secrets in the Eve bundle, revocation by TTL (5 min) + connection revoke. |
| S4-2 | **Push delivery targets the Eve session API directly** (`push_kind='eve'`): `POST <push_url>/eve/v1/session` with the push JWS as bearer, stream the reply. A `generic` kind posts `{prompt, peerDid, thid, connectionId}` to `<push_url>` and expects `{reply}` (same contract as the bridge's generic-http adapter). | Zero new HTTP surface on the Eve side; the agent already speaks this. |
| S4-3 | **The gateway signs replies + outbound requests with the cloud-held key.** Gateway gains the sealing key env + `openPrivateKey` (same format as `apps/cloud/lib/key-custody.ts`). | Cloud custody (S2-1) implies the cloud signs. |
| S4-4 | **Outbound from Eve goes through an agent-API on the gateway**, authenticated by a long-lived **agent credential** (random 32-byte token, SHA-256 hash stored in `agent_credentials`, shown once at attach): `GET /agent-api/connections`, `POST /agent-api/send {peer_did, text, thid?}` (waits for the `/response` by `thid`, 120 s). | Mirrors `KYBERNESIS_AGENT_CREDENTIAL`; the gateway is long-lived so it can hold the pending reply map; Vercel functions can't. |
| S4-5 | **Attaching a runtime = a verified S3 runtime link + push config.** `POST /api/agents/[did]/runtime {url, kind}` (session) creates/uses a `runtime` link with a challenge, fetches `<url>/.well-known/agentid-verification` (served by the package), and on success sets `runtime_kind='push'`, `push_url`, `push_kind`, mints the credential (returned once), rebuilds the DID doc (`AgentRuntime` service). | Reuses S3's proof; one mental model: "links". |
| S4-6 | **Package name `@kybernesis/identity`** in `~/platform/packages/identity`. Exports: `arpAuth({ issuer, agentDid })` (AuthFn), `identityChannel({ ... })` (channel at `/eve/v1/arp` owning the verification doc + health), `arpPeers({ issuer })` (dynamic `ask_<sld>` tools), `ARP_INSTRUCTIONS`. Env: `ARP_ISSUER` (default `https://gateway.arp.run`), `ARP_AGENT_DID`, `ARP_AGENT_CREDENTIAL`, `AGENTID_CHALLENGE`. Registry items `identity-channel`, `identity-peers`. | Platform conventions. |
| S4-7 | **Hardening folded in** (plan §5): `/response` messages no longer bypass the PDP blindly — they are accepted only when a matching pending `thid` exists for that agent or the connection is active; `drainQueue` recomputes obligations from the stored decision; `created_time` freshness (±5 min) on inbound envelopes. | Same code paths are being touched. |

## 2. Tasks

### ARP repo (`agentid-s4-push-delivery`)

| # | Task | Done when |
|---|---|---|
| P1 | Migration 0012: `agents.push_url`, `agents.push_kind` (`eve`\|`generic`); `agent_credentials` (id, tenant_id, agent_did, token_hash UNIQUE, label, created_at, last_used_at, revoked_at). TenantDb helpers + cross-tenant lookup by hash for the gateway. | cloud-db tests |
| P2 | `packages/cloud-runtime/src/custody.ts`: `openPrivateKey` (format-compatible, tested against a vector sealed by the cloud app) + `sealingKeyFromEnv`. | round-trip test |
| P3 | `packages/cloud-runtime/src/push.ts`: push JWS mint (ES256 via `jose`, `kind:'arp-push'`, `iss`, `aud: agentDid`, `sub: peerDid`, `connection_id`, `msg_id`, `thid`, `scopes`, `obligations`, `exp` +5 m), `GET /.well-known/jwks.json`, adapters `deliverEve()` (session + incremental stream) and `deliverGeneric()`, `deliverPush()` orchestrator: sign reply envelope with the opened seed, forward to the peer, mark delivered, audit. | unit tests with a fake Eve server (Hono) |
| P4 | Dispatch integration: after persist, if no WS session and `runtime_kind='push'` → `deliverPush()` (async, logged, never blocks the 202). `/response` envelopes: resolve a pending `thid` (agent-api send) before any push. Freshness check. | dispatch tests |
| P5 | Gateway agent-API: `GET /agent-api/connections`, `POST /agent-api/send` (bearer credential → hash lookup → sign request envelope with the cloud-held key → forward → await reply by `thid`). Rate-limited per credential. | gateway tests |
| P6 | Cloud app: `POST /api/agents/[did]/runtime` (attach: verify link → set push → mint credential once), `DELETE` (detach → `runtime_kind='none'`, revoke credentials). Records page: "Attach runtime" panel (URL + kind → shows challenge → verify → credential shown once with env snippet). | route tests |
| P7 | Ops: generate `ARP_CLOUD_PUSH_SIGNING_JWK`, set gateway env (`ARP_CLOUD_KEY_ENCRYPTION_KEY` too), `railway up`, apply migration 0012. | JWKS live |

### Platform repo (`identity-package`)

| # | Task | Done when |
|---|---|---|
| E1 | `packages/identity`: `arpAuth()`, `identityChannel()`, `arpPeers()`, `ARP_INSTRUCTIONS`; README; NOTICE; tests (node --test) with a local JWKS + fake gateway. | `pnpm -r build`, tests green |
| E2 | Registry items `identity-channel.ts` (`agent/channels/arp.ts`) + `identity-peers.ts` (`agent/tools/arp-peers.ts`); registry JSON regen. | `eve add @kybernesis/identity-channel` works |
| E3 | S3b: control-plane emitter — in `~/kybernesis-admin`, admin action "Link .agent name" signs `{sub:'agent:<org>/<name>', did, challenge}` with the org key (ES256) and shows the statement. | statement verifies in `/api/names/[sld]/links/[id]/verify` |

## 3. Acceptance gate

1. Full workspace gate green in both repos.
2. **Live:** two Eve agents in two ARP tenants, each attached via `POST /api/agents/[did]/runtime`, pair via `cloud.arp.run/pair`, and: (a) agent A's `ask_<b>` tool gets a reply from B; (b) a message outside the connection's scopes is denied and visible in B's audit; (c) neither agent runs a daemon; (d) revoking the connection stops delivery within one message.
3. `agentid-test.agent` (S2's test name) is the first attached Eve identity.

## 4. Conservative calls

- Push replies are synchronous within the Eve turn (stream until `turn.completed`); long tasks beyond 5 min are out of scope (S5+ can add async `/response` callbacks).
- `arpPeers()` calls carry the agent's identity, not the human's (same trade-off as `governedPeers()`).
- No DIDComm/JWE encryption changes; A2A transport is S5.
