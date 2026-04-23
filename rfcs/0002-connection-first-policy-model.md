# RFC-0002: Connection-first policy model

- **Status:** accepted (retroactive)
- **Author(s):** @ianborders
- **Created:** 2026-02-10
- **Related:** `docs/ARP-architecture.md` §Policy, `docs/ARP-policy-examples.md`

## Summary

ARP policy is bound to the **connection** between two agents, not to
either agent in isolation. Consent tokens, obligations, and the Cedar
policy that gates every request are attached to a connection's `cid`.
This RFC formalises that decision and why it's the load-bearing
assumption behind every downstream design.

## Motivation

Two tempting alternative models existed early in design:

- **Agent-global policies.** "This agent can always do X, to anyone."
  Easy to reason about, but collapses under any realistic use case
  where you want different peers to have different capabilities (e.g.
  ghost.agent should be able to draft emails but not send them; your
  spouse's agent should be able to do both).
- **Per-principal policies.** "This user has granted this capability."
  Better, but still doesn't model the common case of "this capability
  is available only while this specific connection is active."
  Revocation becomes awkward — you revoke a capability, but if another
  connection depended on it, you break that flow.

The connection-first model treats each pairing as the unit of trust.
Scopes and obligations live inside the connection token; revoking the
connection revokes the policy cleanly, with no action-at-a-distance.

## Design

- **Every consent token references a `cid` (connection id).**
- **Cedar policies are scoped by connection.** The PDP evaluates
  `(principal, action, resource, context)` where `context.cid` is the
  connection under which the request arrived. A rule that does not
  match the current `cid` cannot fire.
- **Obligations merge from the connection token + the Cedar decision.**
  `effectiveObligations = [...token.obligations, ...decision.obligations]`
  in `@kybernesis/arp-runtime`. Both sources merge into the audit entry
  and the outbound reply.
- **Revocation publishes the `cid`** on the `/.well-known/arp/revocations.json`
  list. Peers poll. A revoked `cid` fails policy evaluation immediately.
- **Identity changes (key rotation, principal change) do NOT invalidate
  existing connections** as long as the new verification method is
  published in the DID document during the grace window. The connection
  survives the rotation.

## Alternatives considered

- **Agent-global.** Rejected, see motivation.
- **Per-principal.** Rejected, see motivation.
- **Per-message** (each message carries its own consent). Rejected for
  UX reasons — users can't consent to every message; they consent once
  per connection.

## Drawbacks

- Larger on-the-wire payloads. Every request carries a `cid` + the
  resolved policy's hash. Tradeoff: makes tampering visible.
- More complex PDP. Cedar must thread `context.cid` through every
  evaluation. We accept the complexity because it buys us clean
  revocation.

## Adoption path

Shipped in Phase 2 (Runtime Core). Retroactive formalisation via this
RFC before Phase 9 public launch.

## Unresolved questions

None — the design is shipped and under test in Phases 2–7.

## Security & privacy considerations

- **Trust boundary:** the `cid` identifies the policy scope. A leaked
  `cid` + a copy of the connection token's signing key lets an attacker
  replay messages. Mitigation: DIDComm envelopes are per-sender signed;
  `cid` leakage alone is not actionable.
- **Replay:** each envelope carries a monotonically-increasing `seq`
  within its connection. Mailboxes dedup on `(iss, seq)`.
- **Revocation latency:** counterparties SHOULD poll the revocations
  list at most every 60 seconds. Longer polling windows create a
  revocation-latency exposure.

## Testkit impact

Covered by existing probes `consent-token-verify` +
`revocation-list-consistency`. No new probes needed.
