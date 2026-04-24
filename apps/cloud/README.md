# @kybernesis/arp-cloud-app

Next.js 16 App Router UI + control-plane API routes for the hosted multi-tenant
ARP runtime. Runs at `cloud.arp.run` (marketing + onboarding) and
`app.arp.run` (authenticated dashboard). Falls back to a local PGlite when no
`DATABASE_URL` is set, so `pnpm dev` works without any external dependencies.

## Environment variables

See `.env.example` for the full list. Copy to `.env.local` for local development;
in production every value goes into Vercel's env var store.

| Name | Purpose |
|---|---|
| `ARP_CLOUD_SESSION_SECRET` | HMAC secret for the session cookie. Required. |
| `ARP_CLOUD_HOST` | Public hostname (controls Secure cookie flag + redirects). |
| `ARP_CLOUD_WS_PUBLIC_URL` | Public wss:// URL of the gateway. |
| `ARP_CLOUD_REGISTRAR_PSK` | Pre-shared key for `POST /internal/registrar/bind`. Phase 9b+. |
| `DATABASE_URL` | Neon Postgres connection string. Omit to use PGlite. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAM` | Stripe billing. Omit to disable. |
| `APP_ARP_SPEC_HOST` | Cross-surface link to the spec site. |

## Public surfaces

| Route | Purpose | Auth |
|---|---|---|
| `GET /onboarding` | First-run browser-held did:key flow (app.arp.run) | Public |
| `GET /onboard?domain=&registrar=&callback=` | v2.1 TLD registrar entry point (Option A) | Public |
| `POST /api/tenants` | did:key → tenant creation | Public (DID check) |
| `POST /api/agents` | Sidecar migration (handoff bundle) | Session |
| `POST /api/onboard/complete` | Mark onboarding_sessions row with principal DID | Public (unpredictable id) |
| `POST /internal/registrar/bind` | v2.1 registrar callback receiver | PSK (bearer) |
| `GET /u/<uuid>/did.json` | Cloud-managed DID document | Public |
| `POST /api/push/register` | Mobile push-token registration | Session |
| `POST /api/webhooks/stripe` | Stripe webhook | Stripe signature |

## Development

```bash
pnpm install
pnpm --filter @kybernesis/arp-cloud-app dev    # http://localhost:3000
pnpm --filter @kybernesis/arp-cloud-app test   # vitest
pnpm --filter @kybernesis/arp-cloud-app typecheck
pnpm --filter @kybernesis/arp-cloud-app lint
```

## Post-deploy checklist

After merging changes that touch the schema, run `packages/cloud-db/migrate-once.mjs`
against production Neon (the script is gitignored; Ian keeps a local copy).
Migrations are additive and idempotent.
