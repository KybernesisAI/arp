# Atlas on ARP Cloud — Quick Start

End-to-end guide for connecting a local KyberBot agent to ARP Cloud
so it's reachable at `did:web:<your-domain>.agent` from anywhere on the
ARP network. **No ngrok, no Cloudflare tunnel, no public port on your
machine.** Atlas opens one outbound WebSocket to the cloud-gateway and
gets DIDComm pushed down that pipe.

This guide is written against Atlas at `/Users/ianborders/atlas` and
the domain `atlas.agent`, but it applies unchanged to any KyberBot agent
folder + any `.agent` HNS domain you've registered through cloud.arp.run.

---

## Prerequisites

You should already have:

- A `.agent` domain registered in **cloud.arp.run** (if not: dashboard →
  "Register a .agent domain", complete the Headless flow). Confirm it's
  visible on the dashboard under **.agent domains**.
- Local KyberBot agent folder (e.g. `/Users/ianborders/atlas`) with
  `identity.yaml`, that boots cleanly via `kyberbot` from inside the
  folder today.
- KyberBot CLI built with the ARP channel. The channel is currently in
  the kyberbot working tree at `~/kyberbot/packages/cli/src/server/channels/arp.ts`
  — already built. Verify with:
  ```bash
  ls ~/kyberbot/packages/cli/dist/server/channels/arp.js && echo "ARP channel built"
  ```
  If it's missing, see [Updating KyberBot](#updating-kyberbot) below.

---

## Step 1 · Provision the agent in cloud

1. Open **https://cloud.arp.run/dashboard** and log in.
2. Find your domain under **.agent domains** (e.g. `atlas.agent`).
3. Click **Provision agent**.
4. Fill in:
   - **Agent name**: `Atlas` (or whatever you want shown on the agent card)
   - **Description**: optional, e.g. _"Personal infrastructure agent."_
5. Click **Provision**.

The dashboard returns a one-time payload containing the agent's private
key. **Cloud does not persist it** — if you lose it, you'll have to
re-provision (which mints a new key under the same DID and invalidates
the old one).

6. Click **Download `<your-domain>.arp-handoff.json`**. Save it somewhere
   safe AND copy it into your agent folder (next step).

> **Already provisioned but lost the handoff?** Click the same button —
> the form now shows a **Re-provision (replaces existing key)** option.
> Confirms the destructive action, then issues a fresh handoff.

---

## Step 2 · Drop the handoff into Atlas

```bash
# Replace ~/Downloads/atlas.agent.arp-handoff.json with whatever the
# browser saved as.
mv ~/Downloads/atlas.agent.arp-handoff.json ~/atlas/arp-handoff.json
chmod 600 ~/atlas/arp-handoff.json
```

The file contains a private key. `chmod 600` is not optional.

---

## Step 3 · Edit `identity.yaml`

Open `~/atlas/identity.yaml` and add the `arp` channel under `channels:`
(alongside any existing `telegram` / `whatsapp` blocks):

```yaml
channels:
  arp:
    enabled: true
    handoff: arp-handoff.json
  # leave any existing telegram/whatsapp blocks untouched
```

That's it for config. **Do not** delete the existing `tunnel:` block —
ARP coexists with ngrok; if you want to fully drop ngrok, set
`tunnel.enabled: false` instead.

---

## Step 4 · Restart Atlas

```bash
cd ~/atlas
# kill any running kyberbot process first (Ctrl-C, or):
pkill -f 'kyberbot'

kyberbot
```

Watch the boot log. Within a few seconds you should see:

```
[arp] ─────────────────────────────────────────────
[arp] ARP channel starting
[arp]   did:        did:web:atlas.agent
[arp]   gateway:    wss://arp-cloud-gateway-production.up.railway.app/ws
[arp]   handoff:    /Users/ianborders/atlas/arp-handoff.json
[arp] ─────────────────────────────────────────────
[arp] cloud-client state: connecting
[arp] cloud-client state: connected
```

