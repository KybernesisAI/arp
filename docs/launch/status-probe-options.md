# Status page probe source — options + recommendation

**Context:** `apps/spec-site/app/status/page.tsx` currently ships with a
static `SERVICE_GROUPS` array hard-coded to `operational`. §4.3 of the
launch checklist defers the probe-source choice to post-launch week 1.
This doc frames the four realistic options so the decision isn't made
cold.

**Scope:** only the *data source* for the status page. The UI + rendering
are already done — pick a source, plug it in, ship a follow-up PR.

**Recommendation at the bottom.** Skip the comparison if you want
just the answer.

---

## What a status-probe source has to do

1. Run ARP's existing `@kybernesis/arp-testkit` audit against each public
   endpoint (or a thin subset) every 1–5 minutes.
2. Persist the result somewhere the status page route can read.
3. Distinguish `operational` / `degraded` / `down` based on probe results.
4. Surface incidents (ideally: auto-detected from degraded windows of
   N consecutive failures; manually supplemented via a GitHub-issue flow
   or equivalent).

All four options below can do (1)–(3). Only two do (4) well out of the
box.

---

## Option 1 — Vercel Cron + `@kybernesis/arp-testkit` + Neon

**Shape:** one Vercel Cron job runs the testkit against our own endpoints
every 5 minutes; writes a row to a new `status_probes` table in the
existing Neon DB; status page route reads the latest rows.

**Cost:** free (Vercel Cron is included on Pro; Neon writes are tiny).

**Pros:**
- Zero new external service. One fewer vendor dependency + one fewer
  credential to rotate.
- Probes already exist — testkit is our own tool. We dogfood it.
- Probe code lives in-repo; changes flow through normal CI/PR review.
- Tenant-isolation boundary stays clean: status data lives in a table
  that's NOT scoped to any tenant.
- If Neon goes down, the status page correctly shows nothing (and can
  fall back to a "DB unreachable" banner in the route).

**Cons:**
- Incident detection + commentary is manual. No "acknowledge incident,
  post ETA, close" workflow. A text box + a `status_incidents` table is
  ~100 LOC of UI we'd need to add.
- Probe runs from Vercel's region only. Can't measure "how does it look
  from Europe?"
- Vercel Cron has a 5-minute minimum interval on most plans. Sub-minute
  resolution requires a different approach.
- No alerting built in. If a probe fails, nobody gets paged unless we
  bolt on a webhook → PagerDuty/Opsgenie.

**Effort:** ~1 day. Schema + cron + page data loader + minimal incident
UI.

---

## Option 2 — BetterStack (formerly Better Uptime)

**Shape:** BetterStack runs probes from multiple regions, hosts the
status page itself, provides an API we read from OR we embed their
widget.

**Cost:** ~$29–$79/month depending on tier + monitor count.

**Pros:**
- Multi-region probes. Real user-experience signal.
- First-class incident management. Acknowledge, timeline, ETA, public
  comments, subscribers, email/Slack alerting.
- Sub-minute probe intervals on paid tiers.
- API + embed options — we can keep our own status page design and
  pull data from BetterStack, or use theirs and redirect.
- Built-in "All systems operational" -> subscribers-via-email flow.

**Cons:**
- Monthly cost.
- Another credential to manage (API token + webhook URLs).
- Their probes can only see what they can hit from the public internet.
  Anything behind our Vercel SSO wall is invisible. (Public surfaces are
  the only things worth probing, so this is mostly a non-issue.)
- If we go embed-widget, we lose design control (back to BetterStack's
  Swiss-sans-esque aesthetic — close to ours but not identical).
- We'd probably still want to run the testkit separately for deeper
  probes (scope-catalog integrity, JSON schema validity, etc.) that
  BetterStack can't express.

**Effort:** ~half a day. Sign up, configure monitors, plug API into our
status page loader.

---

## Option 3 — StatusCake / UptimeRobot / Other generic uptime

