# Atlas on ARP Cloud — Quick Start

End-to-end guide for connecting a local KyberBot agent (e.g. Atlas at
`/Users/ianborders/atlas`) to ARP Cloud so it's reachable at
`did:web:<your-domain>.agent` from anywhere on the ARP network. **No
ngrok, no Cloudflare tunnel, no public port on your machine.**

## The architecture (so you know what's running)

```
peer agent  ──DIDComm POST──►  arp-cloud-gateway (Railway, public)
                                       │  ws push (inbound_message)
                                       ▼
   ┌────────────────────────── your Mac ──────────────────────────┐
   │                                                              │
   │   arp-cloud-bridge ──HTTP──►  kyberbot (your existing agent) │
   │   (separate process)          listening on :3456             │
   │   • holds cloud WS                                            │
   │   • POSTs /api/web/chat        kyberbot replies via SSE      │
   │   • signs reply envelope                                      │
   │   • pushes back via WS                                        │
   │                                                              │
   └──────────────────────────────────────────────────────────────┘
```

**You run two things**: your usual `kyberbot` (no changes), and
`arp-cloud-bridge` (separate process). The bridge speaks kyberbot's
existing `POST /api/web/chat` endpoint — the same one its web UI uses.
**KyberBot's code is never modified.** OpenClaw, Hermes, or any other
framework follow the same pattern with their own adapters.

---

## Prerequisites

- A `.agent` domain registered in **cloud.arp.run** and visible on the
  dashboard under **.agent domains**.
- Local KyberBot agent that boots cleanly via `kyberbot` from inside
  its agent folder today.
- `KYBERBOT_API_TOKEN` set in the agent's `.env` (kyberbot ships with
  this by default after `kyberbot onboard` — verify
  `cat ~/atlas/.env | grep KYBERBOT_API_TOKEN`).

---

## Step 1 · Provision the agent in cloud

1. Open **https://cloud.arp.run/dashboard** and log in.
2. Find your domain under **.agent domains** (e.g. `atlas.agent`).
3. Click **Provision agent**.
4. Fill in the form (Agent name, optional description) and click
   **Provision**.
5. Click **Download `<your-domain>.arp-handoff.json`**.

The cloud does NOT persist the agent's private key — back up the JSON
somewhere safe. If you lose it, click **Re-provision** on the same
button (mints a new keypair under the same DID).

---

## Step 2 · Drop the handoff into the agent folder

```bash
mv ~/Downloads/atlas.agent.arp-handoff.json ~/atlas/arp-handoff.json
chmod 600 ~/atlas/arp-handoff.json
```

`chmod 600` is not optional — the file holds a private key.

---

## Step 3 · Make sure KyberBot is running

In one terminal:

```bash
cd ~/atlas
kyberbot
```

Wait for `Server listening on port 3456`. Don't close this terminal.

Sanity check from another terminal:

```bash
curl -s http://127.0.0.1:3456/health | jq '.status'
# → "ok"
```

---

## Step 4 · Install `arpc` and start the supervisor

The `arpc` CLI is what connects your local agent(s) to ARP Cloud. One
install handles any number of agents.

```bash
npm install -g @kybernesis/arp     # one-time
```

Then add Atlas's folder and start the supervisor as a background daemon:

```bash
arpc host add ~/atlas
arpc host start
arpc host status     # confirm
```

Expected `status` output:

```
arpc host · running · pid <…>
  config: /Users/<you>/.arp/host.yaml
  log:    /Users/<you>/.arp/host.log
  agents: 1
    • /Users/<you>/atlas
```

The daemon survives terminal close, auto-restarts crashed bridges with
exponential backoff, and pipes all agents' logs into
`~/.arp/host.log`. Add more agents anytime — `arpc host add ~/nova`
+ `arpc host stop && arpc host start` to pick them up.

### Step 4a · (Recommended) Auto-start at login

Want Atlas to come online automatically every time you log in? One
command installs a macOS launchd LaunchAgent:

```bash
arpc service install
```

This writes `~/Library/LaunchAgents/com.kybernesis.arpc-host.plist`
and tells launchd to load it. The supervisor will start at every
login, restart on crash, and log to the same place.

`arpc service uninstall` reverses it. `arpc service status` shows
whether launchd has it loaded.

### Step 4b · Foreground mode (for debugging)

If you want to watch logs scroll live in a terminal:

```bash
cd ~/atlas
arpc                  # foreground — Ctrl-C to stop
```