If you see `bearer_expired` / `bad_signature` / `unknown_agent`, see
[Troubleshooting](#troubleshooting).

---

## Step 5 · Verify the connection

### 5a · Health endpoint shows ARP connected

```bash
curl -s http://127.0.0.1:3456/health | jq '.channels'
```

Expected:

```json
[
  { "name": "telegram", "connected": true },
  { "name": "arp", "connected": true }
]
```

(Port 3456 is from `server.port` in your identity.yaml — change if
you use a different one.)

### 5b · Cloud sees Atlas live

The cloud-gateway tracks who's connected. Confirm Atlas's session shows
up by checking the gateway's `/health` endpoint:

```bash
curl -s https://arp-cloud-gateway-production.up.railway.app/health | jq
```

`sessions` should be ≥ 1 (it counts every connected agent across all
tenants — increment from your last reading).

### 5c · Well-known docs are served

The cloud-gateway serves `did:web:atlas.agent`'s public docs based on the
`Host` header. Verify they resolve:

```bash
curl -s -H 'Host: atlas.agent' \
  https://arp-cloud-gateway-production.up.railway.app/.well-known/did.json | jq '.id'
```

Expected: `"did:web:atlas.agent"`. Repeat with `agent-card.json` and
`arp.json` for the full triplet.

### 5d · Run the cloud audit

The ARP testkit can run the full conformance audit through the cloud
gateway against atlas.agent. From the arp checkout:

```bash
cd ~/arp
pnpm --filter @kybernesis/arp-testkit build  # if you haven't already
pnpm --filter @kybernesis/arp-testkit exec arp-testkit audit atlas.agent --via cloud
```

You should see ≥ 6/8 probes pass: DNS resolution, well-known docs, DID
resolution, TLS fingerprint, the DIDComm endpoint accepting signed
envelopes, and the principal-identity probe. Two probes (`pairing`,
`representation-jwt-signer-binding`) require an established peer
relationship; they pass once you've connected at least one peer.

### 5e · Send Atlas a real DIDComm message

For a single round-trip:

```bash
pnpm --filter @kybernesis/arp-testkit exec arp-testkit \
  probe didcomm atlas.agent --via cloud
```

Expected: `didcomm · PASS` and a one-line trace showing the gateway
ack'd the envelope and forwarded it to Atlas. In Atlas's terminal you
should simultaneously see:

```
[arp] PDP allow ← <peer-did>  (msg.type=...)
[arp] reply sent to <peer-did>
```

The probe's default envelope is a minimal "ping" — Atlas processes it
through Claude with his full system prompt (SOUL.md, USER.md, recent
activity) and returns a real Claude-generated reply. Confirm by
checking Atlas's memory:

```bash
cd ~/atlas
kyberbot recall "ARP" | head
```

The conversation should show up in his entity graph with `channel: arp`.

---

## What's actually happening

```
your peer agent  ──┐
                   │  DIDComm POST /didcomm
                   ▼
   arp-cloud-gateway (Railway, public)
   • ed25519 verify envelope
   • Cedar PDP allow/deny
   • route by recipient DID  ──┐
                                │  inbound_message (WS push)
                                ▼
   ┌──────────────────────────────────────────┐
   │  ~/atlas/  (your Mac)                    │
   │                                          │
   │   kyberbot                               │
   │     └ ArpChannel (cloud-client)          │
   │         ├ verifies decision = allow      │
   │         ├ hands envelope to Claude       │
   │         ├ Claude generates reply         │
   │         └ signs + sends WS reply         │
   └──────────────────────────────────────────┘
```

The cloud-gateway never sees Atlas's private key. Atlas never opens an
inbound port. The WS connection is one-way authenticated (ed25519
challenge over `sha256("arp-cloud-ws:<did>:<ts>")`) and gets a fresh
token every 55 minutes.

---

## Updating KyberBot

The ARP channel currently lives in the kyberbot working tree as
uncommitted work pending an `@kybernesis/arp-cloud-client@0.2.0` npm
publish. To rebuild it on this machine:

```bash
cd ~/kyberbot
pnpm install        # picks up @kybernesis/arp-cloud-client + arp-transport
pnpm --filter @kyberbot/cli build
```

The global `kyberbot` binary is symlinked to
`packages/cli/dist/index.js`, so the rebuild is live immediately.

When `@kybernesis/arp-cloud-client@0.2.0` ships to npm, the file:tarball
deps in `packages/cli/package.json` get swapped to `^0.2.0`, the
package version bumps to `1.9.0`, and the change lands on kyberbot
main. After that, `kyberbot --version` will read `1.9.0` and other
machines pick it up via `npm i -g @kyberbot/cli`.

---

## Troubleshooting

**`unknown_agent` on connect**
The DID you're connecting as isn't in the cloud's `agents` table. Either
provisioning didn't finish or the handoff JSON's `agent_did` doesn't
match what's in the DB. Re-provision via the dashboard.

**`bearer_expired`**
The cloud-gateway clock and your machine's clock are > 5 min apart. Run
`sudo sntp -sS time.apple.com` on macOS.

**`bad_signature`**
The private key in your handoff JSON doesn't match the public key the
cloud has on file. This usually means you copied the wrong handoff
file. Re-download from the dashboard (or re-provision).

**Channel logs say `connected` but probes time out**
Check that `decision: allow` is appearing in the inbound logs. If you
see `decision: deny`, the cloud PDP is rejecting the envelope —
typically because the peer doesn't have a valid connection or
representation token to your DID. For probe testing, the testkit issues
a self-signed token; if that's still being denied, your tenant's
default Cedar policy may be too strict. Check `policiesFired` in the
inbound metadata.

**Reply never arrives at the peer**
If Atlas sends `outbound_envelope` but the peer doesn't receive it, the
gateway is failing to relay. Check `apps/cloud-gateway` logs on Railway
for `outbound_envelope_failed` warnings. Most common cause: peer DID
not resolvable via the gateway's resolver chain.

**Multiple Atlas instances**
The cloud-gateway only routes inbound to one WS session per agent. If
you've got two `kyberbot` processes running against the same agent
folder, only the most recent connection wins; the older one keeps
sending outbound but receives nothing. Kill duplicates:
`pgrep -fl kyberbot`.

---

## What's next

- **Set up custom domain** for the gateway (`gateway.arp.run` →
  Railway). Until that's done, the WS URL in handoff bundles points at
  the raw Railway hostname. Functional but ugly.
- **Tighten Cedar policy**: by default Atlas accepts inbound from any
  DID with a valid representation. Use the dashboard's policy editor to
  scope by peer DID or by capability.
- **Hook ARP into other frameworks**: same `@kybernesis/arp-cloud-client`
  drives OpenClaw + Hermes adapters. The `Channel` interface in kyberbot
  is just the kyberbot-shaped slot — the underlying transport is
  framework-agnostic.
