# @kybernesis/arp-testkit

## 0.2.3

### Patch Changes

- Fix: `representation-jwt-signer-binding` probe now resolves the JWT URL
  from the `_principal.<owner>.<apex>` TXT's `rep=` field instead of
  hardcoding `https://<owner>.<apex>/.well-known/representation.jwt`.
  Aligns with v2.1 §3.4 which clarifies that registrars can host the JWT
  at any HTTPS URL they control (centralized-registrar pattern, path on
  apex, or owner subdomain). The probe follows whatever the TXT
  advertises.

  Adds `dohClient?` injection point on the probe context (matching the
  dns + principal-identity-method probes) so tests stub TXT resolution
  at the client level instead of fetch level.

  Caught while running the live testkit against samantha.agent post-
  Headless integration — Headless's CNAME-to-Railway hosting can't serve
  per-subdomain TLS for HNS subdomains, so the spec is relaxed to allow
  the registrar's existing apex hosting to serve the JWT instead.

## 0.2.2

### Patch Changes

- Updated dependencies
  - @kybernesis/arp-transport@0.3.2
  - @kybernesis/arp-pairing@0.1.3

## 0.2.1

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

- Updated dependencies
  - @kybernesis/arp-resolver@0.3.1
  - @kybernesis/arp-pairing@0.1.2
  - @kybernesis/arp-transport@0.3.1

## 0.2.0

### Minor Changes

- a7e6a20: Phase 5 Part A — testkit + reference agents.
  - New `@kybernesis/arp-testkit` package. 8 probes (`dns`, `well-known`,
    `did-resolution`, `tls-fingerprint`, `didcomm-probe`, `pairing-probe`,
    `revocation`, `cross-connection`) plus a CLI (`arp-testkit audit / probe /
compare`) and programmatic API. JSON + human reporters.
  - Reference-agent scaffolding (`apps/samantha-reference`,
    `apps/ghost-reference`): dispatch handler, per-connection fixtures,
    Dockerfile.compose, fly.toml, test-handoff generator. Not deployed in
    Phase 5 — scope is local validation only; Phase 5B provisions domains.
  - Phase-5 acceptance tests (`tests/phase-5`): bundle coverage (5 bundles),
    cross-connection isolation (10 categories × 100 runs, zero leaks),
    revocation races (100 runs, audit + registry agree).
  - Nightly compliance workflow scaffolded
    (`.github/workflows/testkit-nightly.yml`) — exits cleanly with a `no
targets configured` notice until `TESTKIT_TARGET_DOMAINS` is populated.
  - Demo scripts in `demos/`.

### Patch Changes

- Updated dependencies [152f06e]
- Updated dependencies [6fcb874]
  - @kybernesis/arp-spec@0.2.0
  - @kybernesis/arp-templates@0.2.0
  - @kybernesis/arp-scope-catalog@0.2.0
  - @kybernesis/arp-resolver@0.3.0
  - @kybernesis/arp-tls@0.3.0
  - @kybernesis/arp-transport@0.3.0
  - @kybernesis/arp-pairing@0.1.1
