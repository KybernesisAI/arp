# On-call Rotation

**Status:** [TODO: Ian] — not yet staffed. This doc is the template to be
filled in before Milestone B (production flip).

---

## 1. Rotation structure

**Shift length:** [TODO: Ian — recommended: 1 week, handoff Monday 10:00 Bangkok time]

**Rotation frequency:** [TODO: Ian — recommended: round-robin across named engineers]

**Minimum size:** 2 people. One is not a rotation; it's a single point of
failure.

**Coverage:** 24/7 for SEV1/SEV2. SEV3/SEV4 can wait for business hours.

---

## 2. Current rotation

| Week of | Primary | Backup |
|---|---|---|
| [TODO: Ian] | [TODO: Ian] | [TODO: Ian] |
| [TODO: Ian] | [TODO: Ian] | [TODO: Ian] |

---

## 3. Contact methods

[TODO: Ian] Fill in the preferred contact methods for each on-call engineer.

| Method | Use when |
|---|---|
| [TODO: Ian — phone?] | SEV1/SEV2 — guaranteed human response |
| [TODO: Ian — Slack DM?] | SEV3/SEV4 — async acknowledgement acceptable |
| [TODO: Ian — email?] | Post-incident reviews, non-urgent follow-ups |

Every on-call engineer publishes their preferred channels here + the
expected response times.

---

## 4. Handoff checklist

At the end of every rotation, the outgoing on-call engineer transfers state
to the incoming engineer. Use this checklist verbatim:

- [ ] Any open incidents? Link them; summarise current state.
- [ ] Any ongoing mitigations that need to continue? (e.g. manual sweep of
      a swollen table, Stripe webhook backfill running).
- [ ] Any pending post-mortems? When are they due?
- [ ] Any known-degraded services? (Even if we haven't declared an incident.)
- [ ] Any customer comms in flight? (Support tickets, email threads,
      Slack channels to monitor.)
- [ ] Any upstream vendor outages being tracked? (Neon, Vercel, Stripe.)
- [ ] Any recent deploys worth knowing about? (Last 48h of `main`.)
- [ ] Status page: any manual updates needing to carry forward?
- [ ] Monitoring tools: all access confirmed for the incoming engineer?

Handoff happens live (voice or video), not async. This is the one ritual
that's worth protecting.

---

## 5. Monitoring tools

[TODO: Ian] Document the specific tools + URLs once wired up.

| Tool | URL | Purpose | Access |
|---|---|---|---|
| Vercel dashboard | https://vercel.com/ian-darkstarvccs-projects | Deployments, domains, env vars, function logs | [TODO: Ian — which engineers have access?] |
| Neon dashboard | [TODO: Ian] | Postgres health, branch state, recent queries | [TODO: Ian] |
| Stripe dashboard | https://dashboard.stripe.com | Webhooks, event log, charges | [TODO: Ian] |
| GitHub | https://github.com/KybernesisAI/arp | Actions, repo access | Team GitHub org |
| Status page | https://status.arp.run | Public incident updates | Editable via `apps/spec-site/app/status/page.tsx` PRs |
| [TODO: Ian] Uptime monitoring | — | Live probes | — |
| [TODO: Ian] Error tracking | — | Sentry or equivalent | — |
| [TODO: Ian] PagerDuty / Opsgenie | — | Alert routing | — |

---

## 6. Compensation

[TODO: Ian] If on-call is compensated (either via pay, time-in-lieu, or
rotation credit), document it here. This is a morale item — don't skip.

---

## 7. Escalation flow

See `incident-runbook.md §2` for the full escalation ladder. Summary:

```
On-call engineer  →  Tech lead  →  Founder
```

The on-call engineer is the **incident commander** for SEV2/SEV3/SEV4. For
SEV1, the tech lead or founder assumes command once notified.

---

## 8. Known gaps (post-slice-9e)

These are intentionally deferred; flag them in the launch checklist review:

- No PagerDuty / Opsgenie integration.
- No uptime monitoring with automatic alerting (status page is static in slice 9e).
- No formal tabletop exercise scheduled.
- No secondary on-call region (single-timezone team for v0).
