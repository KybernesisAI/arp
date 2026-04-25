# Phase 10 — `samantha.agent` real-world validation

**Audience:** Ian. Run-this-yourself walkthrough that closes Phase 10 by
proving the entire local-sidecar product path works against a public
`.agent` domain you own. **Docs only — no automation.** When every step
in §3 below completes without human debugging, slice 10e is signed off
and the Phase 9 launch checklist (`docs/launch/checklist.md`) becomes
relevant again.

**Companion docs:**
- `docs/ARP-phase-10-product-completion.md` — slice 10e brief
- `docs/ARP-installation-and-hosting.md` — sidecar Mode B details
- `docs/ARP-phase-10-slice-10d-manual-smoke.md` — eyes-on smoke for 10d's
  passkey + rotation surfaces (run this against the same sidecar before §3)

---

## 1. What we're proving

Phase 10 added the daily-use product surface (pairing, audit viewer,
revocation, dashboard real-data, error pages, owner-app parity). Slices
10a–10d shipped the code; slice 10e's programmatic suite
(`tests/phase-10/*.test.ts`) covers the seven hermetic scenarios.

What no automated suite can prove: a third party reaching the public
`samantha.agent` DNS hits a sidecar that ARP-recognises as Samantha,
serves the right DID document, accepts a pairing invite from the cloud
app, and exchanges policy-checked DIDComm messages with a real agent
framework on the other end of the local socket.

That's the validation this walkthrough drives.

---

## 2. Prerequisites

You'll need:

- **DNS for `samantha.agent` pointing at a publicly-reachable IP.** Three
  options:
  - **Cloudflare Tunnel** — `cloudflared tunnel route dns <tunnel-id>
    samantha.agent`. Tunnel forwards `:443` to your localhost.
  - **Tailscale Funnel** — `tailscale serve --bg https=443
    127.0.0.1:443` plus `tailscale funnel 443`. Then point your `.agent`
    A record at the funnel hostname's IP.
  - **Direct port forward** — `samantha.agent` A → router public IP →
    forward 443 → laptop. Works but requires a static-ish IP and an open
    port.
- **Docker** (Desktop on macOS or `docker.io` on Linux). The sidecar
  image pulls cleanly on amd64 + arm64.
- **A handoff bundle for `samantha.agent`.** This is the
  `handoff.json` + `private_key.txt` you saved when you first registered
  the domain (Phase-4-style two-file convention from Headless). If you
  don't have one yet, run `npx @kybernesis/arp-cli bootstrap samantha.agent`
  — the CLI mints a fresh did:web identity and writes both files.
- **One agent framework.** This walkthrough uses **KyberBot** because we
  ship the adapter at `adapters/kyberbot/` and an example wiring at
  `examples/kyberbot-atlas/`. Hermes / OpenClaw / NanoClaw / LangGraph
  work the same way — swap the adapter import.
- **TLS understanding.** The sidecar generates its own self-signed cert
  at first boot and pins the SHA-256 fingerprint in the published DID
  doc. Browsers + `curl` will warn unless you pass `--insecure` (or
  fetch via the cloud app, which honours the DID-doc-pinned fingerprint
  programmatically).

---

## 3. Walkthrough

Run each step in order. If any step fails, **stop**, file a bug ticket
referencing the step number, and do not proceed. The intent is that
slice 10e is not "done" until this whole script runs clean.

### 3.1 Pull (or build) the sidecar image

```bash
# Option A — pull from GHCR (production tag is post-launch; use :dev today):
docker pull ghcr.io/kybernesisai/sidecar:dev

# Option B — build locally if you've made unmerged changes:
cd ~/arp
docker build -t arp-sidecar:local -f apps/sidecar/Dockerfile .
```

### 3.2 Stage the handoff bundle + data dir

```bash
mkdir -p ~/arp-data/samantha
cp ~/Downloads/samantha-handoff.json   ~/arp-data/samantha/handoff.json
cp ~/Downloads/samantha-private_key.txt ~/arp-data/samantha/private_key.txt
chmod 600 ~/arp-data/samantha/private_key.txt
```

### 3.3 Boot the sidecar

```bash
docker run -d --name samantha-arp \
  -p 443:443 -p 7878:7878 \
  -v ~/arp-data/samantha/handoff.json:/config/handoff.json:ro \
  -v ~/arp-data/samantha:/data \
  -e ARP_ADMIN_TOKEN="$(openssl rand -hex 32)" \
  -e WEBAUTHN_RP_ID=localhost \
  -e WEBAUTHN_ORIGINS=http://localhost:7878 \
  ghcr.io/kybernesisai/sidecar:dev start \
  --owner-app-dir /app/owner-app --owner-app-port 7878
```

Check logs — you want to see `arp-sidecar listening did=did:web:samantha.agent`.

### 3.4 Confirm the DID doc is publicly reachable

