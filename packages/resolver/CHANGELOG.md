# @kybernesis/arp-resolver

## 0.3.1

### Patch Changes

- Fix: testkit + resolver DoH client now uses RFC 8484 binary wire format
  (`application/dns-message`) which is the only format public Handshake DoH
  endpoints (hnsdoh.com, easyhandshake.com) actually serve. The previous
  JSON-form (`application/dns-json`) implementation got HTTP 400 from those
  endpoints, leaving the testkit unable to probe `.agent` domains at all.

  Also wraps testkit's `fetchJson` / `postJson` helpers in try/catch so
  network-layer failures (DNS NXDOMAIN, ECONNREFUSED, TLS handshake) return
  a synthetic 0-status `FetchJsonResult` with `networkError: <message>`
  instead of throwing. Probes now report descriptive failures like
  "getaddrinfo ENOTFOUND samantha.agent" when an apex doesn't resolve,
  rather than crashing the whole audit.

  Adds `ProbeContext.dohClient` so tests can inject a stub DoH client
  without re-encoding binary wire format. The legacy JSON-form client is
  preserved as `createJsonDohClient` for callers that explicitly need it
  (e.g. Cloudflare/Google JSON DoH).

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

### Patch Changes

- Updated dependencies [152f06e]
  - @kybernesis/arp-spec@0.2.0
