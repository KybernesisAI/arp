# ARP Incident Runbook

**Scope:** public surfaces — `arp.run`, `cloud.arp.run`, `app.arp.run`,
`cloud.arp.run/api/*`, `spec.arp.run`, `docs.arp.run`, `status.arp.run`.

**Owner:** [TODO: Ian] — assign a human incident commander before Milestone B.

This runbook is the reference for responding to production incidents. When an
alert fires, the on-call engineer follows this doc top to bottom.

---

## 1. Severity levels

| Severity | Definition | Initial response time | Example |
|---|---|---|---|
| **SEV1** | Data loss, confirmed security breach, or cross-tenant data exposure | Immediate (acknowledge ≤5 min) | Tenant A sees Tenant B's audit log; leaked Stripe webhook secret; principal key compromise |
| **SEV2** | User-facing outage — core flow broken for all users | ≤15 min | `cloud.arp.run` returns 500 on every request; onboarding flow broken; login fails |
| **SEV3** | Degradation — subset of users affected or non-core flow broken | ≤1 hour | `docs.arp.run` partial outage; slow response on one endpoint; auto-deploy failed but site still serving |
| **SEV4** | Non-customer-impacting — internal or cosmetic | Next business day | Status-page typo; expired TLS cert on a preview URL; Slack webhook misconfigured |

### Classification rules

- If a user's **data** is at risk → SEV1 (data loss or leak trumps availability).
- If **authentication is broken** → SEV2 (even if the rest of the app still serves).
- If **billing webhook is failing** → SEV2 (Stripe retries for 72h; beyond that, user billing state desyncs).
- If uncertain between two levels → pick the higher one and downgrade after investigation.

---

## 2. Escalation ladder

```
On-call engineer  →  Tech lead  →  Founder
```

| Role | Contact | Backup |
|---|---|---|
| **On-call engineer** | [TODO: Ian — rotation; see `on-call-rotation.md`] | [TODO: Ian] |
| **Tech lead** | [TODO: Ian] | [TODO: Ian] |
| **Founder** | Ian Borders — ian@darkstarvc.com | — |

Escalation triggers:

- **On-call → Tech lead:** after 15 min with no path to resolution, or any SEV1.
- **Tech lead → Founder:** confirmed SEV1, external communication required, or incident duration > 1 hour for SEV2.
- **Founder:** any incident requiring public comms, legal engagement, or customer refunds.

[TODO: Ian] Escalation mechanism: phone tree? PagerDuty? Shared Slack channel? Document once on-call tooling is chosen (deferred post-slice-9e).

---

## 3. Communication templates

Use these verbatim where possible — consistent language reduces cognitive load
during incidents.

### 3.1 Initial acknowledgement (customer-facing — status page)

```
[INVESTIGATING — SEV<N>] <one-line impact summary>

We are aware of an issue affecting <surface>. We are investigating and will
post an update within 30 minutes.

Started: <ISO timestamp>
```

### 3.2 Mid-incident update (customer-facing)

```
[IDENTIFIED — SEV<N>] <one-line impact summary>

Update at <ISO timestamp>: we have identified the cause as <cause summary>.
<Current mitigation status>. Next update in <duration>.
```

### 3.3 Resolution note (customer-facing)

```
[RESOLVED — SEV<N>] <one-line impact summary>

The incident was resolved at <ISO timestamp>. Impact was <impact summary>.
A post-mortem will be published within <5 business days for SEV1/SEV2, or
10 business days for SEV3>.

Total duration: <HH:MM>.
Affected users: <count or "all users on <surface>">.
```

### 3.4 Internal escalation message

```
ESCALATING SEV<N>:
- Surface: <surface>
- Impact: <one-line>
- Started: <ISO timestamp>
- Current state: <what's been tried>
- I need: <specific ask — review? second set of eyes? decision authority?>
```

### 3.5 Post-mortem skeleton

