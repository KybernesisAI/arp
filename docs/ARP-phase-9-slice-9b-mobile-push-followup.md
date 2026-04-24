# Phase 9b — mobile push-register follow-up (docs-only handoff)

**Reader:** a future Claude Code session opened against `github.com/KybernesisAI/arp-mobile`.

**Status:** follow-up to ARP monorepo slice 9b (cloud.arp.run side) merged 2026-04-24.

**Scope:** docs-only note from the monorepo side. The actual code edit happens in a separate `arp-mobile` session — do not attempt it from this repo.

---

## What shipped on the cloud side

`POST /api/push/register` now exists on `cloud.arp.run`. Route code is in
`apps/cloud/app/api/push/register/route.ts`.

Request:

```
POST https://cloud.arp.run/api/push/register
  Cookie: arp_cloud_session=<session cookie>
  Content-Type: application/json
  Body: {
    "device_token": "<APNs or FCM token>",
    "platform": "ios" | "android",
    "bundle_id": "com.arp.owner"
  }

Response (200):
  { "ok": true, "registration_id": "<uuid>" }
```

Auth: session cookie from the user's existing sign-in flow (same auth used by
every other `/api/*` route on the cloud). Tenant-scoped via `TenantDb`.
Idempotent on `(tenant_id, device_token)` — re-registration from the same
device updates `platform` + `bundle_id` + `updated_at`.

## What to change in `arp-mobile`

`arp-mobile/lib/push/register.ts` (scaffolded in Phase 8) currently POSTs to
this endpoint, catches the 404 from the not-yet-existent route, and logs a
warning. Slice 9b closed that conservative call — the route now returns 200
on valid input.

### Minimal edit

1. Remove the `404 → warn` branch.
2. Treat a 200 response as success. Persist `registration_id` locally so
   Maestro E2E flows can assert on it.
3. Treat 401 as "user not signed in" — trigger the standard sign-in redirect,
   do not re-warn.
4. Keep the retry-with-backoff on 5xx (same pattern as every other cloud POST).

### What not to do

- **Don't** mint a new session cookie path. The cloud uses the same
  `arp_cloud_session` cookie that every other mobile → cloud call uses.
- **Don't** add a migration step for device tokens registered during the
  conservative-call window. Those registrations never made it to the
  database (the route 404'd) — there is nothing to migrate.
- **Don't** bump the mobile app's minimum cloud API version. This route
  is additive from the cloud's perspective.

### Verification

- Run the existing jest suite in the mobile repo after removing the 404
  branch — the fetch mock should respond 200 + a registration_id.
- The Maestro "push-on-boot" flow should no longer surface the "unregistered
  (404)" toast.

## Not in scope for this follow-up

- Dispatching push notifications from the cloud to registered devices. That's
  a later slice (9c or after).
- Changing the request body shape. The mobile scaffold already matches the
  server's expected keys.
- Rotating push tokens after FCM/APNs regenerates them — handled by the
  upsert on `(tenant_id, device_token)` already.

---

*Phase 9 slice 9b cloud-side merge — 2026-04-24.*
