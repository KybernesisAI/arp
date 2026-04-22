# ARP Phase 4 — Pairing Flow + Owner App

**Reader:** Claude Code. Directives only.

**Companion docs:** `ARP-phase-0-roadmap.md`, `ARP-phase-2-runtime-core.md`, `ARP-phase-3-sidecar.md`, `ARP-architecture.md`, `ARP-policy-examples.md`, `ARP-scope-catalog-v1.md`, `ARP-hns-resolution.md`.

---

## 0. Reader orientation

**Phase goal:** humans can create and manage agent-to-agent relationships. Produces:
- The pairing protocol implementation (QR / deep-link handshake + mutual signing)
- The Next.js owner web app that renders at `ian.samantha.agent` (owner subdomain)
- Cedar → plain-English consent renderer
- Self.xyz VC bridge for selective disclosure during pairing

**Tech pins:**
- Next.js 16 App Router, React 19, Server Components first
- Styling: Tailwind CSS + shadcn/ui
- QR: `qrcode.react` (generator), `html5-qrcode` (scanner)
- State: RSC + tanstack-query for client queries
- Auth: cryptographic login via principal DID (sign-a-challenge flow)
- Hosting: the owner app is **bundled into the sidecar** (served at `/owner/*`) and **also deployable to Vercel** for ARP Cloud. Single codebase, two deploy targets.

**Out of scope:** mobile app (Phase 8), cloud multi-tenancy (Phase 7), SDK adapters (Phase 6), advanced payment flows (v0.2+).

---

## 1. Definition of done

- [ ] `@kybernesis/arp-pairing` package: creates, verifies, countersigns Connection Tokens
- [ ] `@kybernesis/arp-consent-ui` package: Cedar policies → structured English bullets
- [ ] `@kybernesis/arp-selfxyz-bridge` package: request VC presentation, verify ZK proof on receipt
- [ ] `apps/owner-app` Next.js app with routes in §4
- [ ] Sidecar serves the owner app on `/owner/*` and owner-subdomain HTTP routing works
- [ ] End-to-end pairing demo: two sidecars (Samantha + Ghost) pair, exchange messages, revoke
- [ ] Consent screen renders readable English for all 10 worked examples in `ARP-policy-examples.md`
- [ ] Connection edit/audit/revoke flows functional
- [ ] Principal login works via sign-challenge flow (no password)
- [ ] All phase-2/3 tests still pass

---

## 2. Prerequisites

- Phase 2 runtime core
- Phase 3 sidecar packaging
- Phase 1 `@kybernesis/arp-scope-catalog` (for scope templates)

---

## 3. Repository additions

```
arp/
├── packages/
│   ├── pairing/                   # protocol lib
│   ├── consent-ui/                # Cedar → English
│   └── selfxyz-bridge/            # VC presentation wrapper
├── apps/
│   ├── sidecar/                   # updated to bundle owner-app assets
│   └── owner-app/                 # Next.js 16 app
│       ├── app/                   # App Router pages
│       │   ├── layout.tsx
│       │   ├── page.tsx                          # address book
│       │   ├── login/page.tsx
│       │   ├── connections/
│       │   │   ├── page.tsx                      # list
│       │   │   └── [id]/
│       │   │       ├── page.tsx                  # detail + edit
│       │   │       ├── audit/page.tsx
│       │   │       └── revoke/page.tsx
│       │   ├── pair/
│       │   │   ├── page.tsx                      # start new pairing
│       │   │   ├── accept/[token]/page.tsx       # accept incoming invitation
│       │   │   └── scan/page.tsx                 # QR scanner
│       │   ├── settings/
│       │   │   ├── page.tsx
│       │   │   └── keys/page.tsx                 # rotation, view fingerprint
│       │   └── api/                              # Route handlers (proxy to runtime)
│       │       ├── auth/
│       │       ├── connections/
│       │       ├── pairing/
│       │       └── audit/
│       ├── components/
│       ├── lib/
│       ├── public/
│       └── package.json
```

---

## 4. Implementation tasks

### Task 1 — `@kybernesis/arp-pairing`

Exports:
```ts
// Creation side
export function createPairingProposal(input: {
  issuer: string;             // principal DID
  subject: string;            // my agent DID
  audience: string;           // peer agent DID
  purpose: string;            // label
  scopeSelections: ScopeSelection[];
  requiredVcs: string[];
  expiresAt: string;
}): PairingProposal;

// Deliver side (out-of-band)
export function buildInvitationUrl(proposal: PairingProposal, baseUrl: string): string;
// e.g. https://samantha.agent/pair?invitation=<b64url>

export function parseInvitationUrl(url: string): PairingProposal;

// Countersign side
export function countersignProposal(
  proposal: PairingProposal,
  counterpartyPrincipalKey: KeyPair
): ConnectionToken;

// Verify
export function verifyConnectionToken(
  token: ConnectionToken,
  opts: { resolver: DidResolver }
): Promise<{ ok: true } | { ok: false; reason: string }>;
```

Uses `@kybernesis/arp-spec` schemas and JWS signatures via `jose`.

