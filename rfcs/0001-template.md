# RFC-NNNN: <short descriptive title>

- **Status:** draft
- **Author(s):** <github handle>
- **Created:** <YYYY-MM-DD>
- **Related:** <links to issues, discussions, prior RFCs>

## Summary

One paragraph. If a reviewer only reads this paragraph, they know what
you're asking for.

## Motivation

Why does this change need to happen? What problem is currently unsolved
or unsolvable? Who is affected?

Use concrete examples. Link to discussions, issue reports, or
real-world observations that made the problem visible.

## Design

The full proposal. Cover:

- **On-the-wire changes.** New fields, new records, renamed keys.
  Include JSON / YAML examples next to the existing shape.
- **Runtime behaviour.** What changes about pairing, policy evaluation,
  transport, audit, or the testkit.
- **API surface.** New SDK / adapter / CLI surface. Include a TypeScript
  or Python signature.
- **Migration.** If existing agents have to do anything, describe
  exactly what.

Call out invariants this design preserves. Call out invariants it
breaks (if any).

## Alternatives considered

The proposals you evaluated and rejected. Brief one-paragraph
treatments, with the reason the final design was preferred.

## Drawbacks

What does this add to the maintenance surface? What becomes harder for
implementers? What edge cases aren't well-served?

Be honest. A good RFC acknowledges its own costs.

## Adoption path

Stepwise plan for rollout:

1. Ship behind a preview flag.
2. Reference implementation lands in `@kybernesis/arp-*`.
3. Compliance testkit gains a probe.
4. Default flips after N minor releases or on the next major.

Call out which phase / release shoulders each step.

## Unresolved questions

Anything the author knows they haven't answered. Questions welcome.

## Security & privacy considerations

- New trust assumptions?
- New attack surface?
- New PII paths?
- Replay / denial-of-service exposure?

Answer each even if the answer is "none" — reviewers look for
omissions, not just problems.

## Testkit impact

How does `@kybernesis/arp-testkit` change? New probes? Existing probe
assertions tightened or relaxed?

---

*Once this RFC is accepted, rename status to "accepted" and remove
anything under "Unresolved questions". Keep the historical structure —
future readers trace why decisions were made from the original draft.*
