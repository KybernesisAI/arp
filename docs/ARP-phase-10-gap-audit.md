# Phase 10 — Gap audit

**Date:** 2026-04-25
**Why this exists:** after slice 9e, we caught that the cloud app + owner-app + sidecar have real functional gaps — logout was the trigger, but the pattern is deeper: we shipped ownership/identity machinery without wiring the daily-use interaction surfaces (pairing, connections, audit, revocation). This doc inventories every gap honestly so Phase 10 has a clear target.

**Authoritative companion:** `docs/ARP-phase-10-product-completion.md` — the phase brief that consumes this audit.

## Reading this

- **Severity: 🔴 launch-blocker** = product cannot claim its core promise without it.
- **Severity: 🟡 polish** = ship can happen with a known-ugly state; fix in week one.
- **Effort: hours / half-day / day / multi-day.** Estimates based on similar phases, not actual measurements.
- **Three columns per gap: Cloud, Owner-app, Sidecar.** "—" means the surface doesn't apply. "✅ wired" means it actually works end-to-end. "backend-only" means HTTP/protocol works but no UI.

---

## 1. Pairing (agent-to-agent connection establishment)

| Surface | State | Evidence |
|---|---|---|
| Cloud | ❌ no UI, no HTTP route | `apps/cloud/app/pair*` doesn't exist; `@kybernesis/arp-pairing` never imported by cloud app |
| Owner-app | ✅ wired | Full flow: `/pair`, `/pair/scan`, `/pair/accept`, `POST /api/pairing/invitations`, `POST /api/pairing/accept` |
| Sidecar | ✅ wired via owner-app | Owner-app is what the sidecar serves at `localhost:7878` |

**Severity:** 🔴 launch-blocker (cloud).
**Effort:** day (cloud port) + hours (drift fixes to owner-app for did:key primary, design system).
**Notes:**
- Owner-app uses legacy Phase-4 pre-8.5 patterns in a few places (see §7 Owner-app drift).
- Cloud port needs browser-only flow — **invite link with signed payload in URL hash, not camera QR**. Mobile deferred.

## 2. Connection list / detail

| Surface | State | Evidence |
|---|---|---|
| Cloud | 🟡 partial | `/agent/[did]` shows connections for a given agent; no dedicated connections view; no filter/search |
| Owner-app | ✅ wired | `/connections/[id]` detail page |
| Sidecar | ✅ via owner-app | — |

**Severity:** 🟡 polish for cloud; functional today. 🔴 launch-blocker if the pair UI lands without a "what did I pair with?" view.
**Effort:** half-day (cloud).

## 3. Audit log viewer

| Surface | State | Evidence |
|---|---|---|
| Cloud | ❌ no UI | Backend writes via cloud-runtime; UI never built |
| Owner-app | ✅ wired | `/connections/[id]/audit` |
| Sidecar | ✅ via owner-app | — |

**Severity:** 🔴 launch-blocker (cloud). "See what your agent did" is a core product promise.
**Effort:** day (cloud).

## 4. Revocation

| Surface | State | Evidence |
|---|---|---|
| Cloud | ❌ no UI | `@kybernesis/arp-cloud-runtime` supports revoke; no UI button |
| Owner-app | ✅ wired | `/connections/[id]/revoke` page + `POST /api/connections/[id]/revoke` |
| Sidecar | ✅ via owner-app | — |

**Severity:** 🔴 launch-blocker. "Revoke instantly" is a core product promise.
**Effort:** half-day (cloud).

## 5. Logout

| Surface | State | Evidence |
|---|---|---|
| Cloud | ❌ endpoint exists, zero UI callers | `POST /api/auth/logout` + `clearSession()`; no UI button anywhere |
| Owner-app | ❌ endpoint exists, zero UI callers | Same pattern |
| Sidecar | ❌ | Same |

**Severity:** 🔴 launch-blocker.
**Effort:** hours (both apps).

## 6. Error pages (404, 500)

| Surface | State |
|---|---|
| Cloud | ❌ none — Next.js defaults |
| Owner-app | ❌ none |
| Spec-site | ❌ none |

**Severity:** 🟡 polish.
**Effort:** half-day (all three, shared pattern).

## 7. Owner-app drift since Phase 4