**Acceptance:** round-trip test — proposal → invitation URL → parse → countersign → verify. Tamper with each field; verify rejects.

### Task 2 — `@kybernesis/arp-consent-ui`

Exports `renderConsentView(connectionToken): ConsentView`:

```ts
type ConsentView = {
  headline: string;                                  // "Ghost wants to connect with Samantha for Project Alpha"
  willBeAbleTo: string[];                            // bulleted positives
  willNotBeAbleTo: string[];                         // negatives (from forbids + what's absent)
  conditions: string[];                              // time, VC reqs, spend caps, rate limits
  willProve: string[];                               // VCs the counterparty must present
  expiresAt: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
};
```

Implementation:
1. Parse `cedar_policies` and `obligations`
2. Cross-reference `@kybernesis/arp-scope-catalog` to get each scope's `consent_text_template`
3. Render Handlebars templates with the parameters embedded in the policies
4. Aggregate, dedupe, group by category
5. Produce the structured view

**Acceptance:** visual snapshot tests for all 10 worked examples in `ARP-policy-examples.md` and all 5 bundles in `ARP-scope-catalog-v1.md §6`.

### Task 3 — `@kybernesis/arp-selfxyz-bridge`

Wrap Self.xyz's public API / SDK:
```ts
export function requestVcPresentation(input: {
  requiredVcs: string[];
  peerDid: string;
  nonce: string;
}): { qrPayload: string; deepLinkUrl: string; callbackUrl: string };

export function verifyPresentation(
  presentation: VcPresentation,
  expectedVcs: string[]
): { ok: boolean; attributes: Record<string, unknown> };
```

v0 scope: support `self_xyz.verified_human`, `self_xyz.over_18`, `self_xyz.over_21`, `self_xyz.us_resident`, `self_xyz.country`. Additional VC types mocked.

**Acceptance:** integration test against Self.xyz staging (mock server if staging unavailable).

### Task 4 — Owner app scaffold

1. `pnpm create next-app owner-app` with App Router + Tailwind + TypeScript
2. Remove all Vercel bootstrap boilerplate
3. Install `shadcn/ui` and initialize
4. Wire Tailwind to use the shared design tokens (define in `apps/owner-app/styles/tokens.css`)

**Acceptance:** `pnpm --filter owner-app dev` serves a blank styled page at `localhost:3000`.

### Task 5 — Principal login (sign-challenge flow)

1. `app/login/page.tsx`:
   - Shows a nonce + a "Sign with your principal key" button
   - Button triggers a wallet interaction (browser extension wallet, or for v0: paste a signature from the ARP mobile app or CLI)
2. `app/api/auth/challenge/route.ts`: issues a nonce
3. `app/api/auth/verify/route.ts`: verifies the signature over the nonce using the principal DID from the agent's DID doc (Representation VC's `iss`)
4. On success, issues a server-side session cookie (httpOnly, secure, 1h)
5. All other pages require the session cookie; middleware redirects to `/login` otherwise

**Acceptance:** E2E test: issue challenge → sign with a test key → verify → session cookie set → protected route returns data.

### Task 6 — Address book home (`/`)

1. Server component fetches connections from runtime's local API (`GET /admin/connections` added in this phase)
2. Groups by peer DID
3. Each group collapsible; each connection row shows: label, status dot, scope count, spend-so-far, expiry countdown
4. Actions per row: Open, Audit, Revoke
5. Floating "+ New connection" button

**Acceptance:** renders 3+ connections; revoke button triggers the full flow and updates state.

### Task 7 — Connection detail / edit (`/connections/[id]`)

1. Server-rendered view of the Connection Token, parsed via `@kybernesis/arp-spec`
2. Uses `@kybernesis/arp-consent-ui` to render the scope summary
3. Each scope row shows: label, parameters (editable for editable scopes), obligations applied
4. "Adjust scopes" form: changes produce a new Connection Token version, which requires re-consent from the peer (marked pending until they countersign)
5. "Suspend" / "Revoke" / "Extend" buttons

**Acceptance:** editing a scope parameter and saving produces a new pending token; peer countersignature (mocked in test) finalizes.

### Task 8 — Audit viewer (`/connections/[id]/audit`)

1. Paginated, reverse-chronological list of audit entries
2. Each row: timestamp, action, decision, obligations fired, spend delta
3. Filter bar: decision type, time range, action
4. "Verify integrity" button runs `@kybernesis/arp-audit` chain verifier and reports result

**Acceptance:** 100 entries paginate correctly; verify button returns correct result for both clean and tampered logs.

### Task 9 — Pairing initiation (`/pair`)

1. Form: pick peer agent DID (manual or from recent), purpose label, scope bundle or custom selection, required VCs, expiry
2. Preview panel renders `@kybernesis/arp-consent-ui` live as the form changes
3. "Generate invitation" → produces QR + shareable URL
4. Displays pending invitations; auto-refresh for countersignature

**Acceptance:** generate invitation, scan in test harness, verify countersign completes the flow.

