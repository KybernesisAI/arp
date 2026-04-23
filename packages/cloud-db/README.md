# @kybernesis/arp-cloud-db

Multi-tenant database layer for ARP Cloud (Phase 7). Postgres schema + tenant-branded query wrappers.

## Tenant isolation model

Every runtime table carries a `tenant_id`. Queries only compile when issued through `withTenant(db, tenantId)` which returns a `TenantDb` — the only type route handlers may hold. Bare `db.select().from(...)` is discouraged (reserved for bootstrap, Stripe webhook reconciliation, and admin audits).

The `TenantId` type is a TypeScript branded string; `toTenantId(raw)` is the one allowed cast site (session middleware).

## Drivers

- **Production / local Postgres** — use `pg` / `postgres.js` directly, wire into drizzle. Not yet shipped in this package; the cloud-gateway app instantiates a driver per its deployment target.
- **PGlite (WASM)** — used for tests and `pnpm dev` without docker. `createPgliteDb()` returns a ready-to-use `{ db, client, close }` triple with the 0001 migration already applied.

## Schema overview

- `tenants` — one row per principal DID. Plan + billing state.
- `agents` — one row per provisioned agent (did:web:...), links to tenant.
- `connections` — one row per active connection. `cedar_policies` JSONB.
- `messages` — inbound + outbound envelopes. `status IN (queued, delivered, expired, failed)`.
- `audit_entries` — hash-chained per (agent_did, connection_id).
- `revocations` — revoked connections/keys.
- `usage_counters` — per-tenant monthly metering.
- `stripe_events` — dedup log for webhook idempotency.
- `principal_sessions` — opaque session id → principal DID.

All indexes live in `migrations/0001_init.sql`; drizzle schema mirrors.

## Migrations

Single idempotent `migrations/0001_init.sql` file. Run on first boot (or before every deploy). Drizzle migrations are tracked only in dev — production uses the SQL file directly so nothing is driver-specific.
