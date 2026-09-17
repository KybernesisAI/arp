# AgentID — Slice S2: Registrar-in-console

**Parent:** `docs/ARP-agentid-plan.md` §6 (S2). **Status:** brief written 2026-09-17; execution starts same day.
**Branch:** `agentid-s2-registrar-console`. Commits tagged `[agentid/s2]`.
**Progress (2026-09-17):** T1 ✅ · T2 ✅ · T3 ✅ · T4 ✅ · T5 ✅ (all unit-tested against fixtures/stubs; live gate blocked on §5 asks). Next: T6 owner binding, T7 mirror host, T8 profile page, T9 console UI, T10 webhooks/reconcile, T11 samantha re-mint, T12 docs.
**Customer-facing rule (Ian, same day):** no mention of the upstream registry, gems, crypto, or DIDs anywhere a customer can see — UI, API error codes/messages, stored messages, profile pages. Error codes are `registry_unavailable` / `payments_not_configured`, never supplier-named.
**Goal:** a signed-in user searches a `.agent` name in the console, pays, and walks away with a live identity (DID document + signed card + profile page + owner binding) with **no runtime attached yet**. Purchase is the entry point; everything else is a side effect.

---

## 0. Ground truth gathered 2026-09-17 (do not re-research)

### 0.1 Headless Domains API (registrar side)

Base URL `https://headlessdomains.com`. OpenAPI 1.0.0 archived at `docs/headless/openapi-2026-09-17.json` (31 paths). Auth: `X-API-Key: hd_live_…` (preferred) or `Authorization: Bearer <GFAVIP token>`. Keys are generated in the Headless dashboard → Settings; there are **no scoped keys** (`/api/v1/agents/me` says so). Rate limits: search + lookup 60/min/IP, provisioning 10/h/IP, everything else unlimited.

| Need | Endpoint | Notes |
|---|---|---|
| Availability + price | `GET /api/v1/domains/search?q=<sld>` (no auth) | Returns one row per namespace; filter `tld === 'agent'`. Fields: `available`, `human_price` (50 GFA Gems), `agent_price` (1 Gem), `agent_mpp_price.amount` (0.52 USD), `reason`, `launch_phase`, `landgrab_multiplier`. **`test_registration_enabled` is false for `.agent`** → no sandbox; every registration is real. |
| Non-mutating quote | `POST /api/v1/domains/quote` (auth) `{domain, namespace:'agent', years, coupon_code?}` | Returns `MPPQuote`. Use for the checkout confirmation screen. |
| Register | `POST /api/v1/domains/register` `{domain, namespace:'agent', years, agreed_to_terms:true, payment_method:'gems', reseller_channel:'arp.run', target_owner_id?}` | **The OpenAPI example for `reseller_channel` is literally `'arp.run'`** — Headless already coded our channel. `payment_method:'gems'` debits the master account's prepaid Gems at wholesale when the account is flagged reseller. Response 201: `{domain, domain_id, order_id, status, expiry_date, grace_ends_at, owner_id, reseller_channel}`. 402 = MPP challenge (only if `payment_method` omitted). |
| Renew | `POST /api/v1/renew` — **MPP receipt only** (`payment_method:'mpp'`, `receipt`) | No Gems renewal in the public API. Ask Headless for a reseller renewal path (§5 asks). |
| Owned list | `GET /api/v1/my-domains` (auth) | Reconciliation source of truth. |
| Public record | `GET /api/v1/lookup/<sld>.agent` (no auth) | `domain{status,expiry_date,grace_ends_at}`, `identity{human_backed,squad_id}`, `integrations.arp_chat{enabled,url}`, `manifests{agent_json,skill_md}`, **`profile._arp{owner_label,representation_jwt}`** — this is where our v2.1 bind lands (verified live for `samantha.agent`). |
| Canonical resolution | `GET /api/v1/resolve/<sld>.agent` (no auth) | `identity.operator`, `trust.observations[]`, `actions[]` (their Action Card v1), `resources.agent_manifest`. |
| Webhooks | `POST /api/v1/webhooks/subscribe` `{target_url, events[], secret}` | Events `domain.registered`, `domain.renewed`, `domain.expired`, `profile.updated`. Header `X-Headless-Signature` = hex HMAC-SHA256 over raw body. No retry policy documented. |
| ARP bind (their side) | `POST /api/v1/arp/domains/:sld/bind-principal` `{owner_label, principal_did, public_key_multibase, signed_representation_jwt}` | Built for v2.1 (`docs/ARP-headless-integration-prompt.md` §B). Publishes `_principal.<owner>.<sld>` TXT, hosts the JWT, then POSTs to our `/internal/registrar/bind` with the PSK. **Not in their public OpenAPI**; auth for server-to-server calls unconfirmed (§5). |
| Pricing list | `GET /api/v1/integrations/shakeshift/pricing` | `.agent`: human $26.00/yr, agent $0.52/yr, same for renewal. `coupon_code` affiliate attribution exists. |
| Testing | `POST /api/v1/command` dry-run only; cannot register | Irrelevant for us. |

