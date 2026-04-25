# Phase 10 slice 10d — manual smoke

**Scope:** verify owner-app parity with cloud after the 10d branch merges.
Most of the suite is automated (33 runtime tests + 18 owner-app tests),
but the chrome-swap, passkey UX, and rotation panel deserve eyes-on
verification before slice 10e closes the phase.

Run against a fresh `~/.arp/` data dir. All steps assume Docker is
available + the sidecar image is built locally (or pulled from GHCR
once Phase 9 publishes).

---

## 1. Boot the sidecar with WebAuthn enabled

```bash
docker run --rm -p 7878:7878 -p 8443:443 \
  -v $(pwd)/data:/data \
  -e ARP_ADMIN_TOKEN="$(openssl rand -hex 32)" \
  -e WEBAUTHN_RP_ID=localhost \
  -e WEBAUTHN_ORIGINS=http://localhost:7878 \
  ghcr.io/kybernesisai/sidecar:dev start \
  --owner-app-dir /app/owner-app \
  --owner-app-port 7878
```

The sidecar should log `arp-sidecar listening` with the bound port. The
owner-app reachable at `http://localhost:7878`.

## 2. Design-system swap

- `http://localhost:7878/login` renders against the paper/ink palette
  (light editorial ground, signal-blue brand mark, JetBrains Mono kicker).
- The footer shows `ARP · OWNER-APP · LOCAL RUNTIME` with cross-links to
  `cloud.arp.run/legal/{terms,privacy}` and `cloud.arp.run/support`.
- Existing pages (Connections, Pair, Settings) keep working — visual
  drift is the close-enough rule, not a regression.

## 3. Passkey sign-in flow (first-time)

1. On `/login`, the primary CTA reads "Sign in with passkey" (Touch ID /
   Face ID / Windows Hello). The legacy did:key flow lives behind the
   "Advanced" disclosure.
2. First sign-in: open the Advanced disclosure → click "Get started" →
   reveal + acknowledge the recovery phrase → click "Sign in".
3. Land on `/` (Connections list).

## 4. Register a passkey

1. Navigate to `/settings`.
2. The new **Passkeys** card appears between **Identity** and **Keys**.
3. Click "Add a passkey" → confirm with Touch ID / Face ID / Windows Hello.
4. The credential should appear in the list with the kicker
   `passkey · <first 12 chars>…` and today's "added" date.

## 5. Sign out + sign in via passkey

1. Top-nav "Log out" returns you to `/login`.
2. The primary "Sign in with passkey" button should be enabled now.
3. Click → confirm with platform authenticator → land back on `/`.

## 6. Rename + remove

1. Settings → Passkeys → click "Rename" on a credential.
2. Type a new label → "Save". Refresh — the new label persists.
3. Add a second passkey from a different authenticator (or the same one
   on a different device) so two are registered.
4. Click "Remove" on one. Confirm in the modal → it disappears.
5. Try to remove the last one — the sidecar returns 409, the UI shows
   `Cannot remove your only passkey. Register another first.`

## 7. HKDF rotation (v1 → v2)

This step requires an account that was created on the v1 derivation
(pre-10d). Easiest reproduction: open browser dev-tools → set
`localStorage["arp.principalKey.v1"]` to a known JSON entropy blob and
remove `arp.principalKey.v2`, then refresh `/settings/keys`.

1. Settings → Keys → "Principal identity (HKDF v1 → v2)" panel reads
   "Browser key version: v1" and the "Rotate to v2" CTA is enabled.
2. Click → wait for the in-browser HKDF derivation + sidecar round-trip.
3. The result block should report
   `Rotated. New DID: did:key:z…. Previous deprecated at <ISO>.`
4. Reload — banner now reads "You're already on v2" and the CTA hides.

## 8. Dual-publish DID doc

```bash
curl -s http://localhost:7878/.well-known/did.json | jq '.principal'
```

Pre-rotation: only `did` field. Post-rotation: `did`, `previousDid`,
`previousVerificationMethod.publicKeyMultibase`, `previousDeprecatedAt`
(should land ~90 days from "now").

After 90 days (or with the test override `identityRotationGraceMs: 1`),
the previous fields drop on the next request — opportunistic cleanup.

---

If any of the above diverges from spec, file a fix-now or a deferred
note in the PR body. Slice 10e's e2e tests will exercise the
machine-checkable behaviours; this doc is for the visual + tactile
parts that automation can't see.