### Task 10 — Pairing acceptance (`/pair/accept/[token]`)

1. Parse the invitation URL server-side
2. Render consent view via `@kybernesis/arp-consent-ui`
3. Prompt for required VC presentation via `@kybernesis/arp-selfxyz-bridge`
4. Approve → countersign via principal key (same wallet flow as login) → POST to runtime to store the token
5. Reject → sends a decline notification to originator (optional; v0 can just not respond)

**Acceptance:** end-to-end acceptance flow tested with test harness.

### Task 11 — QR scanner (`/pair/scan`)

1. Client component using `html5-qrcode`
2. On scan → parse invitation → redirect to `/pair/accept/[token]`
3. Mobile-friendly viewport

**Acceptance:** displays live camera preview in test browser; decoded value routes correctly.

### Task 12 — Settings (`/settings`)

1. Principal DID + Representation VC status
2. Agent keys: current fingerprint, rotate button
3. Revocation list publisher: manually trigger a new publish
4. Export data: download a JSON archive of connections + audit
5. Danger zone: revoke all connections, reset agent

**Acceptance:** rotate keys generates new keypair, updates DID doc, invalidates old cert; all connections remain valid.

### Task 13 — Runtime admin API

Extend `@kybernesis/arp-runtime` with internal routes under `/admin/*`, authenticated via a local-only shared secret (set in env):
- `GET /admin/connections`
- `GET /admin/connections/:id`
- `POST /admin/connections/:id/revoke`
- `POST /admin/connections/:id/suspend`
- `GET /admin/audit/:connection_id`
- `POST /admin/pairing/invitations`
- `POST /admin/pairing/accept`
- `POST /admin/keys/rotate`

Owner app calls these from server components / route handlers only. Never exposed on the public `/didcomm` path.

**Acceptance:** admin endpoints return 401 without the shared secret; 200 with it.

### Task 14 — Sidecar owner-app bundling

1. Build the owner app as a static export where possible; keep dynamic routes as a small Node server bundled inside the sidecar
2. Serve it at `/owner/*` on the sidecar's port 443
3. Owner subdomain CNAME pattern: `ian.samantha.agent` → the sidecar hostname; sidecar detects the Host header and routes to the owner app
4. Agent routes (`/didcomm`, `/.well-known/*`) continue to serve on the agent apex hostname

**Acceptance:** a single sidecar binary serves both agent apex and owner subdomain correctly.

### Task 15 — End-to-end pairing demo

`tests/phase-4/pairing-demo.test.ts`:
1. Spin up two sidecars: Samantha + Ghost
2. Samantha's owner generates a pairing invitation (scoped to Project Alpha, bundle.project_collaboration.v1)
3. Invitation URL shared out-of-band
4. Ghost's owner accepts; Self.xyz VCs presented (mocked)
5. Connection Token finalizes on both sides
6. Ghost sends a message asking for Project Alpha file summary → PDP allows → reply
7. Samantha's owner revokes the connection
8. Ghost sends another message → PDP denies → reply contains revocation proof

**Acceptance:** test passes end-to-end in CI with mocked Self.xyz.

---

## 5. Acceptance tests

From repo root:
```bash
pnpm install
pnpm -r typecheck
pnpm -r build
pnpm -r test
pnpm --filter owner-app test:e2e       # Playwright
pnpm --filter tests/phase-4 test
docker build -t arp-sidecar:phase4 -f apps/sidecar/Dockerfile .
```

All exit 0.

---

## 6. Deliverables

- Three new packages (pairing, consent-ui, selfxyz-bridge)
- Next.js owner app deployable both bundled (sidecar) and standalone (Vercel)
- Admin API on the runtime
- End-to-end pairing demo test

---

## 7. Handoff to Phase 5

Phase 5 (Reference Agents + Testkit) consumes:
- Pairing package for test-harness bootstrapping
- Consent-ui for snapshot validation tests
- Sidecar image with owner app bundled

---

## 8. v0 decisions (do not reopen)

- Next.js 16 App Router, no Pages Router
- shadcn/ui for components
- Sign-challenge flow for login (no passwords, no OAuth in v0)
- Owner app bundled in sidecar AND deployable to Vercel (same build)
- Mobile-responsive web only in this phase; native mobile is Phase 8
- Self.xyz VCs limited to the 5 attributes listed in Task 3
- Admin API behind shared secret, not full RBAC (Phase 7 tightens this for multi-tenant Cloud)

---

## 9. Common pitfalls

- **App Router caching:** mark all owner-app pages `export const dynamic = 'force-dynamic'` since their data is session-scoped.
- **RSC streaming + QR generation:** generate QR on the client for reactivity; SSR the form.
- **Cedar-to-English rendering:** don't just join policy strings. Parse them, extract structured intents, then render — otherwise you'll ship UI that looks like code.
- **Owner subdomain routing:** test both with and without a trailing slash; Next.js's default middleware can break Host-header routing if not configured.
- **Self.xyz callbacks:** if using their staging SDK, the callback URL must be HTTPS and reachable — use ngrok during dev.