Last meaningful touch: Phase 4 (PR #6). Grazed by 8.5 (Self.xyz scrub) + 9c (fixture sweep). Missing:

| Drift | Evidence | Severity |
|---|---|---|
| **No @kybernesis/arp-ui** | `package.json` has `@kybernesis/arp-consent-ui` but not `@kybernesis/arp-ui`; doesn't consume the Phase-8.75 design system preset | 🟡 UX inconsistency with cloud app; 🔴 if branding-parity matters for launch |
| **No passkey support** | Sign-in is challenge/verify with did:key signature only; 9d's WebAuthn never reached owner-app | 🟡 (sidecar users can still log in via recovery phrase / did:key); 🔴 if "one UX across surfaces" matters |
| **No HKDF rotation UI** | 9d's `/api/tenants/rotate` and dual-publish are cloud-only | 🟡 (sidecar users are sovereign — less need for rotation UX); 🔴 for parity |
| **No consistent design tokens** | Own CSS + layout | 🟡 |
| **Session cookie semantics** | May differ from cloud-app's post-9d session; needs re-verification | 🔴 if different |

**Severity overall:** 🟡 for functional — the app works as-is. 🔴 if we want to tell the story of one consistent UX.
**Effort:** day (audit + targeted fixes).

## 8. Dashboard — real data vs shell

### Cloud
| Element | State |
|---|---|
| Principal DID display | ✅ real |
| Agent list | ✅ real (count + row per agent) |
| Connection counts | ⚠️ "ACTIVE / IDLE" badge only — no count in dashboard view itself |
| Agent health (online / offline / last-seen) | ❌ never computed |
| Recent activity widget | ❌ not built |
| Unread / needs-attention (incoming pairing requests, denials) | ❌ not built |
| Empty state | ✅ clean |

**Severity:** 🟡 polish (mostly) — 🔴 for incoming-pairing-request widget once §1 lands (otherwise users won't see invites).
**Effort:** day.

### Owner-app
| Element | State |
|---|---|
| Home page (`/`) | ✅ exists; what it shows — needs audit |

**Severity:** 🟡 audit pending.

## 9. Support / help / contact

| Surface | State |
|---|---|
| Cloud | ❌ no contact page, no `support@arp.run` visible, nothing in footer |
| Owner-app | ❌ |
| Spec-site | ❌ |

**Severity:** 🟡 polish.
**Effort:** hours.

## 10. End-to-end integration tests — what's covered vs not

### Currently green in CI (not a gap — just the baseline):
- Onboarding → tenant → session
- Passkey register / verify / rotate / delete
- Rate limits
- Policy evaluation (Cedar)
- Audit chain writes + verify (Phase 5 hash chain test)
- Revocation propagation (Phase 5 adversarial)
- Cross-connection tenant isolation
- v2.1 registrar flow (`tests/phase-9/v2-1-registrar-flow.test.ts`)
- DID doc dual-publish grace (Phase 9d)

### Missing (Phase 10 adds these):
- 🔴 Full **Cloud↔Cloud pairing round-trip** (tenant A invites, tenant B accepts, token issues, revoke propagates, audit captures)
- 🔴 Full **Cloud↔Sidecar pairing round-trip** (cloud tenant pairs with a local-sidecar agent)
- 🟡 **Sidecar↔Sidecar pairing round-trip** (fully no-cloud path)
- 🔴 **Message round-trip after pairing** (send → policy → reply → audit both sides)
- 🟡 **Policy deny path** (same as above but B's policy denies, audit captures deny)
- 🟡 **Revoke during in-flight** (A sending, B revokes mid-dispatch, clean behavior)
- 🔴 **DID doc dual-publish → old-audit-verify round-trip** (rotate, verify pre-rotation entries still verify via grace DID doc)

**Effort:** day (write these in `tests/phase-10/`).

## 11. Real-world validation

### Requires user infra (samantha.agent + DNS + local sidecar):
- 🔴 `samantha.agent` DNS → sidecar round-trip (public world reaches it)
- 🔴 TLS fingerprint pinning via DID doc
- 🔴 `npx @kybernesis/arp-testkit audit samantha.agent` returns 11/11
- 🔴 Cloud tenant pairs with samantha.agent, exchanges messages
- 🔴 KyberBot (real framework) behind sidecar handles inbound messages correctly
- 🟡 VPS deployment (same as local-sidecar, different host) — validated by documentation only; actual VPS test is post-launch

**Effort:** half-day once the prerequisites in §1 (pairing UI) and §10 (integration tests) are green — most of the validation is running the testkit + the docs walkthrough.

## 12. Polish items (not launch-blocking)

| Item | Surface | Severity | Effort |
|---|---|---|---|
| Support/contact email page | All | 🟡 | hours |
| Error pages (404/500) | All | 🟡 | half-day (shared) |
| Policy editor UI | Cloud + Owner-app | 🟡 | day+ (defer to post-launch) |
| Stripe portal entry point | Cloud | 🟡 | hours (there's a billing page; needs a "manage subscription" → stripe customer portal link) |
| Mobile app pairing / QR scan | Mobile repo | (out of scope for 10) | — |

---

## Phase 10 work summary

Rolled up from above, in dependency order:

| Slice | Work packages (gap references) | Severity | Effort |
|---|---|---|---|
| **10a — Pairing (cloud port + owner-app drift where blocking)** | §1 cloud pairing, §5 logout, §7 owner-app drift (did:key verification + design tokens), §2 connection list polish | 🔴 | 2–3 days |
| **10b — Audit viewer + Revocation (cloud)** | §3, §4, §2 | 🔴 | 1–1.5 days |
| **10c — Dashboard functionality + polish batch** | §8, §6 error pages, §9 support | 🔴 (dashboard), 🟡 (polish) | 1 day |
| **10d — Owner-app parity with cloud patterns** | §7 (remaining drift items), §5 (owner-app logout) | 🟡 | 1 day |
| **10e — End-to-end integration tests + real-world samantha.agent** | §10 + §11 | 🔴 | 1 day programmatic + half-day real-world |

**Total:** 6–8 days focused work before the launch checklist (§1.1 Stripe live, §3.1 npm publish, etc.) becomes relevant again.

**Order critical:** 10a (pairing) blocks 10b (audit viewer — nothing to view without connections) and 10c (dashboard widgets — nothing to widget). 10d and 10e can run in parallel with 10a/b.

---

## Severity roll-up — what would break if we launched today

If slice 9e merged + Stripe went live + npm published tomorrow, the product would ship with:

- ❌ No way to log out
- ❌ No way to pair a cloud agent with anyone
- ❌ No way to see what your agent has been doing
- ❌ No way to revoke a connection from the UI
- ❌ Ugly 404s / 500s
- ❌ No support email if anything breaks

The owner-app (sidecar path) would fare better — it has pairing, audit, revoke — but still no logout, no passkey support, and UX drift vs cloud-app.

**This audit is why we pivoted from "launch polish" to "product completion." The delay is weeks, not days, but the product becomes real.**

---

*Filed during Phase 10 kickoff, 2026-04-25. Update in place as gaps close.*
