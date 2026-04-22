# ARP Phase 7 — ARP Cloud (Hosted Mode)

**Reader:** Claude Code. Directives only.

**Companion docs:** `ARP-phase-0-roadmap.md`, `ARP-phase-2-runtime-core.md`, `ARP-phase-3-sidecar.md`, `ARP-example-atlas-cloud.md`, `ARP-hns-resolution.md`.

---

## 0. Reader orientation

**Phase goal:** ship the hosted SaaS install mode. Users register their `.agent` domain and point it at our cloud; we run everything internet-facing; their agent stays on their machine and connects outbound to us via a small "cloud client." Also ship the public fallback UI at `app.arp.spec`.

**Tech pins:**
- Hosting: Vercel (Fluid Compute) for functions + Next.js
- Database: Neon Postgres (via Vercel Marketplace) for multi-tenant state
- Long-lived connections: WebSocket via Vercel's supported WS primitives, or Durable Objects via a Cloudflare Workers bridge — choose WebSocket on Vercel first
- Cache: Vercel Runtime Cache API for DID resolution + revocation polls
- Queues: Vercel Queues (beta) for async task dispatch
- Billing: Stripe via Vercel Marketplace integration
- Storage (blobs): Vercel Blob for audit archives and handoff artifacts
- HNS bridge for `app.arp.spec`: a regular ICANN domain we control, with a reverse-lookup service that maps `/agent/:did` to the tenant

**Out of scope:** enterprise features (SSO, audit exports to customer buckets), regional data residency (v0.2+), self-hosted variant of the cloud (far future).

---

## 1. Definition of done

- [ ] `arp.cloud` (Vercel project) hosts multi-tenant runtime
- [ ] Users can register, sign in with principal DID, paste handoff bundle, provision agent in <60s
- [ ] `app.arp.spec` serves the fallback UI (ICANN domain, real cert)
- [ ] `@kybernesis/arp-cloud-client` package: small npm binary that opens outbound WebSocket from a user's machine
- [ ] Cloud client survives network drops with exponential backoff reconnect
- [ ] Inbound DIDComm messages route correctly to tenant agents via the outbound WebSocket
- [ ] Message queue: if cloud client is offline, messages persist for ≥7 days, deliver on reconnect
- [ ] Stripe billing: subscription tiers (Free / Pro / Team) with usage metering
- [ ] Tenant isolation enforced at PDP, registry, and audit log levels
- [ ] HNS gateway fallback: `atlas.agent.hns.to` works without user setup (we front the gateway URL)
- [ ] Compliance testkit passes against a cloud-hosted tenant

---

## 2. Prerequisites

- Phases 1–6 complete
- Vercel account + team, Stripe account, Neon DB provisioned via Vercel Marketplace
- `arp.spec` and `arp.cloud` ICANN domains registered

---

## 3. Repository additions

```
arp/
├── apps/
│   └── cloud/                          # Next.js 16 app — tenant UI + admin
│       ├── app/
│       │   ├── (marketing)/
│       │   ├── (app)/
│       │   │   ├── dashboard/
│       │   │   ├── agents/[did]/
│       │   │   ├── billing/
│       │   │   └── settings/
│       │   └── api/
│       │       ├── auth/
│       │       ├── tenants/
│       │       ├── agents/
│       │       ├── didcomm/           # multi-tenant inbound handler
│       │       ├── ws/                # outbound-client websocket upgrade
│       │       └── webhooks/stripe/
│       ├── package.json
│       └── vercel.ts
├── packages/
│   └── cloud-client/                   # @kybernesis/arp-cloud-client npm package
│       ├── src/
│       │   ├── cli.ts
│       │   ├── connection.ts
│       │   ├── reconnect.ts
│       │   └── index.ts
│       ├── package.json
│       └── README.md
└── tests/
    └── phase-7/
        ├── multi-tenant-isolation.test.ts
        ├── cloud-client-reconnect.test.ts
        └── billing.test.ts
```

---

## 4. Implementation tasks

### Task 1 — Cloud data model (Neon Postgres)

