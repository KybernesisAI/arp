# Post-9e launch checklist

**Status:** [DRAFT — FOR OPERATOR USE]

**Owner:** Ian Borders. This is the human-in-the-loop list that runs
between slice 9e merging and the production flip (Milestone B).

**Estimated duration:** 1–2 days of focused work, assuming legal + brand
review happen in parallel during the preceding week.

**Principle:** every item has prerequisites + exact commands. If the
step needs a human decision, it says so.

---

## Section 0 — Prep (no product changes)

### 0.1 Legal review

**Prereq:** none (independent of code).

**Action:**

1. Send `apps/cloud/app/legal/terms/page.tsx`,
   `.../privacy/page.tsx`, and `.../dpa/page.tsx` to retained counsel.
2. Counsel returns redlined final copy.
3. Update the three route files + remove the `LegalDraftBanner`
   component usage + strip the `LEGAL-REVIEW-PENDING` marker comment
   + remove the `robots: noindex` directive.
4. Rebuild the middleware test for the `/legal/*` route passthrough
   (already green from slice 9e; no action).

**Exit gate:** `grep -rn "LEGAL-REVIEW-PENDING" apps/` returns empty.

### 0.2 Brand / comms review

**Prereq:** none.

**Action:**

1. Send `apps/spec-site/app/posts/hello-world/page.mdx`,
   `docs/launch/hn-summary.md`, `docs/launch/demo-video-script.md`,
   `docs/launch/faq.md` to Ian + any brand/comms lead.
2. Commit final copy in `post-launch-copy` branch.
3. Remove `[DRAFT]` banners; flip the `robots` meta on the posts index
   + hello-world post from `noindex` to normal.
4. Record the demo video per the script.

**Exit gate:** `grep -rn "DRAFT — FOR PUBLICATION REVIEW" apps/ docs/`
returns empty (or only matches `docs/launch/checklist.md` itself).

### 0.3 Incident runbook dry-run

**Prereq:** `ops/on-call-rotation.md` filled in with real names +
contact details.

**Action:**

1. Assign two engineers to the initial rotation.
2. Both read `ops/incident-runbook.md` end-to-end.
3. Run one tabletop exercise: simulate a SEV1 Neon outage. Walk
   through the runbook for §4.1, validate the escalation ladder, confirm
   the communication template is clear.
4. Capture any gaps found in a follow-up PR.

**Exit gate:** tabletop complete, any runbook gaps filed as GitHub
issues.

---

## Section 1 — Production credentials

### 1.1 Stripe sandbox → live keys

**Prereq:** Stripe account verified for live processing (tax
onboarding, bank account, identity verification). Do this a week
before launch — Stripe's approval can take days.

**Action:**

1. In Stripe dashboard, toggle from `TEST` to `LIVE` mode.
2. Copy the live `STRIPE_SECRET_KEY` (starts with `sk_live_`).
3. Register a new webhook endpoint at
   `https://cloud.arp.run/api/webhooks/stripe`.
4. Copy the live `STRIPE_WEBHOOK_SECRET` (starts with `whsec_`).
5. Update Vercel env vars for **Production**:
   ```sh
   vercel env rm STRIPE_SECRET_KEY production
   vercel env add STRIPE_SECRET_KEY production  # paste live key
   vercel env rm STRIPE_WEBHOOK_SECRET production
   vercel env add STRIPE_WEBHOOK_SECRET production  # paste live secret
   ```
6. Redeploy production: push a no-op commit to `main` (auto-deploy
   fires) or `vercel --prod` from the `apps/cloud` directory.
7. Test: run a real $0.01 charge from your own card + refund it.

**Exit gate:** a live test charge lands in Stripe's live-mode dashboard,
not sandbox.

**Rollback:** revert the two env vars to their sandbox values + redeploy.

### 1.2 Registrar PSK rotation (if not already set)

**Prereq:** Headless Domains has the current PSK.

**Action:**

1. Generate a new PSK: `openssl rand -base64 32`.
2. Update Vercel env:
   ```sh
   vercel env rm ARP_CLOUD_REGISTRAR_PSK production
   vercel env add ARP_CLOUD_REGISTRAR_PSK production  # paste new value
   ```
3. Share the new PSK with Headless over a secure channel (Signal or 1Password).
4. Redeploy production.

**Exit gate:** Headless confirms receipt + a test bind round-trips
against production.

### 1.3 WebAuthn env hardening

**Prereq:** the Phase 9d env vars are set (`WEBAUTHN_RP_ID`,
`WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGINS`).

**Action:**

