# Phase 10 slice 10a — manual smoke

Exercises the URL-fragment pairing flow end-to-end against a local dev
server. Two browser sessions on the same machine is enough — this is
cloud-to-cloud pairing and neither a second device nor any live
infrastructure is required.

## Prereqs

- `pnpm install --frozen-lockfile` completed at repo root.
- `apps/cloud/.env.local` present with at least:
  ```
  ARP_CLOUD_SESSION_SECRET=<random 32+ chars>
  ARP_CLOUD_REGISTRAR_PSK=<random 32+ chars>
  ```
- Two browser profiles or a private window alongside your main window so
  the two tenants don't share localStorage.

## Flow

### 1. Boot the cloud app

```bash
pnpm --filter @kybernesis/arp-cloud-app dev
```

Next.js serves on `http://localhost:3000`. The host-dispatch middleware
treats unknown hosts (including `localhost`) as the app surface, so every
authenticated route resolves at the top level.

### 2. Tenant A — create + issue invitation

1. Open browser profile A → `http://localhost:3000/onboarding`.
2. Click **Create your account** → reveal + save the recovery phrase →
   check the box → name your agent (e.g. `alpha`) → **Create agent**.
3. You land on `/dashboard`. The incoming-pairing widget shows `0`.
4. Navigate to `/pair`.
5. Fill the form:
   - **Your agent**: the one you just created.
   - **Peer agent DID**: put the DID of Tenant B's agent (you'll grab it in
     step 3; for now place a stub like `did:web:beta.agent`).
   - **Scope bundle**: pick anything from the dropdown.
   - Keep expiry at 1 day.
6. Click **Generate invitation**. The right panel shows the URL:
   `http://localhost:3000/pair/accept#<long-base64-string>`.
7. Click **Copy URL**. The widget flips to `Copied`.

### 3. Tenant B — create + accept

1. Open browser profile B → `http://localhost:3000/onboarding`.
2. Repeat the onboarding (agent name `beta`). After `/dashboard` loads,
   note Tenant B's agent DID from the dashboard's agent list — go back to
   Tenant A's form and rewrite the **Peer agent DID** field with this
   DID, then re-generate. The new URL replaces the old one.
3. Copy the regenerated URL.
4. In profile B, paste the URL into the address bar.
5. The `/pair/accept` page loads. The consent panel shows the scopes,
   risk tier, and expiry. The right panel asks you to pick **Accept
   under which agent** — choose `beta`.
6. Click **Approve + countersign**. After a moment the page flips to
   **Pairing complete**.
7. Click **Dashboard →**. You're back on Tenant B's dashboard.

### 4. Verify both sides

- Tenant A's dashboard: the incoming-pairing widget's count drops from `1`
  to `0` (the invitation flipped to consumed). Tenant A's agent has a new
  connection row in `connections` with Tenant B's agent as the peer.
- Tenant B's dashboard: the inverse — a `connections` row for Tenant B's
  agent pointing at Tenant A's agent.

Inspect directly via PGlite:

```bash
# From the repo root, once the dev server is running, the DB lives in
# the process memory — you can't connect an external SQL client. Instead
# land in the /api/pairing/invitations GET endpoint:
#
curl -s -b 'arp_cloud_session=<copy-from-browser-devtools>' \
  http://localhost:3000/api/pairing/invitations | jq
```

### 5. Cancellation path

From Tenant A's `/pair` form:
1. Generate a second invitation (won't share this one).
2. Open the DB listing via the curl line above. Note the new
   `invitations[].id`.
3. `DELETE` it:
   ```bash
   curl -X DELETE -b '<session-cookie>' \
     http://localhost:3000/api/pairing/invitations/<id>
   ```
4. Re-list — the invitation is gone.

### 6. Logout path

On any dashboard page, click **Log out** in the nav. You land on
`/cloud/login`. The session cookie is cleared; revisiting `/dashboard`
redirects back to `/cloud/login?next=/dashboard`.

## What's intentionally not exercised

- **Cloud ↔ Sidecar pairing.** The sidecar path waits on slice 10e
  (real-world `samantha.agent` validation).
- **DIDComm inbound cross-tenant invitations.** The incoming-pairing
  widget today lists the TENANT'S OWN issued invitations. Inbound pairing
  via DIDComm dispatch is out of scope for 10a — it's part of the cloud
  runtime work in slice 10b/10e.
- **Rate-limit smoke.** Covered by the automated test
  (`pairing-accept-route.test.ts` cap at 10/min per tenant; trivially
  reproducible by hammering the route from curl).

## Troubleshooting

- **"no principal key in browser"** — the principal did:key is tied to a
  specific browser profile's localStorage. Each tenant uses its own
  profile; mixing them fails with this error. Either switch profiles or
  recover the phrase.
- **"browser principal did does not match the session's"** — means the
  browser holds a different did:key than the one the session was issued
  under. Log out and sign back in, or recover the phrase in this browser.
- **"subject_not_tenant_agent"** — you picked an agent that isn't owned
  by the current tenant. Double-check the browser profile.
- **Consent panel renders no scopes** — the scope bundle may reference
  ids your catalog doesn't include. Rebuild the catalog
  (`pnpm --filter @kybernesis/arp-scope-catalog build`).

---

*Filed as part of Phase 10 slice 10a.*