Multi-tenant schema:
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_did TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT,
  plan TEXT CHECK (plan IN ('free','pro','team')) DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agents (
  did TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  handoff_json JSONB NOT NULL,
  public_key_multibase TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

CREATE TABLE connections (
  connection_id TEXT PRIMARY KEY,
  agent_did TEXT NOT NULL REFERENCES agents(did) ON DELETE CASCADE,
  peer_did TEXT NOT NULL,
  purpose TEXT,
  token_jws TEXT NOT NULL,
  cedar_policies JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_did TEXT NOT NULL REFERENCES agents(did),
  connection_id TEXT,
  direction TEXT CHECK (direction IN ('in','out')) NOT NULL,
  envelope_jws TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days'
);

CREATE TABLE audit_entries (
  id BIGSERIAL PRIMARY KEY,
  agent_did TEXT NOT NULL,
  connection_id TEXT,
  seq BIGINT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  decision TEXT NOT NULL,
  obligations JSONB,
  policies_fired JSONB,
  prev_hash TEXT NOT NULL,
  self_hash TEXT NOT NULL
);

CREATE INDEX idx_messages_agent_undelivered ON messages(agent_did) WHERE status = 'queued';
CREATE INDEX idx_connections_agent ON connections(agent_did);
CREATE INDEX idx_audit_agent_conn ON audit_entries(agent_did, connection_id, seq);
```

All queries include `tenant_id` or `agent_did` for row-level tenant isolation. No cross-tenant queries in application code.

**Acceptance:** migrations run green; a pen-test style script attempting cross-tenant reads fails consistently.

### Task 2 — Tenant isolation enforcement

Wrap every query with a tenant context:
```ts
const db = withTenant(tenantId).agents.findById(did);
```

Enforce in a middleware: every request has a tenant context derived from the session; queries without a tenant throw.

**Acceptance:** adversarial test — two concurrent tenants, each attempting to read the other's data; all attempts produce 404 (not 403, to prevent enumeration).

### Task 3 — Multi-tenant runtime

Adapt `@kybernesis/arp-runtime` for multi-agent hosting:
1. Wrap per-request with the agent's tenant context
2. Route `/.well-known/*` per Host header
3. Route `/didcomm` per agent DID in the envelope
4. PDP runs with per-tenant Cedar schema + scope catalog version pin
5. Audit log writes go to the Postgres `audit_entries` table, keyed by agent + connection

**Acceptance:** multi-agent test — 5 agents on the same cloud instance, each receiving messages; zero cross-agent leakage.

### Task 4 — `@kybernesis/arp-cloud-client`

`npx @kybernesis/arp-cloud-client` CLI:
```
npx @kybernesis/arp-cloud-client init                 # interactive setup
npx @kybernesis/arp-cloud-client start                # run in foreground
npx @kybernesis/arp-cloud-client install-service      # macOS/Linux: launchd/systemd
npx @kybernesis/arp-cloud-client status
```

Behavior:
1. Reads config from `~/.arp-cloud/config.json`
2. Opens WebSocket to `wss://arp.cloud/ws?did=<agent-did>&token=<bearer>`
3. Server-side: authenticates bearer token (rotated hourly via sign-challenge), attaches to tenant, subscribes agent to inbound messages
4. Delivers inbound messages to the local agent via localhost HTTP POST to `AGENT_API_URL`
5. Relays local agent's replies back via the same WebSocket
6. Exponential backoff reconnect on drop (1s, 2s, 4s, 8s, max 60s); reconnect restores delivery

**Acceptance:** integration test — start local agent, start cloud client, send 100 messages from a test peer, kill cloud client at message 50, restart, verify all 100 eventually delivered with no loss.

### Task 5 — Inbound DIDComm routing

`apps/cloud/app/api/didcomm/route.ts`:
1. Accept DIDComm envelope over HTTPS POST
2. Parse envelope, extract `to` DID
3. Lookup agent in DB
4. If agent has active WebSocket → push message over socket, await ack
5. If not → enqueue in `messages` table with status=`queued`, expires_at=now+7d
6. Return 202 Accepted to the sender

**Acceptance:** online + offline delivery both tested.

### Task 6 — Fallback UI at `app.arp.spec`

`apps/cloud/app/(app)/` served also from `app.arp.spec` domain (Vercel projects support multi-domain). Login with principal DID sign-challenge. Once authenticated:
1. Fetch the user's agents
2. Present the same owner UI as the Phase 4 app (reuse components where possible)
3. Render `/agent/<did>/` pages with connection management
4. HNS gateway fallback: if a user clicks `ian.atlas.agent.hns.to` and lands on our gateway, forward to the right `app.arp.spec/agent/<did>/` route

**Acceptance:** sign in to `app.arp.spec`, manage Atlas end-to-end including pair/revoke/audit.

### Task 7 — Onboarding flow

`apps/cloud/app/(marketing)/onboarding/page.tsx`:
1. Sign in with principal DID
2. Upload handoff.json (drag-drop or paste contents)
3. Validate via `@kybernesis/arp-spec`
4. Confirm agent DID + owner subdomain
5. Click "Provision" → server:
   a. Creates tenant row (if first agent)
   b. Creates agent row with handoff + public key
   c. Configures DNS via Headless Domains API: A record to `arp.cloud` (or CNAME to tenant-specific routing label)
   d. Issues Let's Encrypt cert via DNS-01 through Headless's API
   e. Writes the well-known docs and serves them from `apps/cloud`
6. Redirect to dashboard
7. Prompt to install `@kybernesis/arp-cloud-client` locally

**Acceptance:** onboarding completes in under 60s end-to-end in a test run.

### Task 8 — Billing via Stripe

Plans (v0):
- **Free:** 1 agent, 100 msgs/month, community support
- **Pro:** $9/mo — 1 agent, 10k msgs/month, email support
- **Team:** $29/mo — up to 5 agents, 100k msgs/month

Integration:
1. Stripe Checkout for plan selection at onboarding (or later upgrade)
2. Webhook `/api/webhooks/stripe` handles: subscription.created/updated/deleted
3. Usage metering: count inbound messages per tenant, bill overages monthly (Stripe metered billing)
4. Grace period: plan downgraded to Free if payment fails; connections preserved but usage capped

**Acceptance:** complete checkout flow with Stripe test cards; webhook updates tenant plan; quota enforcement triggers at the cap.

### Task 9 — HNS bridge for browser humans

`apps/cloud/middleware.ts`:
1. Detect Host header like `<owner>.<agent>.agent.hns.to`
2. Parse into `<agent>` and `<owner>`
3. Look up tenant by agent DID
4. Render the owner app under that tenant's context
5. Cert: Vercel handles `*.arp.spec` via their auto-cert; for `.hns.to` proxying, instruct users to use the gateway URL only (we don't control `.hns.to`)

**Acceptance:** `https://ian.atlas.agent.hns.to` loads the Atlas owner UI.

### Task 10 — Observability

1. Structured logs via `pino` → Vercel log drains → Datadog or Axiom (pick one; default Axiom)
2. Metrics: per-tenant msg/sec, PDP decision latency p50/p95/p99, WebSocket uptime
3. Error tracking: Sentry
4. Alerts: PDP latency >200ms p95, WebSocket reconnect rate >5%, quota error rate >1%

**Acceptance:** dashboards visible for at least 3 test tenants running the testkit load.

### Task 11 — Cloud testkit integration

Extend `@kybernesis/arp-testkit` with a cloud-mode flag:
```
npx @kybernesis/arp-testkit audit atlas.agent --via cloud --tenant <tenant-id>
```

Runs the same probes but against the cloud-hosted tenant. Must return 8/8 green.

**Acceptance:** cloud-hosted Atlas passes the full audit.

---

## 5. Acceptance tests

```bash
pnpm install
pnpm -r build
pnpm --filter apps/cloud test
pnpm --filter tests/phase-7 test
npx @kybernesis/arp-testkit audit atlas.agent --via cloud
```

---

## 6. Deliverables

- `arp.cloud` Vercel project deployed + password-gated in staging
- `app.arp.spec` live
- `@kybernesis/arp-cloud-client` on npm
- Stripe integration live in test mode; production keys flipped at Phase 9 launch
- Observability dashboards + alerts

---

## 7. Handoff to Phase 8 / 9

- Phase 8 (Mobile) uses the cloud's REST/WS APIs as its backend
- Phase 9 (Launch) promotes cloud into production with live Stripe keys and removes the password gate

---

## 8. v0 decisions (do not reopen)

- Vercel Fluid Compute for hosting (no self-hosted Kubernetes in v0)
- Neon Postgres for multi-tenant state
- WebSocket for the outbound client (not SSE, not long-poll)
- Stripe for billing (no crypto billing in v0)
- English-only UI; i18n is post-launch
- No mobile-app-specific backend; shares the cloud backend
- Row-level tenant isolation enforced in middleware, not via Postgres RLS (simpler; revisit at v0.2)

---

## 9. Common pitfalls

- **WebSocket on Vercel:** confirm your deploy region supports WS at current Vercel limits before building the whole pipeline. Fall back to Cloudflare Durable Objects if blocked.
- **Tenant isolation bugs are catastrophic.** Every query without a tenant context should be impossible — enforce via TS types, not runtime checks alone.
- **Handoff bundles carry secrets.** Never log them. Store encrypted at rest in Postgres.
- **Stripe webhooks need idempotency.** Use the event ID as a dedup key; webhooks retry on failure.
- **HNS gateway traffic to `.hns.to` can be slow.** Cache aggressively via Vercel Runtime Cache API.
