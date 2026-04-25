# @kybernesis/arp-tls

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
