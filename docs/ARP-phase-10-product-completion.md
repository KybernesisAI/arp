# ARP Phase 10 — Product Completion

**Reader:** Claude Code. Directives only.

**Companion docs:** `docs/ARP-phase-10-gap-audit.md` (the audit that scoped this phase), `docs/ARP-phase-9-launch.md` (the launch checklist — paused pending this phase), `docs/ARP-mental-model.md`, `CLAUDE.md §4 + §5`.

---

## 0. Why this phase exists

Slice 9e closed out launch polish. While reviewing, Ian caught that the cloud app had no logout button — a 10-second observation that cracked open a real issue: **we shipped the protocol layer, the ownership/identity surfaces, and the design system, but never wired the daily-use interaction layer on the cloud app.**

The owner-app (Phase 4) has pairing / connections / audit / revocation. The cloud app has none of those exposed in UI. Users on `cloud.arp.run` can create a tenant, onboard with a passkey, and pay — but cannot actually pair with anyone, see what their agent has done, or revoke access.

Phase 10 closes that gap across all three deployment modes (cloud, local sidecar, VPS). Only after Phase 10 merges does the Phase 9 launch checklist (`docs/launch/checklist.md`) become relevant again.

**Out of scope for this phase:** mobile app (Phase 10+ has been defining mobile as a separate post-launch track; this holds). Policy editor UI (deferred). VPS deployment instrumentation (happens via same sidecar image; documented walkthrough only).

---

## 1. Hard rules for this phase

Every invariant in `CLAUDE.md §4` applies. Phase-10-specific:

1. **Browser-only pairing UX.** No mobile QR camera. Invitations are signed payloads shared via URL hash or copy-to-clipboard code. A user on a desktop browser must be able to both *create* and *accept* an invitation without any additional device or app.
2. **Cloud port mirrors owner-app patterns.** The owner-app's pairing / connections / audit / revocation UI is the reference implementation. The cloud port uses the same HTTP surface shapes + same consent-UI primitives — don't reinvent. Use `@kybernesis/arp-ui` for all chrome.
3. **Owner-app drift fixes are additive only.** Don't rip out Phase-4 patterns that work. Upgrade to `@kybernesis/arp-ui`, add passkey + did:key dual-auth, but keep the existing admin-API contract intact. The sidecar's `/admin/*` HTTP surface is the protocol boundary between owner-app and sidecar — do not change it.
4. **No on-wire protocol changes.** Pairing envelope formats, Connection Token shape, audit entry shape, DID doc shape — all frozen. This phase is UI + integration only.
5. **Tenant isolation invariant holds.** Every new DB read/write on the cloud app goes through `TenantDb` unless the route is pre-tenant + explicitly justified.
6. **DIDComm isolation holds.** Only `@kybernesis/arp-transport` imports DIDComm-adjacent libs.
7. **Client components import from `@kybernesis/arp-transport/browser`**, not the root.
8. **No direct push to main + no remote-branch deletion** (permission settings still block both). Use PRs + `gh pr merge --squash`. Local-branch deletion only.
9. **No `npm publish`, no live Stripe flip, no SSO toggle, no HN post.** The Phase 9 launch checklist stays on hold until Phase 10's end-to-end real-world validation (10e) comes back green.
10. **Preserve the existing Phase-9 launch checklist as-is.** `docs/launch/checklist.md` does not get modified by this phase. Once Phase 10 ships, we revisit it.
11. **Every new route / handler gets a test.** No new UI ships without at least a hit test. Every cloud app pairing/audit/revoke route gets a vitest route-test in the `apps/cloud/tests/` pattern.

---

## 2. Slice structure

Phase 10 has **five slices**. Dependency-ordered. Slices 10d + 10e can run in parallel with 10a–c.

### Slice 10a — Pairing (cloud port) + owner-app drift (minimum to unblock)

**Scope:**

1. **Cloud pairing backend** — port `packages/pairing` entry points to cloud HTTP:
   - `POST /api/pairing/invitations` — tenant creates an invitation; server issues a signed payload with challenge + requested scopes + issuer DID + expiry; returns invitation URL `https://cloud.arp.run/pair/accept#<payload>`.
   - `POST /api/pairing/accept` — tenant accepts an invitation (payload in body). Verifies issuer's signature, presents scopes for review, on approval: creates ConnectionToken, stores in `connections` table for both tenants, emits audit entries.
   - `DELETE /api/pairing/invitations/:id` — cancel a pending invitation.
2. **Cloud pairing UI:**
   - `/pair` — page to initiate a new pairing. User picks one of their agents, picks scopes, generates invitation, gets a copy-to-clipboard URL.
   - `/pair/accept` — landing page for invitation URLs. Parses `#<payload>` from URL fragment (server never sees it — keeps the signed payload out of logs). Shows consent screen via `@kybernesis/arp-consent-ui`. Approve/deny.
   - `/dashboard` — add "Incoming pairing requests" widget that polls / lists pending invitations directed at this tenant's agents.
