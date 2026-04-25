# @kybernesis/arp-runtime

## 0.3.1

### Patch Changes

- Updated dependencies
  - @kybernesis/arp-resolver@0.3.1
  - @kybernesis/arp-transport@0.3.1

## 0.3.0

### Minor Changes

- 6fcb874: Phase 2 runtime core — seven new packages plus a reference agent binary.
  - `@kybernesis/arp-resolver`: HNS DoH + did:web resolver with an LRU cache.
    Defaults to `hnsdoh.com`; honours `ARP_HNSD_LOCAL=true` for local `hnsd`.
  - `@kybernesis/arp-tls`: self-signed Ed25519 X.509 generator + SHA-256 DID
    pinning. 10-year validity, `@peculiar/x509` under the hood.
  - `@kybernesis/arp-registry`: SQLite-backed store for Connection Tokens,
    rolling spend windows, and revocations. Schema frozen per Phase 2 §4.3.
  - `@kybernesis/arp-audit`: append-only JSON Lines with `sha256(JCS)`
    hash-chaining and a tamper-detecting verifier.
  - `@kybernesis/arp-pdp`: Cedar WASM wrapper plus ARP's `@obligation`
    annotation extension. Passes the 10 worked examples from the policy doc.
  - `@kybernesis/arp-transport`: the **only** ARP package permitted to depend
    on DIDComm wire-format libraries. Signed JWM envelopes + SQLite mailbox.
  - `@kybernesis/arp-runtime`: Hono server, PDP dispatch, per-connection
    memory partitioning, and revocation proxy.

  Published under the `next` tag; `latest` is reserved until Phase 9 launch.

- 91efe99: Phase 3 sidecar packaging adds a graceful-shutdown drain plus extended
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

### Patch Changes

- Updated dependencies [152f06e]
- Updated dependencies [6fcb874]
  - @kybernesis/arp-spec@0.2.0
  - @kybernesis/arp-templates@0.2.0
  - @kybernesis/arp-resolver@0.3.0
  - @kybernesis/arp-tls@0.3.0
  - @kybernesis/arp-registry@0.3.0
  - @kybernesis/arp-audit@0.3.0
  - @kybernesis/arp-pdp@0.3.0
  - @kybernesis/arp-transport@0.3.0
