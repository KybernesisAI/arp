# @kybernesis/arp-testkit

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
