# AgentID — production readiness checklist

**Status:** working list, opened 2026-09-29 after the domain migration. Everything a customer can touch, end to end, and what is missing before we call it production. Ordered by what blocks a paying stranger from using the product without us in the room.

## 0. Decisions only Ian can make
- ~~**Pricing model.**~~ **Decided 2026-09-29: lander model, built (PR #266).** The lander sells *Name $29/year* + *Connect $5/month* + *Payments (soon)*. The console bills the older *Free / Pro per agent* model (`STRIPE_PRICE_PRO_PER_AGENT`, "Upgrade to Pro"). One of them has to go. Recommendation: the lander model — name checkout already exists; Connect becomes a monthly subscription that unlocks pairing. Ian confirms prices, then I wire it.
- ~~**Renewals.**~~ **Decided 2026-09-29: auto-renew + 30/7/1 reminders, built (PR #266); the supplier step is an ops email until the registrar exposes renewal.** Names are sold for 1–3 years; nothing renews them. The supplier renews only via machine payment (MPP); our side has no renewal job, no reminder, no card charge. Decision: (a) auto-renew from the card on file and pay the supplier ourselves, or (b) reminders + manual "Renew" button. Recommendation: (a) with reminders at 30/7/1 days.
- **Mail receiving** for `support@ / security@ / privacy@ / legal@ / hello@agentid.dev` (no MX today: those addresses bounce). Pick Resend inbound, a forwarder (ImprovMX), or Google Workspace; I add the records.
- **Legal entity + address** for Terms/Privacy/DPA, and who answers `privacy@`.

## 1. Ian's own account (one-off, only his key can do it)
- Sign in on `cloud.agentid.dev` (email code), bring the key over ("Add another device" from `cloud.arp.run/account` while it still exists, or the recovery phrase), re-register the passkey (domain changed).
- Press **Refresh ownership proof** on each of the 13 names (proofs still name the old console).
- Publish `@kybernesis/identity@0.4.0` (platform PR #78); then Kyber + Sid `npm install @kybernesis/identity@0.4.0`.
- Rotate the keys minted through the browser during build (Resend `arp-cloud-agentid`; delete `arp-cloud`, `arp-cloud-2`), rotate `ARP_CLOUD_KEY_ENCRYPTION_KEY`/`CRON_SECRET` only if they were ever exposed (they were not).

## 2. Third parties
- **Stripe:** ✅ live products/prices/webhook created 2026-09-29. **Open: `STRIPE_SECRET_KEY` on Vercel is test-mode — Ian sets the live key.** Customer portal branding; tax settings.
- **Headless (registrar supplier):** "Setup" links → `cloud.agentid.dev`; HNS-side records for early names → `<sld>.agentid.dev`; confirm their webhooks target `cloud.agentid.dev/api/webhooks/headless`; ask about renewals by card or an API path we can call.
- **Vercel:** detach `arp.run`, `cloud.arp.run`, `app.arp.run`, `agent.arp.run`, `*.agent.arp.run` once 1 + Stripe are done. `arp.run` then hosts only the protocol landing/spec/docs from this app (or moves out).
- **Railway:** alerting on the gateway (see 4).

## 3. Build — customer path, in order
1. **Docs + design sweep** (in flight 2026-09-29): `/docs` guides; 404/error/legal/support/onboard in the new design; old marketing tree deleted.
2. **Billing rebuild** to the chosen model: name checkout (exists) → identity auto-created on payment (today a "Create identity" click) → renewal (see 0) → Connect subscription gating pairing → one Billing page that shows names, renewal dates, add-ons, invoices.
3. **Transactional email** (only sign-in codes exist): receipt/confirmation on claim, renewal reminders, "someone wants to pair" + "approved" notifications, gift received, ownership verified, new device added. One template style, from `@agentid.dev`.
4. **Onboarding funnel**: create account → claim → connect in one flow with progress, plus empty states on every console page; "Create identity" removed as a manual step.
5. **Mobile pass** on every console page (dashboard cards, pair page QR, account, connections).
6. **Public page polish**: SEO metadata/OpenGraph image per name, sitemap, robots; badge share image.
7. **Remove dead code**: `ProvisionAgentButton`, `SelfTestConnectionButton`, `DeleteAgentButton`, Swiss components no page uses, `ARP_CLOUD_PRINCIPAL_FIXTURES` path, `/agent/[did]` legacy page if unused.

## 4. Build — operations
- **Gateway self-healing:** `/health` probes the DB (2 s) → 503; exit after N consecutive connect failures so Railway restarts it (the 09-21 outage; connect retry shipped in #262).
- **Monitoring + alerts:** uptime checks on `agentid.dev`, `cloud.agentid.dev/cloud/login`, `gateway.agentid.dev/health`, one mirror `did.json`; error alerts from Vercel + Railway to Ian's inbox/phone; PostHog funnel events (claim started/paid, connected, paired).
- **Status page** at `status.agentid.dev` (today: none; footers link nowhere).
- **Backups/restore:** Neon PITR confirmed + a restore drill; key-encryption key escrow.
- **Security headers** (CSP, HSTS), dependency audit in CI, `pnpm audit` gate, secret scanning; rate limits reviewed on every public route (exists on most).
- **Runbook**: the handoff notes become `docs/runbook.md` (deploy app, deploy gateway, migrate DB, rotate keys, recover gateway, read logs).

## 5. Done-when
- A stranger can: create an account, claim a name by card, see it renew automatically, connect an agent by pasting a URL, pair with another owner, change/pause/end a connection, get every email above, sign in from a second device, recover with the phrase — with no one from Kybernesis involved.
- Every page on `agentid.dev` and `cloud.agentid.dev` is in the one design; no engineering vocabulary on any owner-facing surface; no link to arp.run.
- Gateway or database blips recover without a human; someone is paged when they do not.
