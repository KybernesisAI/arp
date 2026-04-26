# Moving ARP work to the laptop

Concise checklist. Both ends of arpc (Atlas, Mythos) keep running where they are — this is just for the dev environment that ships code to npm + Vercel + Railway.

## On THIS machine (before leaving)

```bash
cd ~/arp
git status                      # confirm clean
git push                        # everything on origin/main
```

If anything uncommitted that you need: stash + push to a branch, or commit. Don't leave work behind.

## On the laptop (15 min setup)

### 1. Clone

```bash
git clone https://github.com/KybernesisAI/arp.git ~/arp
cd ~/arp
pnpm install
pnpm build                      # warms all package dist/
```

### 2. CLI auth (interactive, ~3 min total)

```bash
npm login                       # publishing arpc + cloud-bridge + cloud-client
vercel login                    # for vercel env pull, vercel ls
railway login                   # for railway up to redeploy gateway
gh auth login                   # for gh pr create / merge
```

### 3. Pull prod env for the cloud DB

```bash
cd ~/arp/apps/cloud
vercel link                     # link to ian-darkstarvccs-projects/arp-cloud
vercel env pull .env.local --environment=production --yes
```

`.env.local` is gitignored. It contains `DATABASE_URL` (Neon) which the migration runner + diagnostic scripts need.

### 4. Link Railway gateway

```bash
cd ~/arp/apps/cloud-gateway
railway link --project arp-cloud-gateway
# pick: workspace=Ian Borders's Projects, env=production, service=arp-cloud-gateway
```

### 5. Verify you can drive the system

```bash
railway logs                    # tails gateway (test connectivity)
node ../../packages/cloud-db/migrate-once.mjs --help 2>&1 | head -3   # migration runner reachable
```

## Things to remember on the road

- **Run migrations BEFORE deploying code that needs them.** Order: migrate prod DB → Vercel/Railway deploy. We learned that the hard way (PR #91/#92).
- **Cloud-app fixes**: push to main → Vercel auto-deploys.
- **Gateway fixes**: `railway up --service arp-cloud-gateway --ci` from repo root. Gateway has no GitHub auto-deploy.
- **arpc fixes**: bump versions in `packages/cloud-client/package.json`, `packages/cloud-bridge/package.json`, `packages/arp/package.json` (in that order — strict topological); `pnpm build`; `npm publish` each in the same order. Both Atlas + Mythos need `npm i -g @kybernesis/arp@latest && arpc service uninstall && arpc service install` to pick up.
- **Dist-tag check**: if `arpc version` lags, run `npm view @kybernesis/arp dist-tags`. If `latest` didn't update, `npm dist-tag add @kybernesis/arp@<v> latest`.

## Where state lives

| Thing | Location |
|------|----------|
| Code | GitHub: `KybernesisAI/arp` |
| Cloud DB | Neon (URL in `apps/cloud/.env.local` post-`vercel env pull`) |
| Cloud app | Vercel project `ian-darkstarvccs-projects/arp-cloud` |
| Gateway | Railway project `arp-cloud-gateway` |
| Atlas agent | This Mac (`~/atlas`, launchd) — stays here |
| Mythos agent | Other Mac (`~/mythos`, launchd) — stays there |
| npm publish auth | `~/.npmrc` token (laptop needs its own `npm login`) |

## What's in flight (recent state)

Last successful round-trip: bidirectional pair Atlas ↔ Mythos with both directions of cedar policy. Currently shipped + deployed:

- PR #94–#106: connection lookup + relay mapping + ack-immediately + WS-forwarder + auto-allow-responses + no-auto-reply-to-response + audit-seq retry + host-status-launchd + graceful-shutdown + WS-keepalive
- PR #107–#108: bidirectional consent (audience amendment) + signer-resolution fix

Next things in the queue if you have time:

- Server-side rate-limit on outbound_envelope (the ping-pong storm exposed this)
- Surface the audience-amendment scopes in `/connections/<id>` UI so users can see what THEIR side granted
- `arpc upgrade` subcommand that does the npm i -g + service reload in one shot