**Not in their API:** DNS record CRUD, domain transfer (`/domains/transfer` is mentioned in reseller docs only), Gems top-up. SLD zones are Headless/SkyInclude-hosted; `POST /domains/<sld>/enable_dns` delegates nameservers. Apex `A`/`TLSA 3 1 1` are theirs (DANE self-signed; WebPKI fallback at `https://profiles.host.limo/<sld>.agent`, which today serves an HTML profile even for `/.well-known/did.json`).

### 0.2 HNS resolution is unreliable in the wild (measured)

`hnsdoh.com`, `doh.hnsdns.com`, `easyhandshake.com:8053`, `hns.doh.hip.wtf` all fail for `agent` NS / `samantha.agent` A / `_principal.*` TXT (SERVFAIL, 503, or unreachable) while ICANN names resolve fine through the same endpoint. Headless's own `skill_hns.md` says third-party resolvers "can be unreliable" and recommends their Lookup API instead. **Consequence:** nothing in S2's done-when may depend on HNS DoH. Plan D7 (ICANN mirror) is load-bearing, not optional.

### 0.3 What already exists on our side

- `registrar_bindings` table + `POST /internal/registrar/bind` (PSK) + `GET/DELETE /api/registrar/bindings/[domain]`; dashboard shows domains as REGISTERED (binding, no agent row) vs PROVISIONED.
- `POST /api/agents/provision-cloud`: mints Ed25519 keypair, builds DID doc / agent card / arp.json via `@kybernesis/arp-templates`, stores them on the `agents` row, returns the private key **once** (handoff JSON). Gateway (`packages/cloud-runtime/src/http.ts`) serves `/.well-known/{did,agent-card,arp,revocations}.json` per agent resolved from `Host` or `?target=`.
- Stripe: `apps/cloud/lib/billing.ts` (`createCheckoutSession` is subscription-only, per-agent $5/mo; webhook handler with `stripe_events` idempotency).
- Browser-side representation-JWT signer: `apps/cloud/lib/representation-jwt-browser.ts` (principal key is browser-held did:key or passkey-gated).
- `samantha.agent`: registered 2026-04-23 (expires 2027-04-23), `profile._arp.representation_jwt` present at Headless, **no `agents` row at the gateway today** (`unknown_agent`) — deleted during PR #149 testing.

---

## 1. Decisions for this slice

| # | Decision | Why |
|---|---|---|
| S2-1 | **Cloud-managed agent keys by default.** At registration the console mints the agent Ed25519 keypair server-side, stores the private key encrypted at rest (AES-256-GCM, key from `ARP_CLOUD_KEY_ENCRYPTION_KEY`), and serves the identity immediately. "Export key" later hands the raw key to the owner and flips custody to `exported` (the existing handoff-download path). | Tier 0 needs an identity before any runtime exists; D6 already puts identity hosting in ARP Cloud. The owner can always leave with their key. |
| S2-2 | **Identity and runtime are separate states on one row.** Extend `agents` with `key_custody` (`cloud`\|`exported`), `private_key_enc` (nullable), `runtime_kind` (`none`\|`bridge`\|`push`), `domain_registration_id`. An identity with `runtime_kind='none'` is fully valid (DID doc + card resolve; inbound messages are queued with a "no runtime attached" status). | Avoids a second identity table; dashboard already keys on `agents.did`. |
| S2-3 | **We are the merchant.** Stripe Checkout in `mode:'payment'` for the name (one-time, `years` × unit price), fulfilled on `checkout.session.completed` by calling Headless `register` with `payment_method:'gems'` + `reseller_channel:'arp.run'`. Headless is a supplier paid from our prepaid Gems balance. | Plan D2. One purchase path we own; Headless never sees the customer's card. |
| S2-4 | **Mirror host = `<sld>.agent.arp.run`** (wildcard `*.agent.arp.run` → gateway). Root `/` on the mirror 302s to the profile page `https://agent.arp.run/<sld>`; `/.well-known/*` served by the gateway resolving `<sld>.agent` from the host suffix. DID doc gets `alsoKnownAs: ["https://<sld>.agent.arp.run"]`; card `endpoints` use the mirror origin. | Under a domain we already own → config, not a registration. Reads as the `.agent` name. Works in every browser and A2A client. Rename later is a find-and-replace on one env var (`AGENTID_MIRROR_SUFFIX`). |
| S2-5 | **Owner binding is a post-purchase step in the same console**, reusing the browser JWT signer: after fulfilment the dashboard shows "Finish setup → Verify ownership"; the browser signs the representation JWT with the session's principal key and the server forwards it to Headless `bind-principal`, which round-trips to our `/internal/registrar/bind`. Until that completes the domain shows `OWNER PENDING`. | Keeps the principal key browser-held (Phase 8.5 invariant) and reuses the v2.1 machinery both sides already built. |
| S2-6 | **Pricing placeholders:** unit price from env `AGENTID_NAME_PRICE_CENTS` (default 2900 = $29/yr) and `AGENTID_NAME_MAX_YEARS` (default 3). Ian sets the real number (CLAUDE.md §11). Margin depends on the wholesale rate Headless grants the `arp.run` channel (§5). | Not our call. |
| S2-7 | **No HNS DoH in tests or gates.** Testkit identity probes run against the mirror host. HNS TXT publication is verified only via Headless `lookup` (`profile._arp`) and, opportunistically, DoH when it happens to work. | §0.2. |

