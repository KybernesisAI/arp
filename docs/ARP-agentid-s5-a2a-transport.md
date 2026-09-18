# AgentID — Slice S5: A2A transport, signed agent cards, the mirror as an A2A endpoint

**Parent:** `docs/ARP-agentid-plan.md` §6 (S5), decision D5 (A2A-first, DIDComm optional) + D7 (mirror). **Status (2026-09-18):** A1–A6 ✅ built on `agentid-s5-a2a` (commits `[agentid/s5/a1..a6]`); RFC numbered **0005** (next unused, not 0006); merged as PR #162; migration 0013 applied to prod; gateway + cloud app redeployed. Backfill of pre-S5 rows happens **lazily on first fetch** of `agent-card.json` (gateway holds the sealing key; the console's weekly `rebuild-cards` cron re-derives on Mondays) — `CRON_SECRET` is a hidden Vercel var, so the one-shot route cannot be curled from a dev box. Live gate results in PR #162 / the follow-up PR.
**Branch:** `agentid-s5-a2a`. Commits tagged `[agentid/s5]`.
**Goal:** any stock A2A client can discover a `.agent` identity by fetching its signed card from the mirror, address it with `message/send`, and get a policy-checked, audited reply — while ARP's consent, scopes, obligations, audit and revocation keep working underneath. ARP becomes an **A2A extension**; the Connection Token rides as the A2A bearer credential.

---

## 0. Ground truth (verified 2026-09-18 from `a2aproject/A2A` `main`: `specification/a2a.proto`, `docs/specification.md`)