3. **Cloud logout** — button in the AppShell nav. Calls `POST /api/auth/logout` → redirects to `/cloud/login`.
4. **Owner-app drift (minimum to unblock cloud port):**
   - Audit `@kybernesis/arp-pairing` API surface against what owner-app uses. Fix any drift so the API shape is unified.
   - Owner-app logout button added to its nav (same pattern as cloud).

**Out of scope this slice:** cloud audit viewer, cloud revocation UI (those are 10b). Owner-app full design-system migration (that's 10d).

**Hard constraints:**
- Invitation payload signing uses the same primitives as owner-app — don't fork.
- Invitation URL fragment (`#<payload>`) is a hard requirement. Server-side accept route must read the payload from a POST body, not the URL.
- Consent screen renders every requested scope with risk tier + obligations.

**Acceptance gates:** see §4.

### Slice 10b — Cloud audit log viewer + revocation UI

**Scope:**
1. `/connections` — cloud connection list page, showing all connections across all of a tenant's agents. Filter by agent, by peer, by status.
2. `/connections/[id]` — cloud connection detail page. Shows: peer DID, agent DID, scopes, obligations, status, created/updated timestamps, last-message-at. Links to audit + revoke.
3. `/connections/[id]/audit` — cloud audit log viewer. Paginated, filterable by direction (inbound/outbound), decision (allow/deny), date range. Shows message type, policy decision + reason, timestamps.
4. `/connections/[id]/revoke` — cloud revocation page. Confirmation modal, shows what will be invalidated, on confirm: `POST /api/connections/[id]/revoke`, propagation status indicator.
5. `GET /api/connections` — list for the current tenant.
6. `GET /api/connections/[id]` — detail.
7. `GET /api/connections/[id]/audit` — audit entries.
8. `POST /api/connections/[id]/revoke` — revoke.

**Reuses:** owner-app's existing `/api/connections*` routes as the reference shape.

### Slice 10c — Dashboard functionality + polish batch

**Scope:**
1. Cloud `/dashboard` real-time functionality:
   - Per-agent health: `online | offline | last-seen Xm ago`. Derived from last message delivery / probe timestamp in the tenant's audit table.
   - Per-agent connection count (live from DB, not placeholder).
   - Incoming pairing-requests widget (from 10a) — visible with an unread badge if there are any pending.
   - Recent activity strip — last 5 audit entries across all tenants' agents, with links to the relevant connection detail.
2. Error pages (cloud + owner-app + spec-site shared pattern):
   - `not-found.tsx` — branded 404 with "back to dashboard" link.
   - `error.tsx` — branded 500 with a `[TODO: support email]` marker for later.
   - `global-error.tsx` — last-resort branded fallback.
3. Support/contact page at `cloud.arp.run/support` with `support@arp.run` email (placeholder until Ian confirms).
4. Stripe customer portal link on `/billing` — "Manage subscription" button that hits `stripe.billingPortal.sessions.create` and redirects.

### Slice 10d — Owner-app parity with cloud

**Scope:**
1. Add `@kybernesis/arp-ui` dependency + swap owner-app's Tailwind config to consume the shared preset.
2. Port owner-app layout + nav to use `@kybernesis/arp-ui` primitives.
3. Add passkey sign-in option (reuse `@simplewebauthn/*` + the cloud-app's 9d patterns). Recovery-phrase / did:key sign-in stays as an advanced fallback.
4. Add identity rotation UI (HKDF v1→v2) — reuse cloud-app's rotation flow.
5. Match logout button placement + look to cloud.
6. Match error page treatment.

**Out of scope:** rewriting admin-API internals. Changing sidecar protocol. Changing the owner-app routing structure.

### Slice 10e — End-to-end integration tests + real-world `samantha.agent` validation

**Scope:**

1. **Programmatic integration tests** in `tests/phase-10/`:
   - `pair-roundtrip-cloud-cloud.test.ts` — two cloud tenants, full pair + connection token issued both sides.
   - `pair-roundtrip-cloud-sidecar.test.ts` — cloud tenant pairs with a sidecar-hosted agent (in-process PGlite + HTTP fixtures for the sidecar side).
   - `pair-roundtrip-sidecar-sidecar.test.ts` — two sidecars pair (no-cloud-required path).
   - `message-roundtrip.test.ts` — after pairing, A sends, B receives through policy, replies, A receives, audit logs capture both directions.
   - `policy-deny.test.ts` — same as above but B's policy denies; A gets `denied` reason; audit captures deny.
   - `revoke-in-flight.test.ts` — A sending, B revokes mid-dispatch; clean state.
   - `rotate-old-audit-verify.test.ts` — rotate A's identity (HKDF v1→v2), confirm pre-rotation audit entries still verify via the grace DID doc's second verification method.

2. **Real-world validation with `samantha.agent`:**
   - Docs-only updates to `docs/ARP-phase-10-samantha-agent-validation.md` with the exact steps for Ian to stand up a local sidecar against `samantha.agent` DNS.
   - Prereqs: DNS pointed at Ian's public IP (Tailscale Funnel / Cloudflare Tunnel / port forward), Docker installed, one chosen agent framework (KyberBot).
   - Walkthrough: `docker run ghcr.io/kybernesisai/sidecar:1.0.0 init --domain samantha.agent` → sidecar bootstraps → KyberBot connects via adapter → `npx @kybernesis/arp-testkit audit samantha.agent` returns 11/11 → pair a cloud tenant with samantha.agent via URL-fragment invite → send a test message → verify round-trip + audit both sides.
   - Success criteria: every step in the walkthrough completes without human debugging.

**Out of scope:** real VPS deployment testing. Once the local-sidecar path works, VPS is the same Docker image on a different host.

---

## 3. Acceptance gates (across all slices)

Every slice ships with:
- Cold-cache `pnpm install --frozen-lockfile` + typecheck + build + test + lint all green.
- New route tests for every new HTTP route (vitest, PGlite).
- No Self.xyz / selfxyz in any new user-facing copy.
- No DIDComm imports outside `packages/transport/`.
- No `@kybernesis/arp-transport` root imports from client components.
- No direct push to main, no remote-branch deletion.

Phase-level acceptance (required before launch checklist resumes):
- All 5 slices merged to main with auto-deploy green.
- `tests/phase-10/*.test.ts` integration suite green (7 tests from 10e).
- `npx @kybernesis/arp-testkit audit samantha.agent` returns 11/11 against Ian's live domain.
- Manual smoke: fresh browser session → onboard to cloud.arp.run → generate a pairing invitation → open in second browser → accept → exchange messages → revoke → see the revocation in both audit logs → log out.
- Same manual smoke on owner-app against a local sidecar.

---

## 4. Slice-level acceptance — quick reference

### 10a — Pairing + logout
- [ ] `POST /api/pairing/invitations` + `POST /api/pairing/accept` + `DELETE` work end-to-end
- [ ] `/pair` and `/pair/accept` pages render with consent-ui
- [ ] URL fragment (`#`) payload roundtrips without server-side logging
- [ ] Dashboard shows incoming-pairing-requests widget
- [ ] Cloud + owner-app both have logout buttons in nav
- [ ] ConnectionToken rows land in both tenants' DBs after a successful pair
- [ ] Route tests: 6+ scenarios covering happy path, expiry, wrong signature, wrong scope, revoke-before-accept, duplicate-accept

### 10b — Audit + revocation
- [ ] `/connections`, `/connections/[id]`, `/connections/[id]/audit`, `/connections/[id]/revoke` all functional
- [ ] `GET /api/connections*` and `POST /api/connections/[id]/revoke` work
- [ ] Audit pagination + filters work
- [ ] Revocation from cloud propagates; owner-app audit confirms
- [ ] Route tests

### 10c — Dashboard + polish
- [ ] Per-agent health + connection count on dashboard
- [ ] Incoming-pairing widget badge functional
- [ ] Error pages (404/500) render cleanly on all three surfaces (cloud, owner-app, spec-site)
- [ ] `/support` page exists
- [ ] Stripe customer-portal button on `/billing`

### 10d — Owner-app parity
- [ ] `@kybernesis/arp-ui` consumed; design tokens match cloud
- [ ] Passkey sign-in works in owner-app
- [ ] HKDF rotation UI ported
- [ ] Logout + error pages match cloud treatment

### 10e — Integration tests + real-world
- [ ] 7 programmatic tests green in `tests/phase-10/`
- [ ] `samantha.agent` walkthrough doc complete
- [ ] Ian executes walkthrough on his infra → 11/11 testkit + successful pair + message + revoke

---

## 5. Coordinator notes (for the human-in-loop)

- Hold PR #35 (v1.0.0 release) open but unmerged throughout Phase 10.
- Hold Stripe sandbox→live flip.
- Hold SSO toggle.
- Hold npm publish.
- Do NOT set `ARP_RELEASE_ENABLED=true` until Phase 10 end-to-end is green.
- `docs/launch/checklist.md` is authoritative for launch-day sequence — re-read it once Phase 10 merges.

---

## 6. What changed about our overall plan

Before the pivot: Phase 9 slices 9a-9e shipped launch polish, then Phase 9 launch checklist fires production flips.

After the pivot: Phase 9 slices 9a-9e shipped. Phase 10 shipped product completion. **Then** Phase 9 launch checklist fires production flips.

The Phase 9 launch checklist itself is unchanged — it's still the authoritative launch-day runbook. It just doesn't run until Phase 10 is done.

---

*Authored during Phase 10 kickoff, 2026-04-25. Update in place as slices land.*