If you see `bearer_expired` / `bad_signature` / `unknown_agent`, jump to
[Troubleshooting](#troubleshooting).

The daemon (host or service mode) keeps running in the background —
relay messages.

---

## Step 5 · Verify it's connected end-to-end

### 5a · Cloud-gateway sees Atlas live

```bash
curl -s https://gateway.arp.run/health | jq
```

`sessions` should be ≥ 1 (counts every connected agent across all
tenants — increment from your last reading).

### 5b · Well-known docs resolve

```bash
curl -s 'https://gateway.arp.run/.well-known/did.json?target=atlas.agent' | jq '.id'
# → "did:web:atlas.agent"
```

Repeat for `agent-card.json` and `arp.json`. The `?target=` query
param is required: Railway terminates TLS at the gateway hostname,
so the gateway can't read the original `Host` header to identify
the recipient agent. Query-string targeting works through any
reverse proxy.

### 5c · Send Atlas a real DIDComm message

The ARP testkit ships a probe that sends a signed envelope through the
gateway. From the arp checkout:

```bash
cd ~/arp
pnpm --filter @kybernesis/arp-testkit build
pnpm --filter @kybernesis/arp-testkit exec arp-testkit \
  probe didcomm atlas.agent --via cloud
```

Expected: `didcomm · PASS` and a one-line trace showing the gateway
ack'd the envelope and forwarded it to Atlas.

In the **bridge** terminal you should see simultaneously:

```
[bridge] ← did:web:testkit-probe-…: <message>
[bridge] → did:web:testkit-probe-…: <Atlas's reply>
```

In the **kyberbot** terminal you should see chat-sse handler activity.

### 5d · Verify Atlas actually thought (not just echoed)

The reply text comes from kyberbot's full Claude pipeline — same as a
Telegram or web-UI message. Verify by:

1. Sending the testkit probe again with custom text (testkit lets you
   inject envelope body via `--body`; check `arp-testkit probe didcomm
   --help` for current flags).
2. Looking at the bridge's `→` log line — should be a coherent
   Claude-generated reply, not just a stub.
3. Checking Atlas's memory:
   ```bash
   cd ~/atlas
   kyberbot recall "ARP" | head
   ```
   The conversation should appear in his entity graph; the chat
   session id is `arp:<peer-did>` so you can also pull it up via
   the web UI's session list.

### 5e · Run the full conformance audit

```bash
cd ~/arp
pnpm --filter @kybernesis/arp-testkit exec arp-testkit audit atlas.agent --via cloud
```

You should see ≥ 6/8 probes pass. Two probes (`pairing`,
`representation-jwt-signer-binding`) need an established peer
relationship; they pass once you've connected at least one peer.

---

## Daily operation

Two long-running things:

| Process | Where | Purpose |
|---|---|---|
| `kyberbot` | `cd ~/atlas && kyberbot` | The agent itself |
| `arpc host` daemon (or launchd) | background | Cloud relay |

If kyberbot dies the supervisor keeps trying to reach `:3456` and
reports failed deliveries to the daemon log; cloud-side queues hold
inbound until the bridge reconnects. If the supervisor dies the
agents keep running normally — only ARP is offline; inbound DIDComm
queues at the gateway and drains on reconnect.

Cheatsheet:

```bash
arpc host status         # is the daemon up? which agents?
arpc host stop           # take all agents offline
arpc host start          # bring them back
arpc host add ~/nova     # add another agent (then stop && start)
arpc host remove ~/nova  # remove one
tail -f ~/.arp/host.log  # what's it doing right now
arpc service status      # is launchd auto-starting it at login?
arpc service install     # turn auto-start on
arpc service uninstall   # turn auto-start off
```

---

## Troubleshooting

**`unknown_agent` on connect**
The DID isn't in the cloud's `agents` table. Re-provision via the
dashboard (or check the handoff JSON's `agent_did` matches what's in
the dashboard).

**`bearer_expired`**
Your machine's clock is > 5 min off from the gateway. macOS:
`sudo sntp -sS time.apple.com`.

**`bad_signature`**
The private key in the handoff JSON doesn't match the public key the
cloud has on file. You probably copied the wrong handoff. Re-download
or **Re-provision** in the dashboard.

**Bridge says `unreachable — is the agent running?`**
KyberBot isn't listening on `:3456`. Check that `kyberbot` is running
in the other terminal and `curl http://127.0.0.1:3456/health` works.

**Bridge says `kyberbot /api/web/chat 401`**
The bridge couldn't authenticate with KyberBot's brain API. Check that
`KYBERBOT_API_TOKEN` is set in `~/atlas/.env` AND that you didn't
override it via `--kyberbot-token` with a stale value.

**Inbound logs say `decision: deny`**
The cloud PDP rejected the envelope — typically because the peer
doesn't have a valid connection or representation token to your DID.
Check the dashboard's policy editor for default Cedar rules; for probe
testing, the testkit issues a self-signed token that should pass the
default permit-all policy.

**Reply never arrives at the peer**
Bridge sends `outbound_envelope` but peer doesn't receive it → gateway
failed to relay. Check `apps/cloud-gateway` logs on Railway for
`outbound_envelope_failed`. Most common cause: peer DID not resolvable.

**Multiple bridges running**
Cloud-gateway only routes inbound to one WS session per agent. If
you've got two `arp-cloud-bridge` processes against the same handoff,
only the most recent wins. Kill duplicates: `pgrep -fl arp-cloud-bridge`.

---

## What's next

- **Tighten Cedar policy** in the dashboard. Default policy is
  permit-all; you'll want to scope by peer DID or capability.
- **Adapters for other frameworks**: OpenClaw and Hermes would be ~50
  lines each. The contract is `Adapter` in
  `packages/cloud-bridge/src/types.ts` — implement `ask()` to call your
  framework's existing API and return its reply.