1. Confirm in Vercel:
   ```sh
   vercel env ls production | grep WEBAUTHN
   ```
   Expected: `WEBAUTHN_RP_ID=arp.run`, `WEBAUTHN_RP_NAME` set,
   `WEBAUTHN_ORIGINS` includes `https://cloud.arp.run`,
   `https://app.arp.run`, `https://arp.run`.
2. If any are missing: `vercel env add <name> production` + redeploy.

**Exit gate:** passkey registration works end-to-end on all three
origins in production.

---

## Section 2 — Vercel Deployment Protection flip

**Prereq:** all prior steps green.

**Action:**

1. Open Vercel → Project `arp-cloud` → Settings → Deployment Protection.
2. Toggle from **"All deployments except custom domains"** to
   **"All Deployments"**. The API rejects this with
   `invalid_sso_protection` on the Pro plan; use the dashboard path.
3. Confirm the change applies to Production + Preview environments.

**Exit gate:** Vercel preview URLs now require Vercel login; custom
domains (arp.run, cloud.arp.run, app.arp.run, spec.arp.run,
docs.arp.run, status.arp.run) remain public.

**Rollback:** toggle back to "All except custom domains".

---

## Section 3 — Package + image publishing

### 3.1 npm publish @ 1.0.0

**Prereq:** `NPM_TOKEN` GitHub repo secret with `automation` scope on
`@kybernesis` org. All packages typecheck + build + test + lint green
on `main`.

**Action:**

1. Bump every `@kybernesis/arp-*` package to `1.0.0`:
   ```sh
   pnpm exec changeset version
   ```
   (or manually edit the `version` field in every `packages/*/package.json`
   to `1.0.0`).
2. Commit as `chore(release): v1.0.0`.
3. Tag: `git tag v1.0.0 -s -m 'v1.0.0'` (signed tag).
4. Push: `git push origin main --tags`.
5. Publish:
   ```sh
   pnpm -r --workspace-concurrency=1 publish --access public --tag latest
   ```
   The `release.yml` GitHub Actions workflow also does this — if it's
   configured + a `NPM_TOKEN` is set, tagging `v1.0.0` fires the
   workflow and you skip the manual publish.
6. Verify: `npm view @kybernesis/arp-sdk` shows `1.0.0` on `latest`.

**Exit gate:** `npm i @kybernesis/arp-sdk` installs 1.0.0 to a fresh
directory.

**Rollback:** `npm deprecate @kybernesis/arp-sdk@1.0.0 "early withdrawal"`.
Do NOT unpublish — it's destructive + permanent for 72 hours.

### 3.2 GHCR sidecar image push

**Prereq:** `GHCR_TOKEN` with `write:packages` on `KybernesisAI` org.
`.github/workflows/image-publish.yml` configured.

**Action:**

1. Trigger the image-publish workflow: `gh workflow run image-publish.yml`.
2. Or manually from a machine with Docker:
   ```sh
   docker build -t ghcr.io/kybernesisai/sidecar:1.0.0 \
                -t ghcr.io/kybernesisai/sidecar:latest \
                -f apps/sidecar/Dockerfile .
   bash scripts/validate-image-size.sh
   echo $GHCR_TOKEN | docker login ghcr.io -u KybernesisAI --password-stdin
   docker push ghcr.io/kybernesisai/sidecar:1.0.0
   docker push ghcr.io/kybernesisai/sidecar:latest
   ```
3. Verify: `docker pull ghcr.io/kybernesisai/sidecar:latest` from a
   machine that's never seen the image.
4. Image signing (optional but recommended):
   `cosign sign ghcr.io/kybernesisai/sidecar:1.0.0`.

**Exit gate:** the image pulls from a cold machine + passes the
image-size probe (≤ 300 MB).

---

## Section 4 — Public site flips

### 4.1 Legal pages — unblock `noindex` + publish

**Prereq:** §0.1 complete.

**Action:**

1. Rename `apps/cloud/app/legal/terms/page.tsx` banner away from the
   draft variant.
2. Remove the `LEGAL-REVIEW-PENDING` comment + `LegalDraftBanner` import.
3. Confirm the `metadata.robots` on each legal page is **not** set to
   `noindex`.
4. Update the footer links (cloud-app marketing, project layout) so
   they now point at `/legal/terms`, `/legal/privacy`, `/legal/dpa`
   instead of `#` placeholders.
5. Merge + push.

**Exit gate:** `https://cloud.arp.run/legal/terms` serves the final
copy with no banner. `view-source:` shows no noindex meta.

### 4.2 Hello-world post flip to public

**Prereq:** §0.2 complete.

**Action:**

1. Remove the `[DRAFT — FOR PUBLICATION REVIEW]` banner from
   `apps/spec-site/app/posts/hello-world/page.mdx`.
