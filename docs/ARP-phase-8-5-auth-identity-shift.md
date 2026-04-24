# Phase 8.5 — Auth & Identity Shift (Self.xyz demotion + `did:key` + terminology)

**Reader:** autonomous coding agent.
**Mode:** lockdown. Every requirement below is an executable directive. Do not ask clarifying questions. Where a choice exists, this doc picks one.
**Predecessor:** Phase 8 (mobile scaffold merged, PR #12; public launch deferred to Phase 10).
**Successor:** Phase 9 — Headless Integration + Public Launch.

## Status (2026-04-24)

- ✅ Phase 8.5 merged (PR #14, commit `3c157fb`).
- ✅ Conservative call #1 (WebAuthn / passkey UX) **closed by Phase 9d**. See `docs/ARP-phase-9-launch.md` §Task 10 + apps/cloud `/api/webauthn/*` routes + `lib/principal-key-passkey.ts`.
- ✅ Conservative call #3 (HKDF-SHA256 seed derivation + identity rotation path) **closed by Phase 9d**. See `rfcs/0005-principal-key-derivation-v2.md` + `lib/principal-key-browser.ts::rotateToV2()` + `/api/tenants/rotate` + `/u/<uuid>/did.json` dual-publish.
- ⏳ Conservative call #2 (server-held KMS-wrapped principal keys) and #4 (magic-link email) remain deferred to Phase 9+ consumer-UX polish or beyond.

---

## 0. Why this phase exists

Mid-Phase-8, the architecture's identity story was audited. Two findings:

1. **Self.xyz is not a load-bearing dependency.** The `@kybernesis/arp-selfxyz-bridge` package is a 500-LOC placeholder with zero runtime consumers (per `docs/ARP-session-handoff.md:381`). Protocol-level code (pairing, PDP, runtime, transport, resolver, testkit) treats `required_vcs: string[]` / `presented_vcs: string[]` as **opaque strings**. Self.xyz only appears as illustrative hardcoded labels in `packages/consent-ui/src/vcs.ts` and in doc examples. It was never wired end-to-end.
2. **The user-facing identity story uses developer UX, not consumer UX.** The current cloud onboarding at `apps/cloud/app/onboarding/OnboardingForm.tsx` asks the user to *type a DID, request a nonce, sign the nonce with their private key somewhere else, and paste a base64url signature.* No consumer gets past step three. The owner-app login has the same shape.

Phase 8.5 fixes both without touching the protocol layer. It is a thin-layer change: app UX + docs + spec amendment for Headless.

**Out of scope (deferred to Phase 9 UX polish, explicitly):**
- WebAuthn / passkey UX
- Magic-link email (Resend or equivalent)
- Server-held principal keys with KMS wrapping
- 12-word recovery phrase export flow
- `did:pkh` / wallet-delegated identity
- W3C VC envelope stripping (the `@context` + `type` wrapping in `packages/spec/src/schemas/representation-vc.ts`)

Those belong to a consumer-UX pass that can run concurrently with Phase 9 launch prep. This phase's job is to make the current flow *coherent and de-scoped from Self.xyz*, not to ship every possible UX polish.

---

## 1. The one-line design

> **The user's principal identity is a `did:key` keypair that lives in their browser's IndexedDB. They never see it, never paste it, never type it. Recovery = a one-time phrase we show at signup for them to save. Self.xyz becomes a deleted package. Verifiable credentials stay as opaque strings at the protocol level, renderable generically in consent UIs.**

Consequences:
- Zero servers hold principal private keys.
- Zero third-party identity providers required.
- `did:key` decodes the public key directly from the DID string — no DID document hosting required for principal identity.
- Pairing, PDP, runtime, transport, resolver, testkit, audit, Cedar: **untouched.**
- Sidecar bootstrap: **untouched.** It still generates its own agent keypair at first boot; the handoff bundle's `principal_did` field now commonly carries `did:key:z6Mk...` instead of `did:web:ian.self.xyz`.
- Headless gets a v2.1 spec amendment. Their work plan loses the "prompt for Self.xyz sign-in" steps.

---

## 2. Hard rules for this phase

1. **Do not touch `packages/transport/`.** The DIDComm isolation invariant holds (CLAUDE.md §4.1).
2. **Do not edit the protocol packages** beyond the additive changes specified in Task 2 (resolver adds `did:key`). No changes to `pairing`, `pdp`, `runtime`, `cloud-runtime`, `audit`, `testkit`, `spec` (beyond schema permissiveness), `templates`, `tls`, `registry`, `sdk`.
3. **Do not strip the W3C VC envelope** from Representation JWTs. It is cosmetic overhead and carries compatibility value for any third party that ingests VCs. Leave it.
4. **Do not rename `packages/resolver` → `@kybernesis/arp-manifest-resolver`** or any similar cosmetic rename. All package names stay.
5. **Do not remove the `handoff bundle` / `paste handoff` code paths** from `apps/cloud` or `apps/owner-app`. Demote them to an "advanced / migrate existing sidecar" tab; do not delete.
6. **Do not push to origin without explicit user approval** (CLAUDE.md §4.3).
7. **Do not break `ARP_CLOUD_PRINCIPAL_FIXTURES` dev mode.** The env-var fallback stays for now; a new "browser-generated did:key" path is added alongside it. Phase 9 can drop the fixture path.
8. **Do not change the on-wire formats** of Connection Tokens, Representation JWTs, agent cards, DID documents, handoff bundles, `arp.json`. Only the *value* of the `principal_did` field may now be a `did:key:...` URI; the schema regex at `packages/spec/src/schemas/did-document.ts` already allows this (`^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$`). Re-verify it does.
9. **The `iss` / `kid` of Representation JWTs continues to reference the principal DID.** When the principal DID is a `did:key`, `kid` becomes `did:key:z6Mk...#key-1` and verifiers decode the public key from the DID string itself — no HTTP fetch.
10. **Every `self_xyz.*` string in test fixtures stays as-is.** They are illustrative. Do not rename them; do not add new ones. Do add generic VC-type examples alongside (e.g. `custom.verified_human`) in consent-ui fixtures to prove the generic rendering path.

---

## 3. Task list

### Task 1 — Delete `packages/selfxyz-bridge/`

- Remove the package directory outright.
- Remove the workspace dependency line from `apps/owner-app/package.json`.
- Remove `@kybernesis/arp-selfxyz-bridge` from the transpile list in `apps/owner-app/next.config.mjs`.
- Remove it from `pnpm-workspace.yaml` if listed.
- Search for any other consumers (`grep -rn "selfxyz-bridge\|@kybernesis/arp-selfxyz" --include="*.ts" --include="*.tsx" --include="*.json"`); there should be none after the two edits above.

**Acceptance:** `pnpm install --frozen-lockfile` succeeds. `pnpm run typecheck` succeeds. `pnpm run build` succeeds. No dangling references.

### Task 2 — Add `did:key` resolver support

- New file `packages/resolver/src/did-key.ts`. Exports:
  ```ts
  export function didKeyToDidDocument(did: string):
    | { ok: true; value: DidDocument }
    | { ok: false; error: ResolverError };
  ```
- Implementation: parse `did:key:z<base58btc-multibase-Ed25519-public-key>`, decode the multibase-multikey to a raw 32-byte Ed25519 public key, synthesise a `DidDocument` with `id = did`, one `verificationMethod` of type `Ed25519VerificationKey2020` (multibase preserved verbatim), and `authentication` / `assertionMethod` / `keyAgreement` referencing it. No `service` array (did:key is terminal — no endpoints).
- Use only the Ed25519 multicodec prefix (`0xed01` / varint-encoded `0xed 0x01`). Reject other curves with `unsupported_method`.
- Wire into `packages/resolver/src/resolver.ts`: extend the `Resolver` interface with a method or extend `resolveDidWeb` to dispatch on prefix (preferred: add `resolveDid(did)` that dispatches on `did:web:` vs `did:key:` and leaves the existing `resolveDidWeb` as a deprecated alias).
- New tests in `packages/resolver/tests/did-key.test.ts`:
  - Round-trip: generate keypair, encode as did:key, decode via `didKeyToDidDocument`, assert public key bytes match.
  - Reject `did:web:` → returns `unsupported_method`.
  - Reject non-Ed25519 multicodec prefix.
  - Reject malformed multibase.
  - Synthesised DID document validates against `DidDocumentSchema`.

**Acceptance:** new tests pass. Existing resolver tests still pass. A Representation JWT signed by a did:key private key verifies correctly through the updated resolver when consumed by `packages/pairing/src/signing.ts::verifyBytes` (add one integration test in `packages/pairing/tests/` that uses a did:key issuer).

### Task 3 — Consent-UI: generic VC label rendering

- Rewrite `packages/consent-ui/src/vcs.ts`:
  ```ts
  export function labelForVc(vcType: string): string {
    // Pretty-print unknown VC types: "self_xyz.over_18" → "Self xyz · over 18".
    // Any known labels live in an optional provider map callers can pass in.
    ...
  }
  export function labelForVcWith(
    vcType: string,
    overrides: Record<string, string>
  ): string { ... }
  ```
- Strip the hardcoded Self.xyz map. Existing callers in `packages/consent-ui/src/render.ts` call `labelForVc` only; behaviour for `self_xyz.*` strings stays acceptable (pretty-printed).
- Update `packages/consent-ui/tests/fixtures.ts` — existing `self_xyz.*` strings stay; add one `custom.over_21` VC in one fixture to prove generic path renders.
- Update `packages/consent-ui/tests/consent-view.test.ts` snapshots only if the label text actually changes. If a snapshot is now `"Self xyz · over 18"` instead of `"Over 18"`, regenerate and review.

**Acceptance:** consent-ui tests pass. No Self.xyz-specific strings survive in `src/`.

### Task 4 — Owner-app: browser-held principal key onboarding

**Current:** user pastes a DID, server issues a nonce, user signs externally and pastes the signature.

**Target:** on first visit the owner app generates (or loads from IndexedDB) an Ed25519 keypair using `@noble/ed25519`. The principal DID is `did:key:z<multibase(pubkey)>`. Login = browser auto-signs the challenge nonce. The signature field in the UI goes away.

Changes:
- New file `apps/owner-app/lib/principal-key-browser.ts`. Runs in the browser only. Generates + persists a keypair in `localStorage` or IndexedDB under key `arp.principalKey.v1`. Exports:
  ```ts
  export async function getOrCreatePrincipalKey(): Promise<{
    did: string;
    publicKeyMultibase: string;
    sign(bytes: Uint8Array): Promise<Uint8Array>;
  }>;
  export async function exportRecoveryPhrase(): Promise<string>; // 12-word BIP39-style seed reveal
  export async function importFromRecoveryPhrase(phrase: string): Promise<void>;
  export async function clearPrincipalKey(): Promise<void>;
  ```
- Rewrite `apps/owner-app/app/login/LoginForm.tsx`:
  - No DID input field.
  - No signature textarea.
  - First visit: call `getOrCreatePrincipalKey()`, show the generated DID read-only ("This is your agent-owner identity. Save your recovery phrase.") + "Save recovery phrase" button that reveals/copies it once.
  - Returning visit: auto-fetch challenge from `/api/auth/challenge`, browser signs, posts to `/api/auth/verify`. One button: "Sign in."
- Update `apps/owner-app/app/api/auth/challenge/route.ts`: accept the principal DID (now always a did:key from the browser); optional: if the DID is not yet registered in `principals.json`, auto-register (write the public key by decoding the did:key). Preserve the existing behaviour for fixture-registered DIDs.
- Update `apps/owner-app/app/api/auth/verify/route.ts`: if the principal DID is a `did:key:`, decode the pubkey inline instead of calling `publicKeyForPrincipal`. Keep the `principals.json` path for legacy/fixture DIDs.
- Keep `apps/owner-app/lib/principal-keys.ts` for the legacy path.
- Update `apps/owner-app/tests/e2e/smoke.spec.ts` for the new flow (no more signature paste).

**Acceptance:** e2e smoke passes. Unit tests for auth routes pass. A fresh browser session (no IndexedDB) can sign in with zero pasting in two clicks: "Generate → Save recovery → Sign in."

### Task 5 — Cloud-app: browser-held principal key onboarding

Mirror Task 4 in `apps/cloud/`:
- New `apps/cloud/lib/principal-key-browser.ts` (same surface as owner-app's).
- Rewrite `apps/cloud/app/onboarding/OnboardingForm.tsx`: remove the DID input, the signature textarea, and the handoff-bundle paste as the default step. Single "Get started" button → browser generates did:key → recovery phrase shown → server-side tenant creation (POST `/api/tenants` with `{ principalDid, publicKeyMultibase }`).
- Demote handoff-bundle paste to a tab: "Advanced: migrate existing sidecar." The existing `POST /api/agents` route stays intact.
- Update `apps/cloud/app/api/auth/challenge/route.ts` + `/verify/route.ts` to accept did:key DIDs and decode pubkeys inline.
- Remove the "type your `did:web:ian.self.xyz`" placeholder text everywhere. Replace with "Your identity is being generated securely in your browser. You'll see a recovery phrase next."
- Add a new route `POST /api/tenants` (distinct from `POST /api/agents`, which still handles handoff-bundle provisioning). This one takes `{ principalDid, publicKeyMultibase }`, creates a tenant if absent, records the user, returns the tenant id.
- Update `apps/cloud/lib/principal-keys.ts`:
  - If the DID is a `did:key:`, decode inline.
  - If the DID is in `ARP_CLOUD_PRINCIPAL_FIXTURES`, fall back to the existing path (keeps dev/test fixtures working).
  - New helper `decodeDidKeyPublicKey(did: string): Uint8Array | null`.

**Acceptance:** new visitor can create a tenant in three clicks. Unit tests for the auth + tenant routes pass. Middleware tests (`apps/cloud/tests/middleware.test.ts`) still pass; update fixtures to include a did:key principal.

### Task 6 — Docs sweep

Three categories of edit, executed by three parallel doc agents:

**6A — Architecture + protocol docs:**
- `docs/ARP-architecture.md`:
  - §Layer 1 ("Identity") — rewrite. Opening: "Every agent and every owner has a keypair. The public key is published at a stable address; verifiers fetch it and verify signatures." Then describe both methods plainly: `did:web:<host>` = "keys hosted at an HTTPS URL" (like OIDC JWKS); `did:key:<b58>` = "keys encoded directly in the identifier." Drop the "Self.xyz ZK proofs" framing. Keep the W3C-DID reference as one-liner.
  - All `did:web:ian.self.xyz` example strings → `did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp` (an illustrative fixture) for owner/principal examples; agent examples stay on `did:web:samantha.agent`.
  - Remove the "Self.xyz VC" callouts in Layer 2 example JSON; keep `required_vcs: []` or generic examples.
  - Layer 1 bullet claiming "Self.xyz is a shipping product" removed.
- `docs/ARP-policy-examples.md`:
  - `self_xyz.*` variable references stay — they're illustrative VC strings; the PDP doesn't care what issuer. Add a note at the top of §6.9 "Presented credentials": these prefixes are examples; any string works; Self.xyz is no longer a required provider.
- `docs/ARP-scope-catalog-v1.md`:
  - `tier_gate: self_xyz.verified_human` references stay (YAML data files, runtime-interpreted as opaque strings). Add one-line callout at the top of §… "tier_gate VCs are examples; providers are pluggable."
- `docs/ARP-installation-and-hosting.md`:
  - `principal_did` handoff-bundle examples → use `did:key:z6Mk...` as the illustrative value.
  - Mode A (Cloud) walkthrough: "paste the Handoff Bundle" → "click Get Started (your browser creates your identity)."
- `docs/ARP-our-codebase.md`:
  - Remove `arp-selfxyz` from the tree. Remove "13. Self.xyz wallet bridge" from the bullet list.

**6B — Phase + onboarding docs:**
- `docs/ARP-phase-0-roadmap.md`:
  - Dependency table: remove the "Self.xyz VCs / Self.xyz" row. Replace with "Optional attribute VCs / any OIDC or VC provider (pluggable, not in v1)."
  - Phase status table: add Phase 8.5 row.
- `docs/ARP-phase-8-mobile.md`:
  - Remove "Prove with Self.xyz" button (step 4 under the pairing section).
  - Remove the Expo+Self.xyz native-SDK warning in the prerequisites.
  - Note: the scaffold ships did:key browser-held keys; biometric passkey auth is Phase 10 scope (public mobile launch). The mobile repo at `github.com/KybernesisAI/arp-mobile` receives a parallel small docs update (tracked separately; see §6D).
- `docs/ARP-phase-9-launch.md`:
  - Remove any "Self.xyz staging key" prerequisite.
  - Add line-item: "Phase 8.5 merged — Self.xyz demoted, did:key default, Headless spec v2.1 delivered."
- `docs/ARP-getting-started.md`:
  - Remove the "Self.xyz developer access" prerequisite.
  - Remove Phase 4 Self.xyz setup narrative.
- `docs/ARP-session-handoff.md`:
  - Update §Self.xyz — mark as "removed in Phase 8.5" with one-line pointer.
  - Update file tree: remove `selfxyz-bridge/` entry.

**6C — Headless-facing docs:**
- `docs/ARP-headless-parallel-build.md`:
  - §1 "Setup ARP Local" flow step 5: replace "Collect the owner's principal DID (usually `did:web:<username>.self.xyz`). Prompt for Self.xyz sign-in if needed." with:
    > "Collect the owner's principal DID. Present two options: (a) **Use ARP Cloud account** — redirect to `arp.cloud/onboard?domain=<sld>&registrar=headless` and await their principal DID via callback. (b) **Generate now (advanced)** — in-browser did:key keypair generation; private key downloads as a recovery file; principal DID is `did:key:z...`."
  - §1 "Setup ARP Cloud" flow step 6: replace "Collect the principal DID via Self.xyz." with "Redirect to `arp.cloud/onboard` immediately after step 5. arp.cloud generates the user's did:key principal, creates a tenant, and calls back your `/api/v1/arp/domains/<sld>/bind-principal` endpoint with the principal DID."
  - §4 Task 5 (handoff emitter): unchanged.
  - §4 Task 8 (compliance plumbing): unchanged.
- `docs/ARP-headless-card-bridging.md`:
  - Replace all `did:web:ian.self.xyz` in example JSON with `did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp`.
  - The "principal_did binding via Self.xyz" section — rewrite: "The agent's DID doc references a `principal.did` owned by the human. Today that DID is typically `did:key:...` (browser-generated) or `did:web:arp.cloud/u/<id>` (cloud-managed, Phase 9+ KMS). Self.xyz attribute VCs are not part of the required path."
- `docs/ARP-tld-integration-spec-v2.md`:
  - **Do not rewrite.** v2 is frozen for Headless's in-flight build.
  - Add a banner at the top under §0 Orientation: "**v2.1 amendment:** see `ARP-tld-integration-spec-v2.1.md` for the Phase-8.5 identity amendment (principal DID is now method-agnostic; did:key is the recommended default)."
- `docs/ARP-example-atlas-*.md` (three files):
  - Update `principal_did` examples to `did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp`.
  - Remove Self.xyz VC presentation steps where they exist.
- `docs/ARP-atlas-integration-example.md`:
  - Remove the Self.xyz staging setup step.
  - Update VC requirement examples to use generic `custom.*` names or drop them.

**6D — Mobile repo (`github.com/KybernesisAI/arp-mobile`)** — cannot be edited from this repo. Produce a handoff note at `docs/ARP-phase-8-5-mobile-repo-changes.md` listing exactly what needs to be changed in that repo (docs-only: remove Self.xyz SDK from install docs, update example DIDs). User executes the mobile-repo update in a separate session.

### Task 7 — Write `docs/ARP-tld-integration-spec-v2.1.md`

One-page formal amendment for Headless. Contract:
- Anchors: amendments to §5.2 (`_principal` TXT record now accepts `did:key:...` values), §7 step 9 (owner-binding collection — two options), §7 step 11 (representation JWT can be signed by any principal-key type including `did:key`).
- Lists explicit acceptance criteria:
  - `_principal.<owner>.<domain>` TXT record accepts any DID matching `^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$`.
  - Setup ARP Local flow produces a principal DID via one of: arp.cloud callback, or browser-generated did:key.
  - Setup ARP Cloud flow delegates principal DID minting to arp.cloud via redirect + callback.
  - Self.xyz prompts MUST be removed; retaining them is non-conformant with v2.1.
- Compatibility: v2 clients (already-deployed Headless staging) remain conformant as long as they stop prompting for Self.xyz; no DNS or well-known shape changes.

### Task 8 — CLAUDE.md refresh

- §1 first sentence: remove "+ Self.xyz verifiable credentials." Replace with "+ method-agnostic principal identity (did:key default, did:web available for sovereign hosting)."
- §5 phase table: add Phase 8.5 row.
- §14 known tech debt: add "principal-key UX is did:key browser-held in v1; passkey / magic-link consumer UX is Phase 9+ polish."
- §14: remove the "`ARP_CLOUD_PRINCIPAL_FIXTURES` … real did:web / did:key resolution goes through `@kybernesis/arp-resolver` at Phase 9 prep" bullet — it lands now.
- §7 phase-specific spot-check list: add "Phase 8.5: selfxyz-bridge absence grep returns empty; did:key resolver test passes; browser-held principal key e2e smoke passes."
- Date-stamp footer to reflect phase 8.5 completion.

---

## 4. Acceptance gates

Run in order. All must pass before the PR is opened.

1. `grep -rn "selfxyz\|Selfxyz\|SELFXYZ" --include="*.ts" --include="*.tsx" --include="*.json" packages/ apps/ adapters/ 2>/dev/null | grep -v node_modules | grep -v /dist/` returns **empty**.
2. `grep -rn "@veramo/did-comm\|didjwt" --include="*.ts" --include="*.json" packages/ apps/ adapters/ examples/ 2>/dev/null | grep -v node_modules | grep -v packages/transport/` returns **empty** (DIDComm isolation still holds).
3. Cold-cache gate:
   ```bash
   rm -rf packages/*/dist apps/*/dist adapters/*/dist packages/*/json-schema \
          packages/scope-catalog/generated node_modules packages/*/node_modules \
          apps/*/node_modules adapters/*/node_modules tests/*/node_modules \
          examples/*/node_modules
   pnpm install --frozen-lockfile
   pnpm run typecheck
   pnpm run build
   pnpm run test
   pnpm run lint
   ```
   All four exit 0.
4. `packages/resolver/tests/did-key.test.ts` — green.
5. Owner-app e2e smoke — green with zero signature pasting.
6. Cloud-app onboarding e2e (or manual smoke) — new user creates a tenant in three clicks.
7. `docs/ARP-tld-integration-spec-v2.1.md` lints cleanly (markdown) and renders.
8. Every `did:web:ian.self.xyz` occurrence in `docs/` is replaced or framed as legacy/illustrative with a pointer to v2.1.

---

## 5. Conservative calls

These are deliberate limits for Phase 8.5. Do not expand.

- **Passkeys / WebAuthn not wired.** Browser-held did:key via IndexedDB is the v1 flow. Passkeys are Phase 9 or later UX polish.
- **No magic-link email.** No Resend integration. No account-recovery email.
- **No server-held principal keys, no KMS wrapping.** All principal keys are client-side. Cloud users' recovery = the phrase they saved at signup.
- **Recovery phrase uses a BIP-39-style wordlist** but is not advertised as BIP-39 (we're not aligning to any wallet standard). The user sees it as a "recovery phrase" — 12 words.
- **Consent-ui labels become generic.** No per-provider pretty maps in v1. Callers can pass an `overrides: Record<string, string>` object if they want "Over 18" instead of "Self xyz · over 18."
- **Handoff-bundle flow in apps/cloud + apps/owner-app is kept.** Demoted to an advanced tab, not deleted. Sidecar migration path remains viable.
- **Spec v2.1 is an amendment, not a replacement.** Headless's in-flight v2 build stays conformant by dropping Self.xyz prompts; no DNS/well-known shape changes are required.
- **Mobile repo gets a doc-only update handoff.** No changes to `arp-mobile` code from this phase.

---

## 6. Done-when checklist

- [ ] `packages/selfxyz-bridge/` deleted.
- [ ] `did:key` support in `packages/resolver/`; resolver tests include did:key cases.
- [ ] Owner-app login has no DID input and no signature textarea.
- [ ] Cloud-app onboarding has no DID input and no signature textarea; handoff-paste is on an Advanced tab.
- [ ] `packages/consent-ui/src/vcs.ts` has no Self.xyz hardcoded labels.
- [ ] Every doc in §6 updated per directive.
- [ ] `docs/ARP-tld-integration-spec-v2.1.md` written (one page).
- [ ] `docs/ARP-phase-8-5-mobile-repo-changes.md` written (mobile-repo handoff).
- [ ] CLAUDE.md updated per §8.
- [ ] All acceptance gates (§4) pass.
- [ ] PR body drafted with review-pass additions, conservative calls, handoff note for Phase 9.

---

*Phase 8.5 brief — Auth & Identity Shift. Authored at branch `phase-8-5-auth-identity-shift`. Anchor for parallel agent execution.*
