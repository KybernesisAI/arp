# RFC-0005: Principal key derivation v2

- **Status:** accepted
- **Author(s):** @kybernesisai (coordinating) / @ianborders
- **Created:** 2026-04-24
- **Related:**
  - `docs/ARP-phase-8-5-auth-identity-shift.md` (v1 derivation introduced)
  - `docs/ARP-phase-9-launch.md` §Task 11 (migration spec)
  - `docs/ARP-tld-integration-spec-v2.1.md` (owner-binding flow)

## Summary

ARP's browser-held principal key (introduced in Phase 8.5) is derived from a
12-word BIP-39 recovery phrase. The v1 derivation doubled the 16-byte BIP-39
entropy to form a 32-byte Ed25519 seed. Phase 8.5 explicitly flagged this as
an interim choice: the construction is not a KDF, it offers no domain
separation, and it exposes the entire Ed25519 private key to anyone who
recovers the raw 128-bit entropy. This RFC replaces v1 with **HKDF-SHA256**
keyed by the BIP-39 entropy, and specifies a user-initiated rotation path
with a 90-day grace window for historical audit-log verification.

## Motivation

The v1 derivation has three concrete problems:

1. **No cryptographic strength beyond the entropy.** "Double the entropy to
   32 bytes" is not a key-derivation function. Any future derivation (V3 for
   a deterministic secondary keypair, for example) derived from the same
   phrase would trivially collide with v1 unless new domain-separation
   machinery is bolted on after the fact.
2. **No rotation story.** A user who wants a fresh DID today has no
   supported path — the recovery phrase pins the DID. If we need to rotate
   (incident response, passkey migration, algorithm upgrade), we need to
   design the rotation flow anyway. Better to ship it with the KDF upgrade.
3. **It was promised.** Phase 8.5 §Conservative call #3 committed Phase 9 to
   "swap in HKDF-SHA256 without breaking existing accounts" — this RFC
   discharges that commitment.

The v1 → v2 rotation is **user-initiated and opt-in**. A forced silent
rotation would break every v1 user's audit-log signatures. Historical audit
entries signed by the old key must continue to verify.

## Design

### Derivation (client-side)

```ts
// v2 (Phase 9d+)
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';

const seed = hkdf(
  sha256,
  entropy,                              // 16 bytes (BIP-39 128-bit entropy)
  new TextEncoder().encode('arp-v2'),   // salt
  new TextEncoder().encode('principal-key'), // info
  32,                                   // output bytes = Ed25519 seed
);
```

Parameters chosen:

- **Hash:** SHA-256. Sufficient for a 32-byte output; compatible with every
  platform ARP targets.
- **Salt = `"arp-v2"`.** Domain-separation from any v1 / v3 derivation.
- **Info = `"principal-key"`.** Allows a future `"signing-key-1"`,
  `"encryption-key-1"`, etc. to coexist from the same entropy.
- **Output = 32 bytes.** Ed25519's standard seed size.

The Ed25519 public key is computed from the seed exactly as in v1; the
did:key encoding (multibase of the raw 32-byte pubkey with the 0xED 0x01
multicodec prefix) is unchanged.

### Storage (browser)

Two parallel localStorage slots:

| Key | Purpose |
|---|---|
| `arp.cloud.principalKey.v1` (+ `.phrase`) | Pre-9d accounts. Read-only after rotation. |
| `arp.cloud.principalKey.v2` (+ `.phrase`) | Post-9d accounts + rotated tenants. |

Client lookup order: v2 → v1 → mint v2. Existing v1 users do not
auto-upgrade; only `rotateToV2()` moves the active key.

### Rotation flow

The tenants table grows two columns:

```sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS principal_did_previous TEXT,
  ADD COLUMN IF NOT EXISTS v1_deprecated_at TIMESTAMPTZ;
```

Rotation is a two-signature round-trip:

1. **Client derives v2** from the existing v1 phrase (`rotateToV2()` in
   `lib/principal-key-browser.ts`).
2. **Client computes canonical challenge:**
   `arp-rotate-v1:{oldDid}:{newDid}:{issuedAtMs}`.
3. **Client signs the challenge twice** — once with the v1 private key,
   once with the v2 private key.
4. **Client POSTs** to `/api/tenants/rotate`:
   ```json
   {
     "oldPrincipalDid": "did:key:z6Mk...v1",
     "newPrincipalDid": "did:key:z6Mk...v2",
     "newPublicKeyMultibase": "z6Mk...v2",
     "signatureOld": "<base64url>",
     "signatureNew": "<base64url>",
     "issuedAt": 1745510000000
   }
   ```
5. **Server verifies:**
   - Session principal DID == `oldPrincipalDid`.
   - Supplied pubkey multibase decodes to the bytes encoded in
     `newPrincipalDid` (no free-rider spoof).
   - Timestamp within ±5 minutes of server time.
   - Both signatures verify against the canonical challenge using each
     key's own Ed25519 public key.
6. **Server commits:**
   - `principal_did = newDid`
   - `principal_did_previous = oldDid`
   - `v1_deprecated_at = now()`
7. **Server re-issues session cookie** bound to the new DID.

If the unique constraint on `tenants.principal_did` fires (another
tenant is already bound to `newDid`), the server returns 409 without
mutation.

### Grace window at the DID document

`GET /u/<uuid>/did.json` publishes BOTH verification methods while
`v1_deprecated_at + 90 days > now()`:

```json
{
  "verificationMethod": [
    { "id": "#key-1", "publicKeyMultibase": "<v2>", ... },
    { "id": "#key-0", "publicKeyMultibase": "<v1>", ... }
  ],
  "authentication":    ["#key-1", "#key-0"],
  "assertionMethod":   ["#key-1", "#key-0"],
  "keyAgreement":      ["#key-1", "#key-0"]
}
```

After the grace window, the route opportunistically clears
`principal_did_previous` + `v1_deprecated_at` on next read (fire-and-forget
UPDATE). No cron dependency — typical consumers hit `/u/<uuid>/did.json`
at least once a quarter.

### Invariants preserved

- **Principal DID stays `did:key:`.** The protocol layer does not learn
  about HKDF or rotation; `@kybernesis/arp-resolver` keeps resolving
  did:key untouched.
- **Phase-8.5 conservative call #1 remains open** (WebAuthn). Rotation and
  passkeys are orthogonal — a user can rotate whether or not they have a
  passkey, and passkey registration does NOT rotate the DID.
- **Owner attribute model** (RFC not yet written, but stated in
  `docs/ARP-architecture.md`) is unchanged.

## Alternatives considered

- **PBKDF2 with a user-selected passphrase.** Rejected: adds a second
  secret users must remember in addition to the recovery phrase, and the
  ARP model explicitly keeps the browser-held key in a recoverable
  single-factor state. Passkey + WebAuthn supply the second factor when
  users want one.
- **Argon2id instead of HKDF.** Rejected at v2: HKDF from BIP-39 entropy
  is sufficient because the entropy is already 128 bits of CSPRNG output.
  Argon2id's defense-in-depth (memory-hard work factor) targets
  low-entropy user-chosen passphrases, which v1 already doesn't support.
  Revisit if we ever accept passphrases.
- **Silent auto-upgrade.** Rejected: breaks historical audit-log
  verification for every v1 user on first login. Explicit opt-in with a
  grace window is what pre-9d Phase-8.5 review already decided.
- **Server-held KMS-wrapped principal keys.** Explicitly out of scope
  for this RFC; tracked as a Phase-9+ consumer-UX polish item alongside
  magic-link email. v2.1 spec §3.3 describes a cloud-held key model, but
  Phase-9 implements it through the existing browser-held key published
  under a `did:web:arp.cloud:u:<uuid>` alias.

## Drawbacks

- **Two localStorage slots** for the duration of the grace window. Minor
  overhead (≈200 bytes per slot); negligible in practice.
- **Rotated tenants carry a dual-published DID doc for 90 days.** The
  doc grows from one verification method to two. No third-party DID
  resolver in the ARP ecosystem breaks on a two-key doc — the spec
  already allows arrays.
- **Callers of `/u/<uuid>/did.json` that cache aggressively** may miss
  the grace-window cleanup for up to `max-age=300`. Acceptable — the
  cleanup is strictly a doc-shrink, not a correctness change.
- **v1 keys remain usable indefinitely.** A user who never rotates keeps
  their v1 DID. We don't plan to force-rotate; if we ever do, that's a
  separate RFC.

## Adoption path

1. **Phase 9d (this RFC's ship vehicle):**
   - Client v2 derivation lives alongside v1. New onboarding defaults to v2.
   - `POST /api/tenants/rotate` goes live.
   - Dual-publish in `/u/<uuid>/did.json` activates automatically when a
     tenant has `principal_did_previous` set.
2. **Phase 9e:** Dashboard "Rotate identity" CTA surfaces to v1 users.
   (9d ships the primitives; 9e threads the UX.)
3. **Phase 10+:** Mobile repo (`arp-mobile`) adopts the v2 path for new
   accounts and adds a rotation UX. Docs-only handoff note lives in
   the Phase 9d PR body.

## Unresolved questions

None at acceptance.

## Security & privacy considerations

- **New trust assumptions:** none. The server never holds the private
  key at any point during rotation; it verifies two signatures and
  flips two columns. The caller could in theory generate the v2 key
  from a different phrase than the v1 key (the rotate endpoint does
  not check that the two keys share a recovery phrase) — that's a
  feature, not a bug, because a user losing their v1 phrase can still
  recover via a passkey-gated rotation once that pathway lands.
- **New attack surface:** `POST /api/tenants/rotate`. Protected by
  session auth + double-signature verification + timestamp clamp.
  Replay attacks would need both private keys + a matching session
  cookie; a matching session cookie already implies access to the
  v1 key (or the passkey bound to the tenant), so possession of
  the v1 key to sign the challenge is redundant evidence.
- **New PII paths:** none. DIDs + multibase public keys are already
  public; nothing new is persisted.
- **Replay exposure:** the 5-minute timestamp clamp plus the session
  principal check mean a captured rotation request is useless against
  a session cookie the attacker does not already hold. Submitting the
  same request twice is idempotent on success (second call returns
  `already_rotated: true`).

## Testkit impact

No new probes. The three probes added in Phase 9c
(`principal-identity-method`, `no-selfxyz-prompt`,
`representation-jwt-signer-binding`) already cover the cases that matter:

- `principal-identity-method` accepts both `did:web:` and `did:key:`; it
  does not assert a specific KDF version.
- `representation-jwt-signer-binding` resolves the `iss` DID and verifies
  the JWT signature against a verification method in the resolved doc.
  During a grace window, the doc publishes two keys; the probe binds
  against whichever `kid` the JWT names.

Future probe candidate (non-blocking): `principal-key-rotation-healthy` —
checks that if `principal_did_previous` is set, `v1_deprecated_at + 90
days > now()` still. Not urgent because the server opportunistically
self-heals.
