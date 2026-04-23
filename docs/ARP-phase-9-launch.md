# ARP Phase 9 — Headless Integration + Public Launch

**Reader:** Claude Code. Directives only.

**Companion docs:** `ARP-phase-0-roadmap.md`, `ARP-tld-integration-spec-v2.md`, `ARP-our-codebase.md`, `ARP-phase-7-cloud.md`.

---

## 0. Reader orientation

**Phase goal:** complete the TLD-side integration with Headless Domains, publish all artifacts, flip production switches, and go live. This phase coordinates work across the ARP team and Headless; the Claude Code portion is the documentation, spec-site, and launch-readiness automation we own.

**Tech pins:**
- Spec site: Astro or Next.js 16 (static), deployed at `https://arp.spec`
- Docs: MDX + Fumadocs or Nextra (pick Fumadocs for Next.js parity)
- Search: Algolia DocSearch or local Pagefind
- Analytics: Vercel Analytics + Plausible
- Status page: Instatus or a custom Next.js page reading from observability
- Community: GitHub Discussions as primary; Discord/Slack only if demand appears

**Out of scope:** enterprise sales motion, paid marketing campaigns, content calendar beyond launch week (post-launch concerns).

---

## 1. Definition of done

- [ ] `arp.spec` live — versioned spec pages, JSON schemas at stable URLs, scope catalog viewer
- [ ] `docs.arp.spec` live — getting-started, three install guides, SDK API reference, adapter guides
- [ ] GitHub org `KybernesisAI` holds public repos: `arp` (main, `https://github.com/KybernesisAI/arp`), `arp-sdk-python`, `arp-mobile`
- [ ] `@kybernesis/arp-*` packages promoted to `latest` on npm
- [ ] `ghcr.io/kybernesisai/sidecar:1.0.0` tagged + released
- [ ] Headless "Set up as ARP agent" checkout flow live in their production registrar
- [ ] ARP Cloud password-gate removed; Stripe switched to live keys
- [ ] Mobile apps submitted to public App Store + Play Store
- [ ] Status page + uptime monitoring live
- [ ] Launch post drafted + reviewed (but the marketing push itself is out of scope for this phase's Claude Code execution; produce the assets, a human pushes the button)

---

## 2. Prerequisites

- Phases 1–8 complete and all acceptance tests green
- Headless Domains team has received and acknowledged `ARP-tld-integration-spec-v2.md`
- Legal review of ToS / Privacy for ARP Cloud complete
- Incident-response runbook drafted

**Prerequisites gated on Phase 8.5 merge:**
- `@kybernesis/arp-selfxyz-bridge` package deleted (removed from workspace).
- `did:key` support in `@kybernesis/arp-resolver`.
- Owner-app + cloud-app no-paste onboarding live.
- `docs/ARP-tld-integration-spec-v2.1.md` delivered to Headless Domains + acknowledged.

---

## 3. Repository additions

```
arp/
├── apps/
│   └── spec-site/                  # Fumadocs-based Next.js app
│       ├── content/
│       │   ├── spec/
│       │   │   ├── v0.1/
│       │   │   │   ├── overview.mdx
│       │   │   │   ├── architecture.mdx
│       │   │   │   ├── identity.mdx
│       │   │   │   ├── pairing.mdx
│       │   │   │   ├── policy.mdx
│       │   │   │   ├── transport.mdx
│       │   │   │   ├── tls-pinning.mdx
│       │   │   │   └── registrar-integration.mdx
│       │   │   └── v1.0/          # later
│       │   ├── docs/
│       │   │   ├── getting-started.mdx
│       │   │   ├── install/
│       │   │   │   ├── local-mac.mdx
│       │   │   │   ├── vps.mdx
│       │   │   │   └── cloud.mdx
│       │   │   ├── scope-catalog.mdx
│       │   │   ├── policies-and-cedar.mdx
│       │   │   ├── sdks.mdx
│       │   │   ├── adapters.mdx
│       │   │   └── mobile.mdx
│       │   └── rfcs/
│       ├── app/
│       └── package.json
├── rfcs/                           # process repo
│   ├── 0001-template.md
│   └── README.md
└── ops/
    ├── status-page/
    ├── incident-runbook.md
    └── on-call-rotation.md
```

Separate repo or subpath for `rfcs/` depending on organizational preference; lean toward inside-main for v0.

---

## 4. Implementation tasks

### Task 1 — Spec site scaffold

1. Create `apps/spec-site` with Fumadocs + Next.js 16
2. Route structure:
   - `/` — landing + pitch
   - `/spec/v0.1/*` — spec pages
   - `/docs/*` — getting-started + how-tos
   - `/schema/*` — serves JSON schemas (proxied from `@kybernesis/arp-spec/json-schema`)
   - `/scope-catalog/v1/manifest.json` — serves compiled manifest
   - `/rfcs/*` — RFC archive
3. Versioned docs with clear "v0.1" banner until v1.0 ships

**Acceptance:** site builds clean, lighthouse performance ≥90.

### Task 2 — Port the ARP docs

For every doc in the Samantha folder (`ARP-architecture.md`, `ARP-policy-examples.md`, etc.), produce a public-facing MDX version:

| Source (internal) | Public (MDX) |
|---|---|
| `ARP-architecture.md` | `/spec/v0.1/architecture.mdx` |
| `ARP-policy-examples.md` | `/docs/policies-and-cedar.mdx` |
| `ARP-scope-catalog-v1.md` | `/docs/scope-catalog.mdx` (+ interactive viewer) |
| `ARP-installation-and-hosting.md` | `/docs/install/index.mdx` |
| `ARP-example-atlas-kyberbot.md` | `/docs/install/local-mac.mdx` |
| `ARP-example-atlas-vps.md` | `/docs/install/vps.mdx` |
| `ARP-example-atlas-cloud.md` | `/docs/install/cloud.mdx` |
| `ARP-hns-resolution.md` | `/docs/hns-resolution.mdx` |
| `ARP-tld-integration-spec-v2.md` | `/spec/v0.1/registrar-integration.mdx` |

Preserve content; rewrite tone only for public audience where needed.

**Acceptance:** every internal doc has a public counterpart; navigation renders each as a discrete page.

### Task 3 — Interactive scope-catalog viewer

Component that loads `/scope-catalog/v1/scopes.json`, renders:
- Search + category filter
- Each scope: expandable card showing ID, label, risk, params, Cedar template, consent text
- "Copy YAML" button per scope
- Link to the bundle using it

**Acceptance:** viewer is the definitive browsing UX for the 50 scopes; feels as good as the OAuth spec browser does.

### Task 4 — Schema browser

Component that loads the JSON schemas (`did-document.json`, etc.), renders:
- Tree view of fields
- Field descriptions inline
- Example payloads
- JSON Schema download button

**Acceptance:** renders all 9 schemas; examples validate against their schema.

### Task 5 — RFC process

`rfcs/README.md`:
- How to propose (PR with `000N-<name>.md`)
- RFC template (`rfcs/0001-template.md` already in-repo)
- Review timeline + lazy-consensus rules
- Breaking-change criteria

Seed with 3 reference RFCs (even if accepted retroactively):
- RFC-0002: "Connection-first policy model"
- RFC-0003: "DID-pinned TLS for agent endpoints"
- RFC-0004: "Scope catalog versioning"

**Acceptance:** process page live; initial RFCs render; a newcomer can propose without asking us.

### Task 6 — Headless integration sign-off

1. Walk Headless through `ARP-tld-integration-spec-v2.md` §12 checklist
2. Confirm each of the 5 contract points (§12) green on their side
3. Run the `@kybernesis/arp-testkit` against a Headless-provisioned test domain; must return 8/8
4. Headless flips the "Set up as ARP agent" option to public

**Acceptance:** a newly-purchased `.agent` domain from Headless, with the checkbox ticked, passes testkit audit within 5 minutes of registration.

### Task 7 — Production flip: ARP Cloud

1. Remove password gate from `arp.cloud`
2. Switch Stripe to live keys
3. Confirm observability alerts firing into paged rotation
4. Update legal pages (ToS, Privacy, DPA) to reflect production status

**Acceptance:** public signup works; first 10 live tenants pass smoke tests.

### Task 8 — Mobile store submission

1. Submit iOS build to App Store review
2. Submit Android build to Play Store review
3. Prepare store listings with final copy + screenshots
4. Set up crash reporting in production (Sentry)

**Acceptance:** both apps live in their respective stores within 7–14 days of submission (reviews can delay).

### Task 9 — npm + GHCR promotion

1. Bump all `@kybernesis/arp-*` packages to `1.0.0`
2. Publish under `latest` tag (currently on `next`)
3. Tag `ghcr.io/kybernesisai/sidecar:1.0.0` and `:latest`
4. Generate a GitHub Release with consolidated changelog
5. Update all READMEs to reference stable versions

**Acceptance:** `npm i @kybernesis/arp-sdk` installs 1.0.0; `docker pull ghcr.io/kybernesisai/sidecar:latest` pulls the stable image.

### Task 10 — Status page + uptime

1. `ops/status-page/` — Next.js app, reads from observability API, surfaces:
   - `arp.cloud` uptime
   - `samantha.agent` / `ghost.agent` availability
   - Latest incident reports
2. Deploy at `status.arp.spec`
3. Automated probes from `@kybernesis/arp-testkit` post results every 5 minutes

**Acceptance:** status page shows live data; a simulated outage is reflected within 1 minute.

### Task 11 — Incident response & on-call

1. `ops/incident-runbook.md` — severity levels, escalation paths, communication templates
2. `ops/on-call-rotation.md` — who's on when, contact info, handoff checklist
3. PagerDuty or similar wired to the observability alerts
4. Tabletop exercise: walk through a simulated tenant-isolation breach

**Acceptance:** on-call rotation configured; one tabletop completed before flip.

### Task 12 — Launch post assets

Not a marketing push — just produce the artifacts a human can use to announce:
1. Blog post draft (~1500 words) at `docs.arp.spec/posts/hello-world.mdx`
2. HN-ready one-paragraph summary
3. Demo video script (scripted; actual recording is out of scope for Claude Code)
4. FAQ for the launch discussion

**Acceptance:** assets reviewed internally; a human can publish them without additional work.

---

## 5. Acceptance tests

```bash
pnpm install
pnpm -r build
pnpm --filter spec-site build
pnpm --filter tests/phase-9 test
npx @kybernesis/arp-testkit audit samantha.agent
npx @kybernesis/arp-testkit audit ghost.agent
npx @kybernesis/arp-testkit audit <headless-test-domain>
# All three audits 8/8
```

Plus manual: browse the spec site top-to-bottom, verify no dead links, no broken examples.

---

## 6. Deliverables

- `arp.spec` + `docs.arp.spec` public
- Spec + docs cover every internal doc we've written
- Stable npm packages + Docker image
- Mobile apps submitted to public stores
- ARP Cloud production with live Stripe
- Headless integration live
- Status page + incident process

---

## 7. Post-launch (Phase 10+, not this doc)

- Analytics review after 30 days
- First RFC cycle for v0.2 additions
- Roadmap for: multi-principal agents, ownership transfer, x402 real payments, location scopes, directory service
- Community governance transition (maintainers beyond the original team)

---

## 8. v0 decisions (do not reopen)

- Fumadocs for docs (not Mintlify, not raw MDX)
- GitHub Discussions primary; expand to Discord only with demand
- Plausible for privacy-respecting analytics
- Instatus or custom Next.js status page (not full incident-management vendor)
- Single launch version: `arp-spec v0.1`, packages `1.0.0` (version mismatch is intentional — the spec is explicitly pre-1.0 while code is shippable)

---

## 9. Common pitfalls

- **Spec + docs drift is the fastest way to embarrass yourself.** Source every public page from internal docs; never paraphrase.
- **Production Stripe keys in a misconfigured env var have ended careers.** Use Vercel environment variable previews; double-check before flipping.
- **First 48 hours post-launch will surface bugs you didn't expect.** On-call rotation must be real and staffed; don't launch on a Friday.
- **App Store reviews can reject for vague "unclear use of encryption" flags.** Fill the export compliance form honestly; keep a concise technical explanation handy.
- **Headless integration tests are a joint operation.** Plan buffer time; their side may uncover issues that need coordination, not heroics.
