# Phase 9 slice 9e — arp-mobile follow-up (docs-only in monorepo)

**Reader:** the future Claude Code session that opens the `arp-mobile`
repo to swap the Phase-8 conservative calls for real deps. This doc is
the handoff; no code changes in this monorepo.

**Context:** `arp-mobile` lives at
`github.com/KybernesisAI/arp-mobile`. Slice 9e does NOT touch that
repo. The items below are staged for a later mobile-dedicated session.

---

## Pre-flight checks (before opening the mobile repo)

1. Confirm `@kybernesis/arp-*` packages are at `1.0.0` on `latest` tag:
   ```sh
   npm view @kybernesis/arp-sdk
   npm view @kybernesis/arp-scope-catalog
   npm view @kybernesis/arp-transport
   npm view @kybernesis/arp-pdp
   ```
   If they're still on `next` (pre-publish): stop. The real-dep swap
   only makes sense once the packages are actually published. See
   `docs/launch/checklist.md §3.1`.

2. Confirm the cloud `/api/push/register` endpoint is live:
   ```sh
   curl -I https://cloud.arp.run/api/push/register
   # Expect 401 (session-required), NOT 404.
   ```
   This landed in Phase 9 slice 9b. The mobile code currently tolerates
   a 404; once live, the mobile client should treat any non-200 as an
   error.

---

## Task A — Replace `arp-mobile/lib/arp/scope-risk.ts` with real dep

**Current state:** The file is a portable projection of the `risk`
column from `@kybernesis/arp-scope-catalog`. Inlined at Phase 8 scaffold
time because the scope-catalog package wasn't yet published.

**Action:**

1. `pnpm add @kybernesis/arp-scope-catalog@1.0.0` in the `arp-mobile`
   repo.
2. Delete `arp-mobile/lib/arp/scope-risk.ts`.
3. Replace the import with:
   ```ts
   import { getScopeRisk } from '@kybernesis/arp-scope-catalog';
   ```
4. Re-run the mobile jest suite; the biometric-gate tests must still
   pass. The gate threshold (`high` / `critical`) was computed from the
   same source YAML; behavior should be identical.

**Acceptance:** `grep -rn 'scope-risk' arp-mobile/lib` returns empty.

---

## Task B — Replace inlined canonicalize + API helpers with `@kybernesis/arp-sdk`

**Current state:** `arp-mobile/lib/arp/canonicalize.ts` and
`arp-mobile/lib/arp/api.ts` are portable projections of helpers from
`@kybernesis/arp-sdk`. Same Phase-8 rationale — the SDK wasn't published
yet.

**Action:**

1. `pnpm add @kybernesis/arp-sdk@1.0.0` in `arp-mobile`.
2. Delete the two portable files.
3. Replace imports:
   ```ts
   import { canonicalize, post } from '@kybernesis/arp-sdk';
   ```
4. The SDK's JCS implementation is byte-for-byte compatible with the
   portable copy (both use `canonicalize@2.0`); signatures produced by
   the mobile client continue to verify on the cloud side.

**Acceptance:** `grep -rn 'lib/arp/canonicalize\|lib/arp/api' arp-mobile`
returns empty.

---

## Task C — Passkey / biometric on top of DID-pinned flow

**Current state:** `arp-mobile` authenticates via the browser-held
`did:key` scheme (private key stored in Secure Enclave / Android
Keystore). Slice 9d added WebAuthn passkeys to the web apps at
`cloud.arp.run` + `app.arp.run`, but the mobile side still uses native
bindings.

**Decision to make in the mobile session:**

1. **Bridge to WebAuthn via `expo-passkeys`.** The expo-passkeys
   community module wraps the platform WebAuthn APIs. Cost: a new
   native dep + prebuild regeneration for iOS + Android. Benefit:
   passkey credentials registered from web carry over to mobile and
   vice versa.

2. **Keep native biometric + keystore.** Don't touch WebAuthn; mobile
   stays at the Phase-8 bar. Cost: web + mobile are separate
   authenticator pools (a passkey registered on cloud.arp.run won't
   sign in on mobile). Benefit: no new native deps; bundle stays lean.

Recommendation: **(2) keep native for v1.** Option (1) is a meaningful
bundle + test-surface addition for a user-benefit that the current
audience (developers kicking the tires) is unlikely to notice. Promote
to option (1) when non-technical users are the primary audience, which
post-Phase-10 data will tell us.

**Cross-reference:** the `@simplewebauthn/browser` pattern used on web
is NOT directly portable — mobile needs `expo-passkeys` or a native
module. See `apps/cloud/lib/principal-key-passkey.ts` for the shape of
the client-side API; the server-side `/api/webauthn/*` endpoints are
passkey-protocol agnostic (they accept any WebAuthn `RegistrationResponseJSON`
/ `AuthenticationResponseJSON` regardless of authenticator source).

**Action (if promoting to option 1):**

1. `pnpm add expo-passkeys` (or the current community package).
2. Expo prebuild: `pnpm expo prebuild --platform ios,android`.
3. Add a screen at `arp-mobile/app/settings/passkeys.tsx` mirroring the
   web /dashboard/settings passkey list.
4. Reuse the server endpoints — no cloud-side changes needed.

---

## Task D — Stop logging the 404 warning in push register

**Current state:** `arp-mobile/lib/push/register.ts` tolerates a 404 on
`POST /api/push/register` with a console warning. That endpoint shipped
in slice 9b; the 404 case no longer occurs against production.

**Action:**

1. Remove the 404-specific branch; treat any non-2xx response as an
   error (log + retry with backoff).
2. On success, store the registration in local state + surface
   status in the settings screen if one exists.

**Acceptance:** `grep -rn 'push register endpoint is 404\|/api/push/register.*404' arp-mobile/lib`
returns empty.

---

## Task E — DID-pinned TLS bridge (Phase 8 conservative call #2)

**Scope:** this is larger than Tasks A-D and was separately carved out
as Task 13 in the Phase 9 brief. It needs a native module that exposes
the server TLS cert fingerprint to JS at connection time. Not blocking
launch — the ARP network works over regular TLS; DID-pinning hardens
against a compromised CA but isn't load-bearing for v1 users.

**Action (when picked up):**

1. Choose the native bridge: iOS `URLSession` delegate + Android
   OkHttp `CertificatePinner` + Expo config plugin. Or a pre-existing
   community wrapper.
2. JS side: compare fingerprint to the resolved DID document's
   `serviceEndpoint.tlsFingerprint` field.
3. Fail closed on mismatch; surface to UI via the connection-status
   row on the agent screen.
4. Test vectors: confirm that swapping the remote cert during
   handshake triggers rejection.

---

## Sanity checklist (before merging any of the above in `arp-mobile`)

- [ ] `@kybernesis/arp-*` deps all resolve to `1.0.0` on `latest`
- [ ] `pnpm typecheck` green
- [ ] `pnpm test` green (jest 18/18 or higher after new assertions)
- [ ] `expo prebuild` succeeds for both platforms after any native addition
- [ ] Login + pair + message round-trip still works against
      `cloud.arp.run` production

---

## Out of scope for this handoff

- App Store / Play Store submissions — those are Phase 10.
- Storing principal keys in iCloud / Google backup — privacy + recovery
  trade-offs not yet decided; leave keys in Secure Enclave / Keystore
  only.
- Multi-principal support — v0.2 RFC territory.

---

*Produced in Phase 9 slice 9e as a handoff; no code changes in the arp
monorepo for this doc.*