2. Remove `robots: { index: false, follow: false }` from both the
   post and `apps/spec-site/app/posts/page.tsx`.
3. Merge + push.

**Exit gate:** `https://spec.arp.run/posts/hello-world` serves publicly +
`view-source:` shows no noindex meta.

### 4.3 Status page — wire live probes (optional, can be deferred)

**Action:**

1. Decide on probe source: BetterStack, StatusCake, custom Vercel
   cron, or the existing `@kybernesis/arp-testkit` nightly workflow
   reporting into a status API.
2. Replace the static `SERVICE_GROUPS` constant in
   `apps/spec-site/app/status/page.tsx` with data loaded from the
   chosen source.
3. Ship as a follow-up PR, not blocking on launch.

**Exit gate:** (deferred) status page reflects real-time probe results.

---

## Section 5 — Headless sign-off (coordinated with Headless Domains)

**Prereq:** §1.2 PSK rotation complete + production v2.1 endpoints
live at `cloud.arp.run`.

**Action:**

1. Headless confirms they've merged the v2.1 §3 UX edits + §4 two-option
   chooser.
2. Purchase a fresh `.agent` test domain from Headless's production
   registrar with the "Set up as ARP agent" option ticked +
   "Use ARP Cloud account" (Option A) chosen.
3. Run:
   ```sh
   npx @kybernesis/arp-testkit@latest audit <test-domain>
   ```
   Expected: 11/11 (eight original probes + three v2.1 probes).
4. Confirm `POST /internal/registrar/bind` landed the row correctly:
   ```sh
   # Against production DB (Ian only)
   SELECT domain, owner_label, tenant_id FROM registrar_bindings
   WHERE domain = '<test-domain>' ORDER BY created_at DESC LIMIT 1;
   ```
5. Headless flips the "Set up as ARP agent" checkbox to public-visible
   on their side.

**Exit gate:** audit is 11/11 + the row has a non-null `tenant_id`.

---

## Section 6 — Mobile follow-ups (arp-mobile repo, separate session)

See `docs/ARP-phase-9-slice-9e-mobile-followup.md` for the mobile-side
todo list. Docs-only in this repo.

---

## Section 7 — Launch day

### 7.1 Pre-flight (morning of launch)

- [ ] All gates green on `main` from the last 24h
- [ ] Status page checked; no degraded services
- [ ] On-call engineer confirmed reachable + has the runbook open
- [ ] Backup on-call engineer confirmed reachable
- [ ] Stripe live mode + webhook verified
- [ ] Neon backup verified (Neon does this automatically; confirm
      retention is ≥ 7 days)
- [ ] Rate-limit thresholds double-checked for expected launch traffic

### 7.2 Publish order

1. **npm packages** (§3.1) — so `npx @kybernesis/arp-testkit audit` works
   for anyone who reads the launch post.
2. **GHCR image** (§3.2) — so `docker pull ghcr.io/kybernesisai/sidecar`
   works.
3. **Legal pages** (§4.1) — compliance-gate before any marketing goes live.
4. **Hello-world post** (§4.2) — the landing for the launch announcement.
5. **HN submission** (`docs/launch/hn-summary.md`) — only after all above.
6. Status page remains as it was (static in 9e unless §4.3 landed).

### 7.3 Post-launch (first 48 hours)

- [ ] Monitor `cloud.arp.run/api/*` error rates every 4 hours
- [ ] Check Stripe for unexpected payment failures
- [ ] Check GitHub for issue influx; triage within 24h
- [ ] Check HN thread every 2 hours during US waking hours; respond
      to substantive questions
- [ ] Don't ship code changes on launch day unless it's a SEV2+ fix

### 7.4 First-week retrospective

Schedule a 1-hour review at T+7 days:

- Incident count + severity breakdown
- Traffic vs expected
- npm download count
- GitHub stars, issues opened, PRs
- Anything in the HN thread + RFC inbox worth acting on
- Lessons learned for Phase 10 (mobile launch)

---

## Section 8 — Known caveats (do not bypass)

- **Do not `npm unpublish`.** Use `deprecate`.
- **Do not force-push `main`.** Fix-forward on hotfixes; the auto-deploy
  will catch up.
- **Do not merge on Fridays.** Launch day or any big flip should be
  Tuesday/Wednesday so you have two full business days before the
  weekend.
- **Do not skip the legal review.** Skeleton placeholder copy is explicitly
  marked `LEGAL-REVIEW-PENDING`; publishing with it violates the hard
  rules in the phase brief.
- **Do not remove `ARP_CLOUD_PRINCIPAL_FIXTURES` yet.** It's still a dev
  fallback; Phase 9 tech-debt ledger lists this for future removal.
