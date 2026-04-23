# @kybernesis/arp-consent-ui

Deterministic Cedar policies + obligations → structured English for the ARP
owner app's consent screen. Given a pairing proposal (or Connection Token +
scope selections) and the loaded scope catalog, `renderConsentView` produces
the same `ConsentView` object every time.

```ts
const view = renderConsentView({
  issuer, subject, audience, purpose,
  scopeSelections, cedarPolicies, obligations,
  expires, requiredVcs, catalog,
});

// {
//   headline: "Ghost wants to connect with Samantha for Project Alpha.",
//   willBeAbleTo: [...],
//   willNotBeAbleTo: [...],
//   conditions: [...],
//   willProve: ["Verified human", "Over 18"],
//   expiresAt: "2026-10-22T00:00:00Z",
//   risk: "medium"
// }
```

The snapshot test suite covers every worked example in `ARP-policy-examples.md`
and every bundle in `ARP-scope-catalog-v1.md §6`. Any change to scope-catalog
copy, obligation wording, or bullet ordering must refresh the snapshots — that's
the point: a line-noise diff here is a signal to re-review consent copy with a
product owner.