```markdown
# Post-mortem: <incident title>

- **Severity:** SEV<N>
- **Duration:** <HH:MM>
- **Affected users:** <count / surface>
- **Root cause:** <one sentence>

## Timeline
| Time (UTC) | Event |
|---|---|
| 2026-MM-DDTHH:MM:SSZ | <first detection> |
| ... | ... |

## Root cause (detailed)
<2-3 paragraphs — what happened and why>

## Impact
<what users experienced, how many, for how long>

## Detection
<how we found out; if this was user-reported first, that's a detection gap>

## Response
<what we did; what worked, what didn't>

## What went well
- <bullet>

## What went poorly
- <bullet>

## Action items
| Owner | Due | Action |
|---|---|---|
| [TODO: Ian] | YYYY-MM-DD | <concrete change> |

## Lessons learned
<what we'd do differently>
```

Post-mortems are **blameless**. We write them so the next incident is
prevented, not so someone gets scolded.

---

## 4. Runbook entries

### 4.1 Neon Postgres unavailable

**Symptoms:** `cloud.arp.run/api/*` returns 500; `app.arp.run` dashboard page
shows error state; Drizzle errors in Vercel function logs.

**Check:**

1. [https://neon.tech/status](https://neon.tech/status) — is this their incident or ours?
2. Vercel env vars: is `DATABASE_URL` still set + unchanged?
3. Neon project dashboard → branch health.

**Mitigation:**

- If Neon is down: post SEV2 status; wait for their resolution. We don't
  run a read replica in v0.
- If connection limits exhausted: Neon HTTP driver pools per-invocation, so
  this should be rare; if it happens, check for a stuck function (see
  Fluid Compute logs).
- If `DATABASE_URL` got nulled (env var misconfiguration): restore via
  Vercel dashboard; redeploy.

**Follow-up actions:**

- [TODO: Ian] Document the Neon recovery target (RTO) we can commit to.
- [TODO: Ian] Consider Neon's backup/restore flow for SEV1 data loss cases.

---

### 4.2 Vercel deployment failing

**Symptoms:** `main` push doesn't appear on the live site; GitHub Actions
"Deploy" workflow red; `vercel --prod` on a manual retry also fails.

**Check:**

1. `.github/workflows/deploy.yml` — has it changed recently? Was a step renamed?
2. `VERCEL_TOKEN` repo secret: expired? Rotated accidentally?
3. Vercel status: [https://www.vercel-status.com](https://www.vercel-status.com)
4. `pnpm run build` locally — does it pass? If not, it's a code issue.

**Mitigation:**

- If a codegen step is broken (e.g. `prebuild`): fix on a branch, merge, auto-deploy re-fires.
- If Vercel is down: we have no SaaS fallback in v0. Post SEV3 (site serves the last deployment).
- If `VERCEL_TOKEN` expired: [TODO: Ian] rotate + update the secret; document where the token lives.

**Follow-up actions:**

- Roll forward, don't roll back, unless the most recent deploy is the
  cause of the incident. Vercel's "Promote" button reverts to any prior
  deployment — this is the fastest SEV2 mitigation if the bad deploy is
  code-based.

---

### 4.3 Stripe webhook storm

**Symptoms:** Vercel function logs show repeated `/api/webhooks/stripe`
invocations; `stripe_events` table growing; user billing state updates
delayed.

**Check:**

1. Stripe dashboard → webhook endpoint at `cloud.arp.run/api/webhooks/stripe` — error rate, retry count.
2. `stripe_events` table: `SELECT count(*) FROM stripe_events WHERE received_at > now() - interval '10 minutes'`.
3. Signature verification: is `STRIPE_WEBHOOK_SECRET` current?

**Mitigation:**

- If signature check is failing: confirm `STRIPE_WEBHOOK_SECRET` matches
  the signing secret in Stripe dashboard. Rotate if compromised.
- If we're slow to process (and Stripe is retrying): the handler is
  idempotent via `stripe_events` PK dedup — a replay is safe. Scale concerns
  only kick in at very high volume.
- If a specific event type is crashing the handler: filter it out in
  Stripe dashboard temporarily; fix the handler; re-enable.

**Follow-up actions:**

- [TODO: Ian] Set a SEV3 alert for `stripe_events` row count delta > N per 10 min.

---

### 4.4 Rate-limit table bloat

**Symptoms:** Slow writes on rate-limited endpoints; `rate_limit_hits` row
count climbing faster than sweep can clear.

**Check:**

1. `SELECT count(*) FROM rate_limit_hits` — expected: a few hundred rows.
2. Recent traffic patterns: is there a burst of legitimate traffic or an
   attack?
3. Opportunistic sweep runs on 1/1000 requests — low traffic means slow
   sweep.

**Mitigation:**

- **Manual sweep:** `DELETE FROM rate_limit_hits WHERE expires_at < now()
  - interval '1 day'`.
- **Tighten limits:** edit `apps/cloud/lib/rate-limit.ts` + ship a hotfix
  if a specific endpoint is abused.
- **Block the source:** if a single IP is hammering us, add it to the
  Vercel firewall (dashboard → Firewall → IP block).

**Follow-up actions:**

- If this becomes a regular thing, the runbook says consider a dedicated
  Redis-backed rate limiter. Until then, the DB-backed one is fine.

---

### 4.5 Principal key (PSK) compromise

**Symptoms:** Unexpected `/internal/registrar/bind` calls with unknown
domains; Headless reports an unexpected binding; suspicious registrar_bindings
rows.

**Severity:** SEV1.

**Check:**

1. `SELECT * FROM registrar_bindings WHERE created_at > now() - interval '24 hours'` — anything unexpected?
2. Vercel function logs for `/internal/registrar/bind` — caller IPs, timing.
3. Ask Headless: did they receive an ARP setup request they didn't expect?

**Mitigation:**

1. **Rotate `ARP_CLOUD_REGISTRAR_PSK` immediately** — generate new via
   `openssl rand -base64 32`, update Vercel env, redeploy.
2. Share new PSK with Headless over secure channel.
3. Invalidate suspicious bindings:
   `UPDATE registrar_bindings SET status = 'revoked' WHERE …` (add a status
   column if missing; document in the PM action items).
4. Post SEV1 status update; notify affected tenants directly if any
   binding landed in a wrong row.

**Follow-up actions:**

- [TODO: Ian] Document PSK rotation cadence (quarterly minimum).
- [TODO: Ian] Add monitoring for `registrar_bindings` insert anomalies.

---

### 4.6 Passkey / WebAuthn service disruption

**Symptoms:** Users can't register or sign in with passkeys; error rate on
`/api/webauthn/*` endpoints elevated.

**Check:**

1. Which endpoint? Register or Auth? Options or Verify?
2. `@simplewebauthn/server` version — any recent bump?
3. `WEBAUTHN_RP_ID` + `WEBAUTHN_ORIGINS` env vars — still match the live origin?
4. `webauthn_challenges` table — row count sane?

**Mitigation:**

- If config is wrong: fix env vars; redeploy.
- If a specific browser is failing (e.g. Safari after an update): check
  `@simplewebauthn/server` GitHub issues for known regressions.
- If the challenge table is swamped: sweep expired rows manually (similar
  to 4.4).
- **Important fallback:** localStorage did:key auth is still wired as a
  recovery path. Users with a recovery phrase can import it and sign in
  without a passkey.

**Follow-up actions:**

- [TODO: Ian] Consider adding a passkey-health probe to the status page
  post-launch.

---

### 4.7 DNS / domain disruption

**Symptoms:** `arp.run` or any subdomain fails to resolve; visitors see
browser DNS errors.

**Check:**

1. `dig arp.run` — what nameservers answer?
2. Vercel dashboard → Domains — is the domain still verified?
3. Registrar dashboard — still pointing at Vercel nameservers?

**Mitigation:**

- Vercel manages DNS for `arp.run` (as of Milestone A). If their DNS is
  down, this is a Vercel SEV, not ours.
- If the registrar delegation was changed: revert at the registrar.
- If a subdomain record was deleted: re-add in Vercel Domains.

**Follow-up actions:**

- [TODO: Ian] Document the registrar account + who has access.

---

## 5. Post-incident checklist

Within 24 hours of an incident resolving:

- [ ] Status page marked resolved with a short public summary
- [ ] Internal Slack / email notification sent to the team
- [ ] Post-mortem doc created from the skeleton (§3.5)
- [ ] Post-mortem scheduled for review within the committed SLA
- [ ] Action items filed with owners + due dates

## 6. Reference

- `docs/launch/checklist.md` — launch checklist (post-9e)
- `packages/cloud-db/migrate-once.mjs` — migration runner (out of repo; gitignored)
- `apps/cloud/lib/rate-limit.ts` — rate-limit thresholds
- `apps/cloud/lib/webauthn.ts` — passkey helpers
- `.github/workflows/deploy.yml` — auto-deploy
