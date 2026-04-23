# @kybernesis/arp-selfxyz-bridge

Narrow adapter between ARP's pairing flow and Self.xyz's VC presentation API.

## What it does

- `createSelfxyzBridge({ baseUrl, appId })` returns a client whose
  `requestVcPresentation` hits Self.xyz staging (`https://staging.self.xyz` by
  default) and returns a QR payload + deep link for the Self.xyz mobile app.
- `verifyPresentation` validates the JSON Self.xyz POSTs back to our callback:
  structural shape, nonce match, per-VC attribute invariants.

## v0 scope

Five attributes are inspected by default — the ones the ARP scope catalog
references: `self_xyz.verified_human`, `self_xyz.over_18`, `self_xyz.over_21`,
`self_xyz.us_resident`, `self_xyz.country`. Any other VC type passes through
the verifier as an opaque entry.

## Testing

Unit tests use `createMockSelfxyzBridge` + `buildMockPresentation` to exercise
the happy path without hitting the network. Integration tests against the
staging environment need real credentials; they live outside this package
(see `tests/phase-4`) and read them from `apps/owner-app/.env.local` —
never committed.
