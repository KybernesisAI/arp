# ARP Phase 9 — Headless Integration + Public Launch

**Reader:** Claude Code. Directives only.

**Companion docs:** `ARP-phase-0-roadmap.md`, `ARP-tld-integration-spec-v2.md`, `ARP-our-codebase.md`, `ARP-phase-7-cloud.md`.

---

## 0. Reader orientation

**Phase goal:** complete the TLD-side integration with Headless Domains, publish all artifacts, flip production switches, and go live. This phase coordinates work across the ARP team and Headless; the Claude Code portion is the documentation, spec-site, and launch-readiness automation we own.

**Tech pins:**
- Spec site: Next.js 16 (static) via Fumadocs, deployed at `https://spec.arp.run`
- Docs site: same Fumadocs app (or sibling), deployed at `https://docs.arp.run`
- Docs: MDX + Fumadocs or Nextra (pick Fumadocs for Next.js parity)
- Search: Algolia DocSearch or local Pagefind
- Analytics: Vercel Analytics + Plausible
- Status page: Instatus or a custom Next.js page reading from observability
- Community: GitHub Discussions as primary; Discord/Slack only if demand appears

**Out of scope:** enterprise sales motion, paid marketing campaigns, content calendar beyond launch week (post-launch concerns).

---

## 1. Definition of done

