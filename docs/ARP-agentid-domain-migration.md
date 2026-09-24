# AgentID domain migration — everything on agentid.dev

**Status:** brief, locked 2026-09-24 (Ian). **Decision:** AgentID is the product and owns every address a person or a machine touches. ARP is the protocol underneath; no product URL points at arp.run. **Clean cut, no compatibility layer:** Ian is the only user and every identity is his, so nothing issued so far needs to keep working — arp.run hosts are simply removed from the app once agentid.dev is live.

## 1. Target layout

| Surface | Today | Target |
|---|---|---|
| Lander | `cloud.arp.run/lander` (and `agent.arp.run` marketing) | `agentid.dev` |
| Agent profile (human) | `agent.arp.run/<sld>` | `agentid.dev/<sld>` |
| Badge stage | `agent.arp.run/badge?name=` | `agentid.dev/badge?name=` |
| Console | `cloud.arp.run`, `app.arp.run` | `cloud.agentid.dev` |
| Identity machine surface (DID doc, card, avatar, profile JSON, pairing, A2A, NIP-05, representation JWT) | `<sld>.agent.arp.run` | **`<sld>.agentid.dev`** (config value; `<sld>.agent.agentid.dev` also possible) |
| Gateway | `gateway.arp.run` | `gateway.agentid.dev` |
| Cloud-managed principal DID docs | `cloud.arp.run/u/<uuid>/did.json` (`did:web:cloud.arp.run:u:<uuid>`) | `cloud.agentid.dev/u/<uuid>/did.json`; Ian's existing owner proofs are re-signed once from the console (they carry the issuer URL) |
| Sign-in / notification mail | `sign-in@notifications.kybernesis.ai` | `sign-in@agentid.dev` |
| Short pairing links, gift links | `cloud.arp.run/i#…`, `/gift#…` | `cloud.agentid.dev/i#…`, `/gift#…` |
| Protocol spec + docs + status | `spec.arp.run`, `docs.arp.run`, `status.arp.run` | unchanged — protocol material only; the product links to `docs.agentid.dev` if/when product docs exist |

Reserved names (registration refuses them) grow to cover every hostname and root path: `www cloud gateway status docs spec api mail admin app agent agentid badge i gift pair connections names account dashboard billing onboarding login support legal pricing lander assets u internal onboard runtime` plus the registrar's 17.

## 2. Approach

Hard cutover. Every hostname comes from one config; flip it, redeploy, re-issue the handful of artefacts that carry a URL (cards, owner proofs, the two runtime files on Kyber and Sid), delete the arp.run host handling. No redirects, no alias hosts, no legacy tables.

## 3. Sequence

### Step 0 — Ian: DNS and accounts (human decisions)
1. Nameservers for `agentid.dev` → Vercel (wildcard `*.agentid.dev` certificates need Vercel DNS).
2. Vercel project `arp-cloud`: add domains `agentid.dev`, `cloud.agentid.dev`, `*.agentid.dev`.
3. Railway service `arp-cloud-gateway`: custom domain `gateway.agentid.dev` (CNAME in Vercel DNS as Railway prints it).
4. Resend: add + verify `agentid.dev` (DKIM/SPF/DMARC records in Vercel DNS); set `EMAIL_FROM="AgentID <sign-in@agentid.dev>"` on Vercel.
5. Env on Vercel (Production + Preview), set at cutover (step 3), not before:
   `SITE_ORIGIN=https://agentid.dev` · `CONSOLE_ORIGIN=https://cloud.agentid.dev` · `AGENTID_MIRROR_SUFFIX=.agentid.dev` · `ARP_CLOUD_GATEWAY_ORIGIN=https://gateway.agentid.dev` · `WEBAUTHN_RP_ID=agentid.dev` · `WEBAUTHN_ORIGINS=https://agentid.dev,https://cloud.agentid.dev` · `PRINCIPAL_DID_WEB_HOST=cloud.agentid.dev`.
   Railway gateway: `PUBLIC_ORIGIN=https://gateway.agentid.dev`, `AGENTID_MIRROR_SUFFIX=.agentid.dev`.

### Step 1 — Origins refactor (no visible change)
- `apps/cloud/lib/origins.ts`: `site`, `console`, `profile(sld)`, `mirror(sld)`, `gateway`, `protocolDocs`, `status`, `emailFrom`, all env-driven with today's values as defaults.
- Replace every hardcoded hostname (138 in `apps/cloud`, 56 files in packages/other apps, 4 in `~/platform/packages/identity`). Middleware host dispatch becomes a table keyed by the configured hosts.
- Templates (`packages/templates`), gateway (`packages/cloud-runtime`, `apps/cloud-gateway`), testkit (`--resolver mirror` suffix), `arpc`, identity package default gateway → all read the same config.
- Reserved-name list (§1) enforced in `lib/registrar.ts` search + checkout.
- Tests: middleware dispatch driven by config, reserved names, DID-doc/card generation under a configured suffix.

### Step 2 — Verify on the new domain
- Deploy with the agentid.dev env on Preview (or briefly on Production) and walk through: console (login by key/email/passkey, dashboard, names, pair + short link + QR, connections edit/revoke, account, device link), profiles + badge, mirror machine paths for every prod identity, gateway health + push round trip on Kyber ↔ Sid, `npx @kybernesis/arp-testkit audit kyber.agent --resolver mirror` against the new suffix.

### Step 3 — Cutover
1. Flip env (Step 0.5) on Vercel + Railway; deploy both.
2. Re-sign stored cards for cloud-custody identities (existing rebuild-cards job) and bump `agents.profile_updated_at` so avatar URLs refresh.
3. Reconnect Kyber and Sid from the console (one-click connect writes the new gateway into `.eve/arp-identity.json`); identity package `0.4.0` with the new default gateway — **Ian publishes**.
4. Re-verify identity links (control plane, Buzz NIP-05) — they resolve by DID, but re-run the checks.
5. Remove the arp.run hosts from the Vercel project and from middleware; point Headless webhooks and Stripe return URLs at `cloud.agentid.dev`; regenerate any printed QR/short links Ian still wants (they are his own test links).
6. Ian re-registers his passkey (rpId changed) and re-signs owner proofs for his names from `/names/<sld>` (one click each). Email codes, recovery phrase, device link unaffected.
7. Tell Headless: their "Setup ARP Cloud" buttons/`/onboard` links → `cloud.agentid.dev`; ask them to repoint any HNS-side records for the early names from `*.agent.arp.run` to `*.agentid.dev`.

### Step 4 — Tidy
arp.run keeps only spec/docs/status. Nothing in the product references it.

## 4. Non-goals for this slice
Repo/package renames (`@kybernesis/arp-*`, `arpc`), new product docs site, moving spec/docs.

## 5. Acceptance
- Zero `arp.run` strings in the product after cutover (spec/docs/status links excepted).
- Every prod identity's DID doc, card, avatar and profile JSON resolve on `<sld>.agentid.dev` and are byte-identical (except origin) to the arp.run copies; cards verify.
- Kyber ↔ Sid relay + status round trip through `gateway.agentid.dev`.
- Login on `cloud.agentid.dev` by key, email code, passkey (re-registered), recovery phrase, device link.