---

## 2. Tasks (atomic, in order)

| # | Task | Package / files | Done when |
|---|---|---|---|
| T1 | Headless client | `apps/cloud/lib/headless.ts`: `searchAgentName(sld)`, `quote()`, `registerDomain()`, `lookup()`, `myDomains()`, `subscribeWebhook()`, `verifyWebhookSignature()`. Env `HEADLESS_API_KEY`, `HEADLESS_BASE_URL` (default prod), `HEADLESS_RESELLER_CHANNEL` (default `arp.run`). Zod-validated responses; typed errors (`name_taken`, `reserved`, `insufficient_gems`, `rate_limited`, `upstream`). | Unit tests with mocked `fetch` against fixtures captured from the live API (`tests/fixtures/headless/*.json`). |
| T2 | Schema | `packages/cloud-db`: migration `0008_agentid_registrations.sql`: new `domain_registrations` (tenant_id, domain, sld, headless_domain_id, headless_order_id, status `pending_payment`\|`registering`\|`registered`\|`owner_pending`\|`active`\|`failed`\|`expired`, years, price_cents, stripe_checkout_session_id UNIQUE, stripe_payment_intent_id, expiry_at, grace_ends_at, error, created_at, updated_at); `agents` + `key_custody`, `private_key_enc`, `runtime_kind`, `domain_registration_id`. PGlite + Neon runners. | Migration applies cleanly on PGlite in tests; `TenantDb` helpers `createRegistration`, `updateRegistrationStatus`, `getRegistrationBySession`, `listRegistrations`. |
| T3 | Key custody | `apps/cloud/lib/key-custody.ts`: `sealPrivateKey(raw)` / `openPrivateKey(enc)` (AES-256-GCM, `v1:<iv>:<tag>:<ct>` — same format the control plane uses), key from `ARP_CLOUD_KEY_ENCRYPTION_KEY`; throws on production if unset (same pattern as session secret). `mintIdentity({domain, tenantId, principalDid, name, description})` → creates the `agents` row with `key_custody='cloud'`, `runtime_kind='none'`, well-known docs built with the mirror origin. Refactor `provision-cloud` to call it with `key_custody='exported'`. | Round-trip test; provision-cloud tests still green. |
| T4 | Search + checkout | `GET /api/registrar/search?q=` (session, rate-limited 30/min/tenant) → availability + our price. `POST /api/registrar/checkout` `{sld, years}` → re-checks availability, creates `domain_registrations(pending_payment)`, Stripe Checkout `mode:'payment'` with `metadata.registration_id`, returns URL. | Route tests (Stripe + Headless mocked). |
| T5 | Fulfilment | Extend `handleStripeWebhook` for `checkout.session.completed` with `metadata.kind='agentid_name'`: idempotent via `stripe_events`; transition `registering` → call Headless `register` → on 201 store ids/expiry → `mintIdentity` → `registered` (owner pending). On Headless failure: `failed` + error, **auto-refund** the PaymentIntent, PostHog event. | Webhook tests: success, duplicate event, Headless 409 (name gone) → refund path. |
| T6 | Owner binding | `POST /api/registrar/bind-owner` `{registration_id, owner_label, signed_representation_jwt, public_key_multibase}` (session) → forwards to Headless `bind-principal`; marks `owner_pending` until our `/internal/registrar/bind` callback links the binding → `active`. Dashboard "Finish setup" panel drives the browser signer (reuse `representation-jwt-browser.ts`). | Two-hop test with mocked Headless; existing `/internal/registrar/bind` tests untouched. |
| T7 | Mirror host | `packages/cloud-runtime/src/http.ts`: `effectiveHost()` strips a configurable suffix (`AGENTID_MIRROR_SUFFIX=.agent.arp.run` → `<sld>.agent`); `/` on a mirror host 302s to `AGENTID_PROFILE_BASE/<sld>`; `alsoKnownAs` + card endpoints use the mirror origin when `key_custody='cloud'`. Ops: add `*.agent.arp.run` CNAME → gateway (Vercel DNS) + Railway wildcard domain. | `curl https://<sld>.agent.arp.run/.well-known/did.json` returns the doc; testkit identity probes pass against the mirror. |
| T8 | Profile page | `apps/cloud/app/agentid/[sld]/page.tsx` (public, no auth): name, description, owner label, verified-ownership badge (from `registrar_bindings`), online/offline (from `agents.last_seen_at` / `runtime_kind`), "Request to connect" button → `cloud.arp.run/pair?peer=did:web:<sld>.agent`, developer strip with the well-known URLs. 404 for unknown names. | Renders for `samantha.agent` once re-minted. |
| T9 | Console UI | Dashboard: "Claim a name" search box (replaces the external-registrar copy), checkout redirect, registrations list with status badges, "Finish setup" (T6), "Export key" (flips custody, downloads handoff, same shape as provision-cloud). Lander claim form now posts to `/api/registrar/search` and deep-links into the dashboard with `?claim=<sld>`. | Manual smoke doc `docs/ARP-agentid-s2-manual-smoke.md`. |
| T10 | Reconciliation + webhooks | `POST /api/webhooks/headless` (HMAC verify) handles `domain.registered` / `domain.renewed` / `domain.expired` → status + expiry updates. Vercel Cron `GET /api/cron/registrar-reconcile` (daily) diffs `my-domains` against `domain_registrations`. | Signature test vectors; cron route test. |
| T11 | Re-mint `samantha.agent` | Using T3 with Ian's tenant: identity live at `https://samantha.agent.arp.run/.well-known/did.json`, profile at `agent.arp.run/samantha`. | Live check + `npx @kybernesis/arp-testkit audit samantha.agent --resolver mirror` (add the `--resolver mirror` flag to testkit if absent). |
| T12 | Docs | Update plan §6 status, CLAUDE.md §5 row, handoff block; mirror to vault. | diff clean. |