**Shape:** same category as BetterStack — public-internet uptime service.
UptimeRobot has a free tier (50 monitors, 5-min interval); StatusCake has
a similar free tier.

**Cost:** free to $10–$50/month.

**Pros:**
- Cheap or free entry.
- Multi-region.

**Cons:**
- Incident management is generally weaker than BetterStack. More "up /
  down" ping, less "here's what's happening, subscribe for updates."
- Widget / API quality varies. Some lock the good stuff behind paid
  tiers.
- Same "can't run deep probes" limitation as BetterStack.

**Effort:** ~half day.

---

## Option 4 — The existing nightly testkit workflow as-is

**Shape:** `.github/workflows/testkit-nightly.yml` already runs the full
audit suite nightly. We'd extend it to emit a JSON blob to a
`status.json` file in a tiny S3 / Vercel Blob bucket / GitHub Pages
artifact, then the status page reads from there.

**Cost:** free. Reuses existing infra.

**Pros:**
- Zero new services.
- Reuses the actual compliance suite — the most honest signal we could
  offer ("here's how we did on 11/11 tonight").

**Cons:**
- Nightly only. 24-hour latency on "something broke." Useless as a
  real-time status page.
- GitHub Actions scheduled workflows have a skew of up to ~30 minutes
  from the declared `cron:` time.
- Doesn't distinguish "degraded RIGHT NOW" from "degraded 18 hours ago
  and long since fixed."

**Effort:** ~1–2 hours. But it's the wrong fit for a public status page.

---

## Recommendation

**Option 1 (Vercel Cron + testkit + Neon) for week 1, optionally layer
Option 2 (BetterStack) once we have real users.**

Reasoning:

1. **Option 1 ships in a day, costs nothing, and uses our own tools.**
   On launch day, a static status page is fine (Vercel uptime will keep
   it honest). A week in, swap the static `SERVICE_GROUPS` for a loader
   that hits the `status_probes` table. Ship as `feat(spec-site): live
   status probes via Vercel Cron + testkit`. No new vendor, no new
   credential, no new cost.

2. **BetterStack's real value is incident management + subscribers.**
   Until we have enough paying customers that a public incident timeline
   matters, we don't need it. Re-evaluate at 90 days: if any one
   incident's "what's the ETA?" question came up publicly, we missed
   our moment to have BetterStack ready.

3. **Options 3 and 4 are dominated.** Option 3 is BetterStack-but-worse-for-same-workflow;
   Option 4 is too slow for a status page. Neither is a reason to delay.

### Concrete week-1 plan (if Option 1 is picked)

```
chore: migration 0005 — status_probes table
  id UUID PK
  service_group TEXT (arp.run / cloud.arp.run / spec+docs / status / app)
  status TEXT CHECK (operational | degraded | down)
  probe_ms INTEGER
  error TEXT (nullable)
  checked_at TIMESTAMPTZ

feat(spec-site): Vercel Cron job /api/cron/status every 5 min
  - imports @kybernesis/arp-testkit
  - runs a light subset of probes against our own public endpoints
  - INSERTs into status_probes

feat(spec-site): /status page data loader
  - SELECT latest row per service_group FROM status_probes
  - Falls back to 'unknown' if no row in last 15 min
  - Renders with the existing UI primitives

feat(spec-site): /api/cron/status auth guard
  - CRON_SECRET env var; reject unauthed invocations
```

~1 day total. Ship as a standalone PR; no launch-day dependency.

### If we pick BetterStack later

The status page loader becomes a fetch from `betterstack.com/api/v2/monitors`
(or similar) with a token. Same `SERVICE_GROUPS` constant becomes a monitor
list. Swap takes ~2 hours. The Vercel Cron job and Neon table can either
stay (as deeper-probe backup) or get retired.

---

*Authored 2026-04-24 as part of Phase 9 launch-checklist prep (§4.3).
Revisit post-launch-week-1 when we have real traffic patterns.*
