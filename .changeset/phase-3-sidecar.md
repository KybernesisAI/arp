---
'@kybernesis/arp-runtime': minor
---

Phase 3 sidecar packaging adds a graceful-shutdown drain plus extended
`/health` payload to the runtime:

- New `Runtime.stop({ graceMs })` signature. Flips a `draining` flag so the
  HTTP middleware returns `503 { error: "draining" }` for non-`/health`
  routes, waits for a 50 ms quiet period (or `graceMs`, default 5000) for
  in-flight requests to finish, then closes the server and transport.
- New read-only `isDraining()` and `inFlightCount()` accessors.
- `/health` now returns `cert_fingerprint`, `connections_count`, `audit_seq`,
  and `draining` alongside the existing fields. Health is always served —
  load balancers keep seeing a 200 during the drain window.

No breaking changes: the old no-arg `stop()` still works; `/health` just
carries additional keys.
