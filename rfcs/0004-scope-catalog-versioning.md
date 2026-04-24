# RFC-0004: Scope catalog versioning

- **Status:** accepted (retroactive)
- **Author(s):** @ianborders
- **Created:** 2026-03-05
- **Related:** `docs/ARP-scope-catalog-v1.md`, `packages/scope-catalog/`

## Summary

The scope catalog evolves across releases. This RFC pins down how
scopes are added, deprecated, and retired, how bundles reference a
specific catalog version, and how compliance-testing handles
version-drift between agents.

## Motivation

The catalog is the vocabulary agents use to ask each other for
capabilities. Two agents need to be speaking the same vocabulary
version to understand each other's consent screens + Cedar bundles. At
the same time, the catalog is living — we expect to add scopes, rarely
retire them, and clarify descriptions or obligations.

Without a versioning policy, two risks:

- **Silent drift.** A scope's `consent_text_template` changes under a
  user, who then sees different consent text than they approved.
- **Lock-in.** A hastily-added scope that turns out wrong is hard to
  remove without breaking every bundle that referenced it.

## Design

### Catalog version

- The catalog is a single atom: `scope-catalog v<N>`.
- Agents MUST publish the catalog version they support in their
  agent-card's `catalog_version` field.
- Bundles MUST reference the catalog version their scopes were picked
  from via `bundle.catalog_version`.

### Scope version

- Each scope carries its own `version` in the YAML source
  (`calendar.events.create` → `version: 1.0.0`).
- Scope versions follow semver.
- The catalog's top-level version is bumped when any scope undergoes a
  breaking change; patch / minor changes to a scope don't move the
  catalog.

### Breaking change criteria (per scope)

A change is breaking if:

- The scope's `parameters` gain a required field or remove one.
- The `cedar_template` changes in a way that denies previously-permitted
  requests.
- The `obligations_forced` array changes semantics.

Non-breaking changes:

- New optional parameters with sensible defaults.
- `description`, `label`, `consent_text_template` clarifications.
- New `implies` / `conflicts_with` entries that reflect existing
  semantics more accurately.

### Deprecation

- A scope marked deprecated in the catalog YAML gains a `deprecated:
  true` flag and a `deprecation_message` pointing readers to the
  replacement (if any).
- Deprecated scopes continue to work. They're removed from the catalog
  only in a catalog major bump.

### Retirement

- Retirement bumps the catalog major version (`v1` → `v2`).
- Bundles referencing the retired scope become invalid in the new major.
- The compliance testkit probe `scope-retirement-compat` checks that
  an agent publishing `catalog_version: v2` does not advertise any
  scopes retired in v2.

### Version skew handling

- Two agents on different catalog versions can still pair **if** their
  intersection of supported scopes is non-empty.
- Out-of-intersection scope requests return a typed `scope_unsupported`
  error with the counterparty's published catalog version.

## Alternatives considered

- **Per-scope independent versioning with no catalog version.**
  Rejected: makes compat matrix unbounded (2^50 possible catalog
  shapes), forces every compliance check to enumerate the full scope
  set.
- **Semver on the catalog only, no per-scope version.** Rejected:
  loses visibility into which specific scope changed.

## Drawbacks

- Two dimensions of versioning (catalog + scope) add cognitive load.
- Bundle authors must track both when shipping.
- Deprecation windows can linger (we prefer that — abrupt removal is
  worse).

## Adoption path

Shipped in Phase 1 (Shared Contract) alongside the initial catalog.
Retroactive formalisation before Phase 9 public launch.

## Unresolved questions

- **Cross-organisation scopes.** If a third party publishes a scope
  catalog (e.g. a payments-focused extension), how do we reference it?
  Deferred — likely a future `catalog_uri` + signed manifest pattern.

## Security & privacy considerations

- **Compatibility shim attacks:** a malicious peer could claim to
  support a wider catalog than it does, then refuse requests after
  pairing. Mitigation: `scope-retirement-compat` + `agent-card-verify`
  probes flag advertised-but-unsupported scopes.
- **Scope semantics drift:** the obligations-force list changing under
  a user is the main risk. Mitigation: bundles pin scope versions
  explicitly; consent screens display the scope version alongside the
  label.

## Testkit impact

- New probe: `catalog-version-published` — asserts agent-card
  advertises a `catalog_version` and it matches the bundle's
  `catalog_version`.
- Existing probes remain.
