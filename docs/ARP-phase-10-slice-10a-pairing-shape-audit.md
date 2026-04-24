# Phase 10 slice 10a — owner-app vs cloud pairing API shape audit

**Date:** 2026-04-25
**Purpose:** Slice 10a ships a cloud port of the pairing flow. The brief
(task 4.1) asks to audit the pairing HTTP surface vs the owner-app reference
implementation and fix any drift with the smaller blast radius.

## TL;DR

- **On-wire artefacts are identical.** Both the owner-app and cloud produce
  a `PairingProposal` per `@kybernesis/arp-pairing::PairingProposalSchema`
  and a `ConnectionToken` per `@kybernesis/arp-spec::ConnectionTokenSchema`.
  The packages are the single source of truth.
- **HTTP request shapes DIVERGE — by design.** The owner-app signs
  server-side (the user pastes a 32-byte hex private key into the pair form
  because the sidecar holds the key). The cloud signs in the browser (Phase
  8.5 invariant: the cloud never sees private keys). Those are different
  identity-holding models; the endpoint shapes can't be unified without
  breaking one of them.
- **URL carrier format also DIVERGES — by design.**
  - Owner-app → `{ARP_OWNER_APP_BASE_URL}/pair/accept?invitation=<b64url>`
    (uses `buildInvitationUrl` from `@kybernesis/arp-pairing` which appends
    a query param).
  - Cloud → `https://cloud.arp.run/pair/accept#<b64url>` (URL fragment,
    intentionally so the signed payload never hits server access logs).
- **No drift fix required for slice 10a.** Cross-install interop (cloud
  pairs with sidecar-hosted agent) is not a 10a requirement — slice 10b
  covers it indirectly via the audit/revoke surface, and slice 10e exercises
  real-world Samantha.agent pairing.

## Detail

### Request shape matrix

| Endpoint | Owner-app | Cloud |
|---|---|---|
| `POST /api/pairing/invitations` | `{ issuer, subject, audience, purpose, bundleId, expiresDays, requiredVcs, scopeCatalogVersion, ownerAppBaseUrl, issuerPrivateKeyHex }` — server builds + signs | `{ proposal: PairingProposal }` — client-signed, server stores |
| `GET  /api/pairing/invitations` | `{ invitations: PendingInvitation[] }` shape: `{ connection_id, invitation_url, created_at, proposal }` | `{ invitations: [{ id, issuerAgentDid, proposalId, expiresAt, createdAt }] }` |
| `DELETE /api/pairing/invitations/:id` | not implemented (owner-app forwards to runtime admin) | 200 idempotent cancel |
| `POST /api/pairing/accept` | `{ proposal, counterpartyDid, counterpartyPrivateKeyHex }` — server countersigns | `{ proposal: PairingProposal (dual-signed), acceptingAgentDid }` — client-countersigned |

### Output artefacts (the contract that matters)

Both sides persist + return:

- `PairingProposal` validated by `@kybernesis/arp-pairing::PairingProposalSchema`
- `ConnectionToken` projected via `@kybernesis/arp-pairing::countersignProposal`
  (owner-app: inside the route handler; cloud: inside the browser, server
  re-compiles cedar policies to catch tampering)
- audit-entry shape unchanged — phase-2 artefact, unchanged across phases

### Interop

Today's interop path:
- Cloud A pairs with Cloud B → fragment URL; both speak the fragment format.
- Sidecar A pairs with Sidecar B → query-param URL; both speak the
  query-param format.
- Cloud ↔ Sidecar pairing is deferred to slice 10e (real-world
  `samantha.agent` validation) where the ultimate test is: a browser-opened
  invitation (fragment) vs. a CLI-generated invitation (query-param). Both
  client pages can be updated at that time to accept BOTH carrier formats.
  Low-risk — `PairingProposal` itself is identical; only the extraction
  differs.

### Changes shipped in 10a

- `apps/owner-app/components/LogoutButton.tsx` + Header integration
  (covered by 10a task 3.2 — not a drift fix per se, but the minimum
  needed to land the "matches cloud treatment" parity).

### Conservative calls (flagged, not shipped)

1. **Carrier format unification.** Don't change owner-app to fragment
   (breaks existing Phase-4 QR-in-URL flow) or cloud to query-param
   (weakens the log-hygiene argument for fragments). Slice 10e revisits.
2. **Owner-app DELETE /pairing/invitations/:id.** Owner-app doesn't have
   one today. If slice 10b's audit/revoke work touches the owner-app,
   bundle it then.
3. **Cloud `GET /invitations` field names.** Cloud uses camelCase
   (`issuerAgentDid`); owner-app uses snake_case (`connection_id`). They're
   different APIs — no reason to align until a SHARED consumer needs both.

### Acceptance

Tick for slice 10a:

- [x] Both apps produce interoperable `PairingProposal` artefacts at the
      same schema version.
- [x] Both apps produce interoperable `ConnectionToken` artefacts.
- [x] Both apps have a logout button.
- [x] No regression to the owner-app's existing Phase-4 pairing flow.
- [x] Cloud's fragment-URL invariant holds (`pairing-invitations-route.test.ts`
      asserts the URL matches `/pair\/accept#[A-Za-z0-9_-]+$/`).

---

*Filed as part of Phase 10 slice 10a.*
