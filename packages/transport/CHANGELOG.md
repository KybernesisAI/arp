# @kybernesis/arp-transport

## 0.3.2

### Patch Changes

- Fix: `base64urlEncode` / `base64urlDecode` now use browser-native
  `btoa`/`atob` + URL-safe alphabet transformation instead of
  `Buffer.from(..., 'base64url')`. The Buffer-based implementation worked
  in Node but threw `Error: Unknown encoding: base64url` from the
  polyfilled `buffer` package in Next.js client bundles, breaking any
  browser caller that imported `@kybernesis/arp-transport/browser`. The
  new implementation works identically in Node 16+ and every modern
  browser. Surfaced when cloud.arp.run's recovery-phrase login flow tried
  to base64url-encode an Ed25519 signature in-browser.

## 0.3.1

### Patch Changes

- Updated dependencies
  - @kybernesis/arp-resolver@0.3.1

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
- Updated dependencies [6fcb874]
  - @kybernesis/arp-spec@0.2.0
  - @kybernesis/arp-resolver@0.3.0