- **Card path:** `GET https://{server_domain}/.well-known/agent-card.json` (spec §8, §14.3). **Collides with ARP's own card path** (`packages/spec/src/constants.ts` `AGENT_CARD`, served by `packages/cloud-runtime/src/http.ts`, consumed by testkit `well-known.ts`, templates `handoff-bundle.ts`, the profile + records pages).
- **AgentCard (proto → JSON camelCase):** `name`, `description`, `supportedInterfaces[]` (`AgentInterface{url, protocolBinding, protocolVersion, tenant?}`; bindings `JSONRPC` \| `GRPC` \| `HTTP+JSON`), `provider{organization,url}`, `version`, `documentationUrl`, `capabilities{streaming, pushNotifications, extensions[AgentExtension{uri, description, required, params}], extendedAgentCard}`, `securityRequirements`/`securitySchemes` (APIKey / HTTPAuth / OAuth2 / OIDC / mTLS), `defaultInputModes[]`, `defaultOutputModes[]`, `skills[AgentSkill{id,name,description,tags,examples,inputModes,outputModes}]`, `signatures[AgentCardSignature{protected, signature, header?}]`, `iconUrl`, `protocolVersion: "1.0"`.
- **Signing (§8.4):** JCS (RFC 8785) over the card **minus `signatures`**, protobuf field-presence rules (omit unset optionals + default-valued non-required fields), JWS detached-style: `protected` = base64url(JSON header `{alg, typ:"JOSE", kid, jku?}`), `signature` = base64url(sig over `<protected>.<base64url(payload)>`). Verifiers fetch keys via `jku` (JWKS) / `kid`.
- **Methods (JSON-RPC 2.0):** `message/send`, `message/stream`, `tasks/get`, `tasks/list`, `tasks/cancel`, `tasks/pushNotificationConfig/{create,get,list,delete}`, `agent/getAuthenticatedExtendedCard`. `Message{messageId, contextId, taskId, role: ROLE_USER|ROLE_AGENT, parts[Part{text|raw|url|data, mediaType, filename, metadata}], metadata, extensions[], referenceTaskIds[]}`; `Task{id, contextId, status{state, message, timestamp}, artifacts[], history[], metadata}`; `TaskState` SUBMITTED / WORKING / COMPLETED / FAILED / CANCELED / INPUT_REQUIRED / REJECTED / AUTH_REQUIRED.
- **Extensions:** declared in `capabilities.extensions[]` by URI; negotiated per request with the `A2A-Extensions` header (comma-separated URIs).
- **Our transport seam:** `packages/transport/src/types.ts` `Transport` interface is the isolation point (CLAUDE.md invariant #1). Envelopes today are hand-rolled compact JWS (`envelope.ts`); `SUPPORTED_PROTOCOLS = ['didcomm/v2', 'a2a/1.0']` already declared; the ARP card has `endpoints.a2a?` and `accepted_protocols`.

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| S5-1 | **`/.well-known/agent-card.json` becomes the A2A v1.0 card.** ARP's own card moves to **`/.well-known/arp-card.json`** (same schema as today) and is also embedded in the A2A card as the extension `https://arp.run/ext/arp/v1` with `params: { did, arpCard: <url>, pair: <url>, scopes: [...] }`. `AGENT_CARD` constant → new `A2A_AGENT_CARD` + `ARP_CARD`; testkit `well-known` probe reads `arp-card.json`; new probe `a2a-card` validates + verifies the A2A card. | The standard owns the path; interop is the point of S5. |
| S5-2 | **Cards are signed with the identity's own Ed25519 key** (`alg: EdDSA`, `kid: did:web:<sld>.agent#key-1`, `jku: <mirror>/.well-known/jwks.json`). The mirror host serves the identity's public key as an OKP JWK at `/.well-known/jwks.json` (host-routed: on `gateway.arp.run` that path stays the push signer). Cloud-custody identities are signed by the gateway with the opened seed; exported-custody identities get an unsigned card until they re-sign via `arpc` (S5b). | Binds card ↔ DID ↔ name cryptographically; verifiers need nothing but the mirror. |
| S5-3 | **The mirror is the A2A endpoint:** `supportedInterfaces: [{ url: "https://<sld>.agent.arp.run/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0" }]`; Vercel middleware proxies `/a2a` to the gateway with `?target=`. | Browsers and A2A clients can't resolve HNS (S2 §0.2). |
| S5-4 | **Auth for `message/send` = ARP Connection Token as bearer** (`securitySchemes: { arp: { type: "http", scheme: "bearer", bearerFormat: "ARP connection token" } }`). The gateway verifies the token (audience = this agent, active + unrevoked connection), derives the peer DID from it, builds the ARP request message, and runs the normal `dispatchInbound` (PDP, obligations, audit, delivery). Unauthenticated calls get a `Task` in `AUTH_REQUIRED` whose status message says how to pair (`https://cloud.arp.run/pair?peer=did:web:<sld>.agent`). | This *is* D5: consent + policy + audit that A2A lacks, delivered through A2A's own auth slot. |
| S5-5 | **Sync first.** `message/send` returns `Task{COMPLETED}` with the reply when the runtime is push-mode (reply within the request) and `Task{SUBMITTED}` + `tasks/get` polling for WS-bridge agents (reply correlated by thid from the `messages` table). `message/stream` = S5b. | Matches S4's delivery model. |
| S5-6 | **Outbound to non-ARP A2A agents = `packages/transport-a2a`** implementing `Transport.send` for peers whose DID doc / card advertises a JSONRPC interface: `message/send` with the connection-token bearer, reply mapped back to an ARP `/response`. Wired into agent-API `send` when the peer is not hosted on this gateway. | Completes "interoperates outward" without touching the DIDComm path. |
| S5-7 | **No JWE / encryption changes; DIDComm path untouched.** The A2A path is additive. | Scope. |

## 2. Tasks

| # | Task | Done when |
|---|---|---|
| A1 | `@kybernesis/arp-spec`: `A2aAgentCardSchema` (+ `AgentInterface`, `AgentSkill`, `AgentExtension`, `AgentCardSignature` zod), `ARP_A2A_EXTENSION_URI`, constants `A2A_AGENT_CARD` / `ARP_CARD` / `A2A_ENDPOINT_PATH`; JSON schema emitted. `@kybernesis/arp-templates`: `buildA2aAgentCard({ name, description, did, mirrorOrigin, arpCard, pairUrl, scopes })`. `@kybernesis/arp-transport`: `card-signing.ts` — `canonicalizeAgentCard()` (JCS minus `signatures`, presence rules), `signAgentCard(card, {privateKey, kid, jku})`, `verifyAgentCardSignature(card, jwks)` (EdDSA + ES256). | unit tests incl. a vector from the spec example |
| A2 | cloud-db migration 0013: `agents.well_known_a2a_card JSONB`; `mintIdentity` + `rebuildWellKnown` build + sign the A2A card (cloud custody) and keep the ARP card. Gateway: `/.well-known/agent-card.json` → A2A card, `/.well-known/arp-card.json` → ARP card, `/.well-known/jwks.json` on mirror hosts → identity OKP JWK. | gateway tests |
| A3 | Gateway `POST /a2a` JSON-RPC: `message/send`, `tasks/get`, `tasks/cancel` (reject if not cancellable), `agent/getAuthenticatedExtendedCard`; bearer = connection token → `dispatchInbound`; AUTH_REQUIRED task for anonymous; JSON-RPC error codes per spec. `A2A-Extensions` header honoured (ARP ext params echoed). Middleware: `/a2a` added to mirror proxy paths. | gateway e2e: stock JSON-RPC call with a real connection token → COMPLETED task with the reply |
| A4 | `packages/transport-a2a`: `createA2aTransport()` implementing `Transport.send` (+ `resolveA2aInterface(did)` from DID doc `service` / card); agent-API `send` falls back to it when the peer is not hosted here. | unit tests with a fake A2A server |
| A5 | Testkit: `a2a-card` probe (fetch, schema, signature via `jku`), `well-known` probe → `arp-card.json`; `--resolver mirror` flag (deferred from S2). | `npx @kybernesis/arp-testkit audit samantha.agent --resolver mirror` 12/12 |
| A6 | Docs: RFC-0006 "ARP as an A2A extension" on the spec site; profile + records pages show the A2A endpoint + "Verified card" badge; plan §6. | merged |

## 3. Acceptance gate

1. Full workspace gate green.
2. `https://samantha.agent.arp.run/.well-known/agent-card.json` validates against the A2A schema and its signature verifies against `https://samantha.agent.arp.run/.well-known/jwks.json`.
3. A stock A2A client (`@a2a-js/sdk` or raw JSON-RPC) with a valid connection token gets a `COMPLETED` task from `agentid-test.agent`; without a token gets `AUTH_REQUIRED` with the pair URL; a request outside scope gets `REJECTED` and appears in the audit log.
4. `arpc`/agent-API send to a non-ARP A2A agent (fake server in test) round-trips.
5. Testkit 12/12 against the mirror.

## 4. Conservative calls

- `message/stream`, push-notification configs, `tasks/list`, gRPC binding: S5b.
- Exported-custody identities ship an unsigned card until `arpc` learns to sign (S5b).
- Skills are minimal in v1 (one `converse` skill + one per scope category present on active connections); richer skills come from typed actions (unification roadmap Phase B) later.