From a different network (phone hotspot, friend's laptop, an AWS shell):

```bash
curl -sk https://samantha.agent/.well-known/did.json | jq .
```

Required:
- `id` is `did:web:samantha.agent`.
- `verificationMethod[0].publicKeyMultibase` matches the multibase Ian
  remembers from the handoff bundle.
- `service[?type=DIDCommMessaging].serviceEndpoint` is
  `https://samantha.agent/didcomm`.

### 3.5 Run the testkit

```bash
npx @kybernesis/arp-testkit audit samantha.agent
```

**Expected:** 11/11 probes return `pass`. The eight Phase-2/5 baseline
probes (TLS, did.json shape, agent card, arp.json, etc.) plus the three
v2.1 probes added in 9c (`principal-identity-method`,
`representation-jwt-signer-binding`, `no-selfxyz-prompt`).

If `principal-identity-method` skips, pass `--owner ian
--registrar-setup-url https://...` per the slice-9c conservative-call
note in `CLAUDE.md §14`.

### 3.6 Wire KyberBot to the sidecar

```bash
cd ~/arp/examples/kyberbot-atlas
# In ~/arp/examples/kyberbot-atlas/kyberbot.config.ts (or equivalent):
#   adapter: arpAdapter({
#     sidecarUrl: 'ws://localhost:7878/agent',
#     agentDid:   'did:web:samantha.agent',
#     token:      readFileSync('/Users/ian/arp-data/samantha/agent.token').toString(),
#   })
ARP_AGENT_DID=did:web:samantha.agent \
ARP_AGENT_TOKEN=$(cat ~/arp-data/samantha/agent.token) \
  pnpm dev
```

Tail the sidecar logs again — KyberBot should connect to the agent
socket within ~1s. Subsequent requests are routed through the adapter.

### 3.7 Pair samantha.agent with a cloud tenant

In a fresh browser session signed in to your `cloud.arp.run` tenant:

1. Navigate to **Pair** in the top-nav.
2. Pick the agent you want on the cloud side (e.g. `did:web:atlas.agent`).
3. Add the scope bundle you want to grant (start narrow:
   `calendar.availability.read`).
4. Set audience = `did:web:samantha.agent`.
5. Generate the invitation. Copy the `https://cloud.arp.run/pair/accept#…`
   URL.
6. Open the URL in the same browser window. The `/pair/accept` consent
   screen renders the requested scopes + obligations. Approve.
7. The browser should land back on `/connections/<id>` with the new
   connection visible.

Confirm on the sidecar side:

```bash
curl -s -H "Authorization: Bearer $ARP_ADMIN_TOKEN" \
  http://localhost:7878/admin/connections | jq '.connections[].connection_id'
```

The connection_id reported by both sides must match.

### 3.8 Send a test message + verify the audit on both sides

Use the test harness in the cloud app's settings → **Send test message**
panel (or, if not yet wired, hit the agent's `/didcomm` endpoint
directly with a signed envelope from the runtime SDK).

After the round-trip:

- **Cloud side:** open `/connections/<id>/audit`. The most-recent entry
  shows `decision: allow`, `policies_fired` populated, msg_id matches.
- **Sidecar side:**
  ```bash
  docker exec samantha-arp arp-sidecar audit verify <connection_id>
  ```
  Returns `valid: true` with `entriesSeen >= 1`.

### 3.9 Revoke from the cloud app

1. Cloud → `/connections/<id>` → **Revoke** → confirm.
2. The cloud audit gains a `revoke` entry.
3. From the cloud, attempt to send another test message. The sidecar
   audit must show a deny entry with `reason: 'connection_revoked'`
   (matches what Phase-10/10e's `revoke-in-flight.test.ts` asserts).

### 3.10 Clean up (optional)

```bash
docker stop samantha-arp && docker rm samantha-arp
# Keep ~/arp-data/samantha around — that's your durable state.
```

---

## 4. Success criteria

Slice 10e is closed only when **every** step in §3 completes without:
- Human debugging
- Editing source code mid-walkthrough
- Pasting commands not in this doc
- Falling back to "well, the test passes" as evidence

If any step fails, file a bug, fix it (production code change → new PR;
docs change → amend this file), and re-run the walkthrough from §3.1.

---

## 5. After 10e closes

Re-open `docs/launch/checklist.md` (the §1 launch runbook held since
Phase 9). The remaining launch-day work is:

1. Stripe sandbox → live (Ian's call).
2. SSO toggle: "All Deployments" via Vercel dashboard.
3. `npm publish` the 25 `@kybernesis/arp-*` packages at v1.0.0
   (PR #35 stays held until you say go).
4. GHCR image push: tag `ghcr.io/kybernesisai/sidecar:1.0.0` + `:latest`.
5. Headless Domains 11/11 sign-off via the testkit against a domain
   they provision.
6. Hello-world post + HN submission.

That sequence is unchanged by Phase 10 — see the launch checklist for
detail.

---

*Authored 2026-04-25 as part of Phase 10 slice 10e. Update in place if a
real-world test surface a documentation gap.*