---

## 3. Acceptance gate (slice done when)

1. `pnpm run typecheck && pnpm run build && pnpm run test && pnpm run lint` green on cold cache.
2. A signed-in user registers a real `.agent` name end-to-end from the console using a Stripe **test-mode** card, and Headless returns 201 (real Gems debit — see §5 budget).
3. `https://<sld>.agent.arp.run/.well-known/did.json` and `agent-card.json` resolve with the mirror `alsoKnownAs`; `agent.arp.run/<sld>` renders; Headless `lookup` shows `profile._arp.representation_jwt` after "Finish setup".
4. Failure path proven: Headless 409 during fulfilment refunds the payment and surfaces `failed` on the dashboard.
5. No HNS DoH call anywhere in the gate.

---

## 4. Conservative calls (flag in PR, don't ask mid-run)

- Renewal UX is out of scope (Headless public API renews via MPP receipt only). Expiry is surfaced; renewal ships when §5-3 is answered.
- Transfer of the Headless-side domain record to the end user (`target_owner_id`) is **not** done; the name is held on our master account and the user's ownership is expressed by the ARP owner binding + our DB. Revisit if Headless offers a clean transfer endpoint.
- `profiles.host.limo` (Headless's WebPKI fallback) is ignored; our mirror is the canonical ICANN face.
- Wholesale price is unknown; margin math is deferred.

---

## 5. Asks for Ian / Headless (blocking marked ⛔)

1. ⛔ **Headless API key** for the ARP master account → Vercel env `HEADLESS_API_KEY` (production + preview). Generated at headlessdomains.com dashboard → Settings.
2. ⛔ **Reseller flag** on that account from Headless DevRel (so `reseller_channel:'arp.run'` + `payment_method:'gems'` bills wholesale) and the **wholesale `.agent` price**.
3. **Gems balance** on the master account sufficient for the S2 gate (one or two real names) plus early customers.
4. Headless: is `POST /api/v1/arp/domains/:sld/bind-principal` callable server-to-server with our API key, or only from a Headless-session browser? (Their integration prompt left auth unspecified.)
5. Headless: a reseller **renewal** path that debits Gems (public API is MPP-receipt only).
6. Headless: a **DNS record CRUD** endpoint (or a documented way to point apex `A`/`_arp`/`_did`/`_didcomm` at our gateway). Not blocking for Tier 0 thanks to the mirror.
7. Ian: name price (`AGENTID_NAME_PRICE_CENTS`), max years, and whether the `*.agent.arp.run` wildcard is acceptable as the interim mirror suffix.
8. Ian: one **real test name** budget for the gate (e.g. `agentid-test.agent`, retail $26 or wholesale).

Until 1–2 land, T1–T5 are built and tested against fixtures; the live gate (§3.2) waits.
