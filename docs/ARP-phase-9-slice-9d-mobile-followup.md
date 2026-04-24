# Phase 9 slice 9d — `arp-mobile` follow-up

**Target repo:** `github.com/KybernesisAI/arp-mobile` (private)
**Context:** this doc. Plus `rfcs/0005-principal-key-derivation-v2.md` + `docs/ARP-phase-9-launch.md` §Task 10 + §Task 11.
**Reader:** a future Claude Code session opened against `arp-mobile`.

Phase 9d of the main repo shipped two user-facing changes that the mobile
repo must mirror before Phase 10 (mobile public launch):

## 1. HKDF-SHA256 seed derivation (v2)

The Expo app today derives the principal Ed25519 seed from the BIP-39
12-word phrase by doubling the 16-byte entropy to 32 bytes (Phase 8.5
`createFromEntropyV1`). This is the same pre-v2 construction that the web
app used; it is replaced in the main repo by:

```ts
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';

const seed = hkdf(
  sha256,
  entropy,                                 // 16 bytes
  new TextEncoder().encode('arp-v2'),      // salt
  new TextEncoder().encode('principal-key'), // info
  32,
);
```

### What to do

1. Add `@noble/hashes` dependency (already a transitive via `@noble/ed25519`).
2. Add a v2 derivation path alongside the existing v1 path. Store the v2
   key in a NEW Keychain/Keystore slot (`arp.principalKey.v2`) — do not
   overwrite the v1 slot. The v1 slot stays read-only so audit-log
   signatures issued by the old key still verify.
3. For NEW installs (clean first-boot, no v1 key present), default to v2.
4. For existing installs, DO NOT silently rotate. Add a dashboard banner
   with a "Rotate identity" CTA that:
   - Derives v2 from the stored v1 phrase.
   - Signs `arp-rotate-v1:{oldDid}:{newDid}:{issuedAtMs}` with both keys.
   - POSTs to `cloud.arp.run/api/tenants/rotate` with:
     ```json
     {
       "oldPrincipalDid": "<v1-did>",
       "newPrincipalDid": "<v2-did>",
       "newPublicKeyMultibase": "<v2-multibase>",
       "signatureOld": "<base64url>",
       "signatureNew": "<base64url>",
       "issuedAt": 1745500000000
     }
     ```
   - On 200, promotes v2 to the active key; on any other response, keeps
     v1 active and surfaces the error.

### What NOT to do

- Do not remove the v1 key material. Users with pre-rotation audit
  entries still need to verify those signatures.
- Do not rotate at sign-in time without user confirmation. The server
  allows idempotent replays, but the UX must be opt-in.

## 2. WebAuthn / passkey — explicitly deferred

Mobile biometric auth (Touch ID / Face ID via `expo-local-authentication`)
already gates sensitive actions in the Phase-8 scaffold. Platform-level
WebAuthn ceremonies on iOS / Android require `expo-secure-store` +
`react-native-passkey` (or similar) and platform-specific entitlements;
that work is deferred beyond 9d.

If the `arp-mobile` team decides to ship passkeys before Phase 10:

- The cloud-side API surface is already live. Routes:
  - `POST /api/webauthn/register/options` (session-authed)
  - `POST /api/webauthn/register/verify` (session-authed)
  - `POST /api/webauthn/auth/options` (unauthed)
  - `POST /api/webauthn/auth/verify` (unauthed)
- The `tenants.principal_did` identity model is unchanged — passkeys are
  strictly an authenticator, not a DID method.

## 3. DID-pinned TLS bridge — still deferred

No change from the Phase 8 conservative call #2. Slice 9d does not move
the goalposts. Phase 9e or later.

## 4. When to land this

Before Phase 10 submission to App Store / Play Store. Mobile v1.0 should
ship on the v2 derivation so new store users never see v1.
