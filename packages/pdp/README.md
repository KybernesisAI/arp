# `@kybernesis/arp-pdp`

Policy Decision Point. Thin wrapper around `@cedar-policy/cedar-wasm` that
adds ARP's `@obligation` annotation semantics.

## Use

```ts
import { createPdp } from '@kybernesis/arp-pdp';
import schemaJson from '@kybernesis/arp-spec/cedar-schema.json' with { type: 'json' };

const pdp = createPdp(JSON.stringify(schemaJson));

const decision = pdp.evaluate({
  cedarPolicies: [
    'permit (principal == Agent::"did:web:ghost.agent", action == Action::"read", resource in Project::"alpha");',
  ],
  obligationPolicies: [
    `@obligation("rate_limit")
     @obligation_params({ "max_requests_per_hour": 60 })
     permit (principal, action, resource in Project::"alpha");`,
  ],
  principal: { type: 'Agent', id: 'did:web:ghost.agent' },
  action: 'read',
  resource: {
    type: 'Document',
    id: 'alpha/q2',
    parents: [{ type: 'Project', id: 'alpha' }],
  },
  context: { /* time, spend, vcs, ... */ },
});
// → { decision: 'allow', obligations: [...], policies_fired: [...], reasons: [] }
```

## Decision semantics

Matches `ARP-policy-examples.md §10` exactly:

1. Deny by default.
2. Any matching `permit` flips to `allow`.
3. Any matching `forbid` flips back to `deny` (forbid wins over permit).
4. On `allow`, evaluate obligation policies. Each obligation policy that
   fires contributes `{ type, params }` to the obligation list.

`obligationPolicies` are *not* evaluated when the decision is `deny`.

## Obligation annotations

ARP extends Cedar with two annotations:

```cedar
@obligation("redact_fields")
@obligation_params({ "fields": ["client.name", "client.email"] })
permit (principal == Agent::"did:web:ghost.agent", action == Action::"read", resource in Project::"alpha");
```

`@obligation_params(...)` accepts:

- A JSON-object literal (with bare keys + single-quoted strings tolerated)
- A JSON string — `@obligation_params("{\"fields\":[...]}")`

Both forms are stripped before handing the policy to Cedar so the upstream
parser never sees the non-standard syntax.

## Context value conventions

Cedar's runtime type system is `long | boolean | string | set | record` — there
are **no native floats and no native timestamps**. The ARP PDP adapts the
`context.*` vocabulary from `docs/ARP-policy-examples.md` accordingly, and
every upstream consumer (scope-catalog compiler, adapters, owner-app consent
renderer, reference agents) MUST use the same representations:

| Vocabulary from the doc | On the wire (PDP input + policy body) |
|---|---|
| `quoted_price_usd`      | `quoted_price_cents` (integer) |
| `spend_last_24h_usd`    | `spend_last_24h_cents` (integer) |
| `spend_last_30d_usd`    | `spend_last_30d_cents` (integer) |
| `spend_all_time_usd`    | `spend_all_time_cents` (integer) |
| `time.now`              | `time.now_ms` (epoch milliseconds, integer) |
| `connection.expires_at` | `connection.expires_at_ms` (epoch milliseconds, integer) |
| `connection.created_at` | `connection.created_at_ms` (epoch milliseconds, integer) |

Money in cents prevents floating-point drift on cap comparisons; epoch
milliseconds give us ordered integer comparisons without parsing ISO strings
inside Cedar. The doc's narrative float/ISO syntax is illustrative, not
normative — Cedar policies compiled by the scope-catalog compiler already
follow this convention, and adapters that synthesise ad-hoc policies must
follow it too.

If Cedar later adds a decimal or timestamp type, we migrate by rewriting the
scope templates and updating this table; the rest of the stack is unchanged
because it only ever reads the integer fields.

## Design notes

- Each input policy gets an auto-assigned `@id("p_<n>")` / `@id("o_<n>")` if
  it doesn't already have one; `policies_fired` returns those IDs.
- `isAuthorized` is called without `enableRequestValidation` in v0. Phase 5
  can toggle strict schema enforcement once reference agents' contexts are
  stable.
- Cedar WASM must be imported per-call; the library memoises the engine
  internally, so repeated calls are cheap.
