# ARP RFC process

This directory holds ARP's "Request for Comments" documents — the public
record of substantive changes to the protocol, and the inbox for new
ideas from the community.

If you have a proposal that

- introduces a new well-known document, DNS record, or DID method,
- changes the shape or semantics of an existing one,
- adds or retires scopes in the catalog,
- revises how pairing, policy evaluation, or the audit chain work, or
- extends the testkit probes,

write an RFC. Anything less — typos, clarifications, non-breaking doc
improvements — goes through a regular PR against `docs/` or
`apps/spec-site/content/`.

## How to propose

1. **Fork and branch.** Base your branch on `main`. Name it
   `rfc-<short-slug>`.
2. **Copy the template.** `cp rfcs/0001-template.md rfcs/000N-<slug>.md`
   where `N` is the next unused number. Number collisions get resolved at
   merge time — don't block on it up front.
3. **Fill in every section.** Motivation, design, alternatives, adoption
   path, drawbacks. The template lists every heading we require.
4. **Open a PR** titled `rfc: <slug>`. Link to it from
   [GitHub Discussions](https://github.com/KybernesisAI/arp/discussions)
   for async review.

## Review timeline

- **Week 1.** Author answers clarifying questions. Reviewers flag
  blocking concerns.
- **Weeks 2–3.** Lazy consensus. If no blocking objections remain, the
  RFC enters "final comment period" (FCP).
- **FCP (7 days).** Last call. Either a blocker appears, or the RFC is
  accepted and merged.
- **After merge.** Implementation tracking happens in normal GitHub
  issues. Implementation lands behind a feature gate until all reference
  packages (`@kybernesis/arp-*`) have shipped support.

RFCs may be **withdrawn** by the author at any point before FCP, or
**rejected** by maintainer consensus with a short explanation on the PR.

## Breaking-change criteria

A change is **breaking** if any of the following are true:

- Existing on-the-wire payloads stop validating against the current
  JSON Schemas in `packages/spec/json-schema/*.json`.
- Existing agents cannot re-pair with counterparties running the newest
  version without user action.
- The testkit audit count drops for a previously-passing domain.
- A reserved DNS label or well-known URL changes or moves.

Breaking changes bump the **spec** major version (`v0.1 → v1.0`); they
land behind a preview flag (`spec_version: '1.0-draft'`) for at least
one minor release before the default flips.

Non-breaking additions are welcome — new scopes, new obligations, new
verification method types in DID documents — and can ship at any point
in the existing minor version.

## Templates + seed RFCs

- [`0001-template.md`](./0001-template.md) — the blank template. Copy
  this, don't fill it in directly.
- [`0002-connection-first-policy-model.md`](./0002-connection-first-policy-model.md)
  — why policy is bound to connections, not agents. Accepted
  retroactively.
- [`0003-did-pinned-tls-for-agent-endpoints.md`](./0003-did-pinned-tls-for-agent-endpoints.md)
  — why agent-to-agent TLS bypasses Web PKI. Accepted retroactively.
- [`0004-scope-catalog-versioning.md`](./0004-scope-catalog-versioning.md)
  — how the catalog evolves across releases. Accepted retroactively.

## Maintainers

This list is intentionally short; expansion happens via a governance RFC
after the first public launch.

- Ian Borders — [@ianborders](https://github.com/ianborders),
  Kybernesis.

## When in doubt

Open a discussion thread first. An RFC is real work on both sides; a
discussion can settle "is this worth an RFC" in an hour.