- [ ] `spec.arp.run` live — versioned spec pages, JSON schemas at stable URLs, scope catalog viewer
- [ ] `docs.arp.run` live — getting-started, three install guides, SDK API reference, adapter guides
- [ ] `arp.run` root serves a public landing page (currently points at the cloud-app onboarding — replace or layer)
- [ ] GitHub org `KybernesisAI` holds public repos: `arp` (main, `https://github.com/KybernesisAI/arp`), `arp-sdk-python`, `arp-mobile`
- [ ] `@kybernesis/arp-*` packages promoted to `latest` on npm at `1.0.0` (so `arp-mobile` can swap inlined portable subsets for real deps)
- [ ] `ghcr.io/kybernesisai/sidecar:1.0.0` tagged + released
- [ ] Headless "Set up as ARP agent" checkout flow live in their production registrar, v2.1 conformance acknowledged (see `docs/ARP-tld-integration-spec-v2.1.md`)
- [ ] ARP Cloud Deployment Protection flipped to "All Deployments" (gates custom domains too); Stripe switched from sandbox to live keys; legal pages (ToS/Privacy/DPA) reviewed + published
- [ ] v2.1 spec endpoints live on `cloud.arp.run`: `GET /onboard?domain&registrar&callback`, `POST /internal/registrar/bind`, `GET /u/<uuid>/did.json`
- [ ] `POST /api/push/register` live on `cloud.arp.run` (unblocks Phase-8 mobile push registration)
- [ ] WebAuthn / passkey UX shipped in `apps/cloud` + `apps/owner-app` — supersedes localStorage-held principal keys from Phase 8.5
- [ ] HKDF-SHA256 seed derivation migrated from Phase-8.5 `entropy-padded-to-32` scheme; identity-rotation path documented + tested
- [ ] 3 new testkit probes green: `principal-identity-method`, `no-selfxyz-prompt`, `representation-jwt-signer-binding` (per v2.1 §6)
- [ ] DID-pinned TLS bridge live in `arp-mobile` (Phase-8 conservative call #2 closed)
- [ ] Status page + uptime monitoring live at `status.arp.run`
- [ ] Launch post drafted + reviewed (marketing push itself is out of scope; produce the assets, a human pushes the button)
- [ ] Mobile apps submission moved to **Phase 10** (Apple Dev + EAS credentials + Play Console required; see `docs/ARP-phase-10-mobile-launch.md` when created)

---

## 2. Prerequisites

- Phases 1–8.5 complete on `main` with all acceptance tests green (✅ as of 2026-04-24; head `0e2ae14`)
- Milestone A live: `cloud.arp.run` + `app.arp.run` on Vercel Pro, Neon-backed, Stripe **sandbox** wired (✅)
- Phase 8.5 shipped: `did:key` principal identity primary; `@kybernesis/arp-selfxyz-bridge` deleted; `@kybernesis/arp-transport/browser` subpath; generic VC rendering; `docs/ARP-tld-integration-spec-v2.1.md` ready to send to Headless (✅)
- Legal review of ToS / Privacy / DPA for ARP Cloud — **required before Task 7 production flip**
- Incident-response runbook drafted — **required before Task 7 production flip**
- Headless Domains has received + acknowledged `docs/ARP-tld-integration-spec-v2.1.md` (send if not already done)

---

## 3. Repository additions

```
arp/
├── apps/
│   └── spec-site/                  # Fumadocs-based Next.js app
│       ├── content/
│       │   ├── spec/
│       │   │   ├── v0.1/
│       │   │   │   ├── overview.mdx
│       │   │   │   ├── architecture.mdx
│       │   │   │   ├── identity.mdx
│       │   │   │   ├── pairing.mdx
│       │   │   │   ├── policy.mdx
│       │   │   │   ├── transport.mdx
│       │   │   │   ├── tls-pinning.mdx
│       │   │   │   └── registrar-integration.mdx
│       │   │   └── v1.0/          # later
│       │   ├── docs/
│       │   │   ├── getting-started.mdx
│       │   │   ├── install/
│       │   │   │   ├── local-mac.mdx
│       │   │   │   ├── vps.mdx
│       │   │   │   └── cloud.mdx
│       │   │   ├── scope-catalog.mdx
│       │   │   ├── policies-and-cedar.mdx
│       │   │   ├── sdks.mdx
│       │   │   ├── adapters.mdx
│       │   │   └── mobile.mdx
│       │   └── rfcs/
│       ├── app/
│       └── package.json
├── rfcs/                           # process repo
│   ├── 0001-template.md
│   └── README.md
└── ops/
    ├── status-page/
    ├── incident-runbook.md
    └── on-call-rotation.md
```

Separate repo or subpath for `rfcs/` depending on organizational preference; lean toward inside-main for v0.

---

## 4. Implementation tasks

### Task 1 — Spec site scaffold

1. Create `apps/spec-site` with Fumadocs + Next.js 16
2. Route structure:
   - `/` — landing + pitch
   - `/spec/v0.1/*` — spec pages
   - `/docs/*` — getting-started + how-tos
   - `/schema/*` — serves JSON schemas (proxied from `@kybernesis/arp-spec/json-schema`)
   - `/scope-catalog/v1/manifest.json` — serves compiled manifest
   - `/rfcs/*` — RFC archive
3. Versioned docs with clear "v0.1" banner until v1.0 ships

**Acceptance:** site builds clean, lighthouse performance ≥90.

### Task 2 — Port the ARP docs

For every doc in the Samantha folder (`ARP-architecture.md`, `ARP-policy-examples.md`, etc.), produce a public-facing MDX version:

| Source (internal) | Public (MDX) |
|---|---|
| `ARP-architecture.md` | `/spec/v0.1/architecture.mdx` |
| `ARP-policy-examples.md` | `/docs/policies-and-cedar.mdx` |
| `ARP-scope-catalog-v1.md` | `/docs/scope-catalog.mdx` (+ interactive viewer) |
| `ARP-installation-and-hosting.md` | `/docs/install/index.mdx` |
| `ARP-example-atlas-kyberbot.md` | `/docs/install/local-mac.mdx` |
| `ARP-example-atlas-vps.md` | `/docs/install/vps.mdx` |
| `ARP-example-atlas-cloud.md` | `/docs/install/cloud.mdx` |
| `ARP-hns-resolution.md` | `/docs/hns-resolution.mdx` |
| `ARP-tld-integration-spec-v2.md` | `/spec/v0.1/registrar-integration.mdx` |

Preserve content; rewrite tone only for public audience where needed.

**Acceptance:** every internal doc has a public counterpart; navigation renders each as a discrete page.

### Task 3 — Interactive scope-catalog viewer

Component that loads `/scope-catalog/v1/scopes.json`, renders:
- Search + category filter
- Each scope: expandable card showing ID, label, risk, params, Cedar template, consent text
- "Copy YAML" button per scope
- Link to the bundle using it

**Acceptance:** viewer is the definitive browsing UX for the 50 scopes; feels as good as the OAuth spec browser does.

### Task 4 — Schema browser

Component that loads the JSON schemas (`did-document.json`, etc.), renders:
- Tree view of fields
- Field descriptions inline
- Example payloads
- JSON Schema download button

**Acceptance:** renders all 9 schemas; examples validate against their schema.

### Task 5 — RFC process

`rfcs/README.md`:
- How to propose (PR with `000N-<name>.md`)
- RFC template (`rfcs/0001-template.md` already in-repo)
- Review timeline + lazy-consensus rules
- Breaking-change criteria

Seed with 3 reference RFCs (even if accepted retroactively):
- RFC-0002: "Connection-first policy model"
- RFC-0003: "DID-pinned TLS for agent endpoints"
- RFC-0004: "Scope catalog versioning"

**Acceptance:** process page live; initial RFCs render; a newcomer can propose without asking us.

### Task 6 — Headless integration sign-off

1. Walk Headless through `docs/ARP-tld-integration-spec-v2.1.md` — confirm the three UX edits in §3 are merged on their side + the two-option owner-binding chooser (§4) is live
2. Confirm v2.1 §9 done-when checklist green on their side
3. Run `@kybernesis/arp-testkit audit <headless-test-domain>`; must return 10/10 (existing 8 + 3 new probes from Task 11)
4. Headless flips "Set up as ARP agent" option to public

**Acceptance:** a newly-purchased `.agent` domain from Headless, with the checkbox ticked + Option A ("Use ARP Cloud account") chosen, passes testkit audit within 5 minutes of registration. Option B ("Generate now (advanced)") also lands owner + representation JWT correctly.

### Task 7 — Production flip: ARP Cloud (Milestone B)

Milestone A (2026-04-23/24) already wired Vercel Pro + Neon + Stripe **sandbox** + custom domains (`cloud.arp.run`, `app.arp.run`, `arp.run`). Milestone B is the sandbox → production cutover.

1. Flip Vercel Deployment Protection from `all_except_custom_domains` to **All Deployments** via dashboard (gates deployment URLs too; custom domains stay public)
2. Rotate Stripe sandbox → live keys (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET); register live webhook endpoint at `cloud.arp.run/api/webhooks/stripe`
3. Publish legal pages (ToS, Privacy, DPA) at `arp.run/legal/*`; link from cloud-app footer
4. Confirm observability alerts firing into a paged rotation (Task 11 + Task 12 prereqs)
5. Seed first 10 live tenants via dogfooding; each passes smoke tests (tenant create → connect agent → audit log appears)
6. **Do not remove** the `ARP_CLOUD_PRINCIPAL_FIXTURES` env-var dev fallback or the `POST /api/agents` sidecar-migration path; leave both wired for developer UX

**Acceptance:** public signup via `cloud.arp.run/onboarding` works end-to-end with live Stripe; first 10 live tenants issue connection tokens without incident.

### Task 8 — v2.1 spec endpoints on `cloud.arp.run`

Phase 8.5's v2.1 spec amendment described three endpoints that the current cloud app doesn't yet serve. Ship them so Headless's Option A redirect flow works end-to-end.

1. `GET /onboard?domain=<sld>&registrar=<name>&callback=<url>` — public entry point. Renders a redirect-friendly onboarding page that reuses the existing `did:key` generation flow from `OnboardingForm.tsx`. On success, redirects the user's browser back to `callback` with `?principal_did=did:web:arp.cloud:u:<uuid>&signed_representation_jwt=<jwt>`. JWT signed server-side using the cloud-managed principal key for this tenant.
2. `POST /internal/registrar/bind` — pre-shared-key-gated callback receiver. Body per v2.1 §7. Persists `{domain, owner_label, principal_did, public_key_multibase, representation_jwt}` into a new `registrar_bindings` table. Returns `{ok, tenant_id}`.
3. `GET /u/<uuid>/did.json` — serves the cloud-managed DID document for `did:web:arp.cloud:u:<uuid>` principals. Synthesised from the tenant's principal public key; includes service + principal bindings only if the tenant has a connected agent.

Hard rules:
- Tenant isolation invariant holds — new tables go through `TenantDb` where applicable
- Rate-limit `/onboard` + `/internal/registrar/bind` aggressively; both are public-ish surfaces
- Pre-shared key for `/internal/registrar/bind` rotates at launch; store in `ARP_CLOUD_REGISTRAR_PSK`

**Acceptance:** integration test `tests/phase-9/v2-1-registrar-flow.test.ts` drives all three endpoints end-to-end against a mocked registrar; the JWT produced by `/onboard` verifies against the returned DID doc.

### Task 9 — `POST /api/push/register` on cloud

Carried over from Phase 8 (mobile scaffold conservative call #3). Cloud-side endpoint that accepts `{principal_did, device_token, platform: 'ios'|'android'}` and stores the registration for later dispatch.

1. Add `push_registrations` table (`packages/cloud-db/schema.ts` + migration)
2. Route at `apps/cloud/app/api/push/register/route.ts` — session-authed, tenant-scoped via `TenantDb`
3. Update `arp-mobile/lib/push/register.ts` to stop logging the "404" warning and treat a 200 response as success

**Acceptance:** integration test exercises mobile → cloud registration; the row lands in the right tenant.

### Task 10 — WebAuthn / passkey UX upgrade

Supersedes the Phase-8.5 localStorage key store. Passkey-backed identity means the private key lives in platform hardware (Secure Enclave / TPM) and the user authenticates via Touch ID / Face ID / Windows Hello.

1. Add `@simplewebauthn/server` + `@simplewebauthn/browser` (both free, widely-adopted)
2. Cloud-side: `POST /api/webauthn/register/options` + `.../register/verify` + `.../auth/options` + `.../auth/verify`
3. Owner-app: same four endpoints, same flow
4. Client: `lib/principal-key-passkey.ts` replaces `lib/principal-key-browser.ts` as the default; keep `principal-key-browser.ts` as the recovery-phrase import path for users migrating in
5. Migration UX: on first passkey creation for a user with an existing localStorage `did:key`, surface "Migrate to passkey" banner — binds the new passkey credential to the existing principal DID (so tenant history + connections carry forward)

Hard rules:
- Passkey credential id + public key is what's stored on the server; private key never leaves the device
- Maintain `did:key` as the principal DID method (the passkey is the *authenticator*, not the identity) — this keeps the protocol layer untouched and the migration non-disruptive

**Acceptance:** a user can create + sign in + sign representation JWTs using a passkey on macOS Safari + iOS Safari + Windows Edge; localStorage keys continue to work unchanged for users who haven't migrated.

### Task 11 — HKDF-SHA256 seed migration + identity rotation plan

Phase 8.5 derived the Ed25519 seed as `[...entropy, ...entropy]` (16-byte BIP-39 entropy padded to 32 bytes). Task is to migrate to HKDF-SHA256 without invalidating existing accounts.

1. Add `lib/principal-key-browser.ts::migrateSeedV1toV2()` that:
   - Reads the v1 key + phrase from localStorage
   - Derives the v2 seed from the same entropy via `hkdf(sha256, entropy, salt='arp-v2', info='principal-key', length=32)`
   - **This produces a different did:key.** Treat as an identity rotation, not a silent upgrade.
2. Rotation UX:
   - Banner on login: "Identity upgrade available — recommended." Explains that the tenant's connections, audit log, and Stripe subscription will carry forward; the DID changes.
   - On confirm: new did:key registered against the existing tenant row (`tenants.principal_did_v2` column alongside the existing `principal_did`). Old did:key retained as `principal_did_v1` for historical verification of pre-rotation audit entries.
   - Representation JWTs re-signed under the v2 key; old representation JWTs remain valid (DID doc at `/u/<uuid>/did.json` now carries both verification methods for a 90-day grace period).
3. Phase-10 mobile repo gets the same upgrade path.

Hard rules:
- Don't break historical audit log signatures — maintain both public keys during the grace window
- Default new accounts at v2 immediately (no v1 for new signups after Phase 9 launch)
- Document the rotation as an RFC (RFC-0005: "Principal key derivation v2")

**Acceptance:** a v1 account can rotate to v2 and retain their tenant + subscription + audit history; a v1-signed audit entry from before the rotation still verifies.

### Task 12 — Three new testkit probes

Per `docs/ARP-tld-integration-spec-v2.1.md §6`. Implement in `packages/testkit/src/probes/`:

1. `principal-identity-method.ts` — resolves the `_principal` TXT record's `did=` value via the ARP resolver; asserts both `did:web:` and `did:key:` succeed. Fails if resolution errors or returns a non-DID document.
2. `no-selfxyz-prompt.ts` — optional best-effort probe against the registrar UX HTML. Fetches the registrar's ARP setup page (URL from domain config), searches for literal `self.xyz | Self.xyz | selfxyz`. Warn-only; not blocking.
3. `representation-jwt-signer-binding.ts` — fetches the representation JWT, resolves `iss`, verifies the `kid` references a verification method in the resolved DID doc that can verify the JWT signature. Fails if the key doesn't round-trip.

Update `packages/testkit/src/runner.ts` to include the three new probes. Existing 8/8 audits become 11/11 at Phase 9 launch; Phase-8.5 interim target was 8/8 + new three green on stubbed data.

**Acceptance:** `npx @kybernesis/arp-testkit audit samantha.agent` returns 11/11 after Phase 9 launch.

### Task 13 — DID-pinned TLS bridge in `arp-mobile`

Carried over from Phase 8 conservative call #2. Today `arp-mobile` uses system TLS after DoH resolve; DID-pinning needs a native socket bridge because JS-level fetch doesn't expose the server cert.

1. Native module (Expo config plugin) that surfaces the server certificate fingerprint at connection time
2. JS wrapper that compares fingerprint to the one in the resolved DID document
3. Fail closed if mismatch

Target: `arp-mobile` repo, separate session (docs-only change in monorepo).

**Acceptance:** `arp-mobile` connecting to an agent with a mismatched cert fingerprint refuses the connection; matching fingerprint proceeds.

### Task 14 — npm + GHCR promotion

1. Bump all `@kybernesis/arp-*` packages to `1.0.0`
2. Publish under `latest` tag (currently on `next`)
3. Tag `ghcr.io/kybernesisai/sidecar:1.0.0` and `:latest`
4. Generate a GitHub Release with consolidated changelog
5. Update all READMEs to reference stable versions
6. Update `arp-mobile/lib/arp/` — swap the portable-subset copies for real `@kybernesis/arp-scope-catalog` + `@kybernesis/arp-sdk` deps (Phase 8 conservative call #1 closed)

**Acceptance:** `npm i @kybernesis/arp-sdk` installs 1.0.0; `docker pull ghcr.io/kybernesisai/sidecar:latest` pulls the stable image; `arp-mobile` builds against real deps.

### Task 15 — Status page + uptime

1. `ops/status-page/` — Next.js app, reads from observability API, surfaces:
   - `cloud.arp.run` uptime
   - `samantha.agent` / `ghost.agent` availability
   - Latest incident reports
2. Deploy at `status.arp.run`
3. Automated probes from `@kybernesis/arp-testkit` post results every 5 minutes

**Acceptance:** status page shows live data; a simulated outage is reflected within 1 minute.

### Task 16 — Incident response & on-call

1. `ops/incident-runbook.md` — severity levels, escalation paths, communication templates
2. `ops/on-call-rotation.md` — who's on when, contact info, handoff checklist
3. PagerDuty or similar wired to the observability alerts
4. Tabletop exercise: walk through a simulated tenant-isolation breach

**Acceptance:** on-call rotation configured; one tabletop completed before flip.

### Task 17 — Launch post assets

Not a marketing push — just produce the artifacts a human can use to announce:
1. Blog post draft (~1500 words) at `docs.arp.run/posts/hello-world.mdx`
2. HN-ready one-paragraph summary
3. Demo video script (scripted; actual recording is out of scope for Claude Code)
4. FAQ for the launch discussion
5. No mention of Self.xyz in any launch asset (Phase 8.5 demoted it across docs; keep it out of public-facing copy)

**Acceptance:** assets reviewed internally; a human can publish them without additional work.

---

## 5. Acceptance tests

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm run test
pnpm run lint
pnpm --filter spec-site build
pnpm --filter tests/phase-9 test
npx @kybernesis/arp-testkit audit samantha.agent
npx @kybernesis/arp-testkit audit ghost.agent
npx @kybernesis/arp-testkit audit <headless-test-domain>
# All three audits 11/11 (existing 8 + 3 new probes from Task 12)
```

Plus manual:
- Browse `spec.arp.run` top-to-bottom, verify no dead links, no broken examples
- Run through the `cloud.arp.run/onboard?domain=test.agent&registrar=headless&callback=...` redirect flow end-to-end against a staged Headless test domain
- Verify WebAuthn sign-in on macOS Safari + iOS Safari + Windows Edge

---

## 6. Deliverables

- `spec.arp.run` + `docs.arp.run` public (Fumadocs)
- `arp.run` public landing page
- Spec + docs cover every internal doc we've written; v0.1 versioned
- Stable npm packages at `1.0.0` on `latest` tag + Docker image `sidecar:1.0.0`
- ARP Cloud production with live Stripe + legal pages
- Three v2.1 cloud endpoints live (`/onboard`, `/internal/registrar/bind`, `/u/<uuid>/did.json`)
- `POST /api/push/register` live
- WebAuthn / passkey UX shipped in both apps + migration path from Phase-8.5 localStorage keys
- HKDF-SHA256 seed migration + identity-rotation RFC (RFC-0005)
- 3 new testkit probes green (11/11 total)
- DID-pinned TLS bridge in `arp-mobile`
- Headless v2.1 integration live + `10/10` (or `11/11`) audit on a fresh `.agent` domain
- Status page + incident runbook + on-call rotation

**Mobile App Store + Play Store submissions are Phase 10, not this phase.**

---

## 7. Post-launch (Phase 10+, not this doc)

- **Phase 10 — Mobile public launch.** iOS App Store + Google Play Store submissions. Prereq: Phase 9 ships + Apple Dev account + EAS credentials + Play Console setup. Separate doc `docs/ARP-phase-10-mobile-launch.md` when kicked off.
- Analytics review after 30 days
- First RFC cycle for v0.2 additions (multi-principal agents, ownership transfer, x402 real payments, location scopes, directory service)
- Community governance transition (maintainers beyond the original team)

---

## 8. v0 decisions (do not reopen)

- Fumadocs for docs (not Mintlify, not raw MDX)
- GitHub Discussions primary; expand to Discord only with demand
- Plausible for privacy-respecting analytics
- Instatus or custom Next.js status page (not full incident-management vendor)
- Single launch version: `arp-spec v0.1`, packages `1.0.0` (version mismatch is intentional — the spec is explicitly pre-1.0 while code is shippable)
- **Passkey is the authenticator; did:key is the identity.** WebAuthn credential id + public key go on the server; the principal DID stays `did:key:...`. This keeps the protocol layer untouched and the Phase-8.5 migration non-disruptive.
- **No mention of Self.xyz in any public-facing copy.** Phase 8.5 demoted it; keep it demoted.

---

## 9. Common pitfalls

- **Spec + docs drift is the fastest way to embarrass yourself.** Source every public page from internal docs; never paraphrase.
- **Production Stripe keys in a misconfigured env var have ended careers.** Use Vercel environment variable previews; double-check before flipping.
- **First 48 hours post-launch will surface bugs you didn't expect.** On-call rotation must be real and staffed; don't launch on a Friday.
- **Headless integration tests are a joint operation.** Plan buffer time; their side may uncover issues that need coordination, not heroics.
- **HKDF seed migration rotates every user's did:key.** If Task 11 rolls out before users opt in, you've silently broken their audit-history verification. Treat it as an explicit, user-initiated upgrade — banner + confirm + grace window.
- **WebAuthn migration on Safari/iOS requires user-gesture context.** Trigger registration from a click handler, not a route-load effect — iOS Safari rejects the prompt otherwise.
- **The v2.1 `/onboard` redirect flow is a browser round-trip.** Design it so a callback timeout leaves the user with a visible recovery step, not a stuck page. Store in-progress onboarding state server-side so the user can resume.
