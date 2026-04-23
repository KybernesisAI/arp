# @kybernesis/arp-cloud-runtime

Multi-tenant engine shared by apps/cloud (Next.js UI + REST API) and apps/cloud-gateway (Hono + ws gateway).

## What it provides

| Module | Exports | Purpose |
|---|---|---|
| `dispatch.ts` | `dispatchInbound`, `drainQueue`, `currentUsagePeriod` | Verify envelope → PDP → audit → enqueue or WS-push |
| `audit.ts` | `createPostgresAudit` | Hash-chained audit per (agent, connection), Postgres-backed |
| `sessions.ts` | `createSessionRegistry` | In-process map of active WS sessions |
| `ws-server.ts` | `createCloudWsServer`, `signBearerToken` | WS upgrade handler, attachable to any http.Server |
| `http.ts` | `createGatewayApp`, `agentDidFromHost` | Hono app for `/didcomm` + `/.well-known/*` |
| `logger.ts` | `createLogger`, `createSilentLogger` | pino wrapped behind `CloudRuntimeLogger` |
| `metrics.ts` | `createInMemoryMetrics`, `createLogBasedMetrics` | `TenantMetrics` implementations |

## Observability surface (Phase-7 Task 10)

- **Structured logs.** `createLogger()` returns a pino logger that emits JSON to stdout. Vercel + most hosts pipe stdout directly into log drains. For Axiom specifically, set `AXIOM_INGEST_URL` and wrap pino with `@axiomhq/pino` at the binary's entry point — cloud-gateway's `bin.ts` is the right place.
- **Metrics.** The `TenantMetrics` interface records `inbound`, `outbound`, `pdpLatency`, and named counters. `createInMemoryMetrics()` stores in-process for tests + dashboards; `createLogBasedMetrics(logger)` emits each sample as a structured log event (`metric: "arp.pdp_latency_ms"`, `tenantId`, `ms`), ready for log-based metrics in Axiom/Datadog.
- **Error tracking.** Sentry isn't bundled to keep the package lean. Wrap the return of `createLogger` at the binary entry point with your Sentry SDK's breadcrumb/transport integration if needed — the logger's `.error()` channel is where all runtime errors land.
- **PDP latency.** Every `dispatchInbound` call records the PDP eval time via `metrics.pdpLatency(tenantId, ms)`. Configure your alert on the 95th percentile of `arp.pdp_latency_ms` — the phase brief's SLO is 200ms p95.

## Host routing

`agentDidFromHost()` parses a Host / X-Forwarded-Host header and returns the right `did:web:...` or null:

- `samantha.agent` → `did:web:samantha.agent`
- `ian.samantha.agent` → `did:web:samantha.agent` (owner subdomain)
- `ian.samantha.agent.hns.to` → `did:web:samantha.agent` (HNS gateway)
- `example.com`, `localhost`, or anything that doesn't terminate with `.agent` → `null`

## Tenant isolation

Every route handler wraps DB access through `withTenant(db, toTenantId(ctx.tenantId))`. The only call sites that see the raw client are:

1. Initial resolution from the HTTP Host header (to find `tenant_id` given the agent DID) — a single SELECT against `agents`.
2. Bearer-token verification on WS upgrade — same one-row SELECT.
3. Stripe webhook reconciliation (handled by apps/cloud).

All other queries are `TenantDb`-scoped. The adversarial test in `tests/phase-7/multi-tenant-isolation.test.ts` provisions 5 tenants and verifies zero leaks.
