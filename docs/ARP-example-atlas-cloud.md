# ARP — Worked Example: Atlas via ARP Cloud → `atlas.agent`

**Audience:** non-technical-ish. Copy-paste, or click, or both.
**Scenario:** you don't want to run infrastructure. You built Atlas (KyberBot) on your Mac, and you want `atlas.agent` to "just work" — 24/7, from anywhere, no tunnels, no VPS, no Docker on your laptop (beyond what KyberBot already uses).

ARP Cloud is our hosted service that runs the entire ARP layer for you. Atlas stays on your Mac. Everything internet-facing happens on our side.

---

## What you're actually adding

A tiny "phone-home" client that runs next to Atlas. It opens an outbound connection to ARP Cloud. Peers send messages to `atlas.agent`, those hit ARP Cloud, Cloud runs all the permission checks, and forwards approved requests down the outbound channel to Atlas.

Your Mac never needs a public IP, a tunnel, or an open port. Atlas just makes outgoing HTTPS to ARP Cloud.

Think of it like a Slack client — Slack's servers do all the hard work; the app on your laptop just opens a connection and listens.

---

## The 5 steps

### Step 1 — Buy the domain

1. Go to Headless Domains.
2. Register `atlas.agent`.
3. Tick "Set up as ARP agent, hosted on ARP Cloud" at checkout.
4. You'll be redirected to the ARP Cloud onboarding page.

### Step 2 — Connect ARP Cloud

At `https://app.arp.spec`:

1. Sign in with your principal DID (one click if you have a Self.xyz wallet; otherwise it walks you through).
2. Paste the `handoff.json` (or it's pre-filled if you came from Headless).
3. Confirm the agent name and owner binding.
4. Click "Provision."

ARP Cloud automatically:
- Hosts `/.well-known/did.json`, `agent-card.json`, `arp.json`
- Issues the TLS cert for `atlas.agent`
- Points DNS at our servers
- Sets up the mailbox, PDP, audit log

About 60 seconds total.

### Step 3 — Install the cloud client locally

On your Mac, paste into Terminal:

```bash
cd ~/atlas
npx @kybernesis/arp-cloud-client init
```

This walks you through a short wizard:
- Login with your ARP Cloud account (browser pops open)
- Confirms which agent this Mac serves (Atlas)
- Tells it the local port Atlas is listening on (KyberBot's messaging port)

It creates a small config file at `~/atlas/.arp-cloud.json`.

### Step 4 — Start the cloud client

```bash
cd ~/atlas
npx @kybernesis/arp-cloud-client start
```

This opens a persistent outbound connection to ARP Cloud. Leave the terminal running.

Alternative: install as a background service so it starts with your Mac:

```bash
npx @kybernesis/arp-cloud-client install-service
```

Now it runs in the background forever, restarting automatically.

### Step 5 — Manage Atlas from your browser

`.agent` is a Handshake TLD, so it doesn't resolve in a vanilla browser — but in Cloud mode this is mostly invisible to you. The ARP Cloud owner app sits on a normal domain and knows how to load the right agent for you. Pick whichever is easiest:

- **ARP mobile app** *(recommended)* — has HNS resolution built in; native notifications + biometrics.
- **Any browser:** `https://app.arp.spec` — log in with your principal DID; loads your Atlas owner UI directly.
- **Any browser, via HNS gateway:** `https://ian.atlas.agent.hns.to` (works but slower).

More detail on HNS resolution: `ARP-hns-resolution.md`.

Same control panel as every other install mode:
- Pending pairing requests
- Active connections + scope checkboxes
- Revoke buttons
- Audit log

Optional: install the ARP mobile app for QR pairing + push approvals on your phone.

---

## What's running where after all this

```
┌─ Your Mac ───────────┐         ┌─ ARP Cloud ─────────────┐
│                      │         │                          │
│  KyberBot / Atlas    │         │  Well-known endpoints    │
│       ▲              │         │  DIDComm mailbox         │
│       │ localhost    │         │  Cedar PDP               │
│  Cloud client    ───────outbound──▶  Audit log            │
│       │              │  HTTPS   │  Owner web app          │
│       └──────────────┘          │         ▲               │
│                                 │         │               │
└──────────────────────┘          └─────────┼───────────────┘
                                            │
                                            │ HTTPS
                                            │
                                 [Outside agents + your browser]
```

When Ghost's agent messages Atlas:
1. Resolves `atlas.agent` → ARP Cloud
2. Cloud accepts the DIDComm envelope
3. Cloud runs PDP against the Cedar policy for that connection
4. If allowed, Cloud pushes the request down the outbound channel to your Mac
5. Your Mac's cloud client hands it to Atlas
6. Atlas responds; the response travels back through the same channel

Your Mac never accepts inbound connections.

---

## Why you'd pick this mode

| | **Mac + tunnel** | **VPS** | **ARP Cloud (this doc)** |
|---|---|---|---|
| Steps to set up | 5 | 5 | 5, but simpler |
| Runs 24/7 | ❌ | ✅ | ✅ (your Mac is online when *you're* online; messages queue when not) |
| Public IP needed | ❌ (tunnel) | ✅ | ❌ |
| Cost | ngrok paid plan | $5–10/mo VPS | ARP Cloud subscription |
| TLS / certs | Handled by tunnel | Handled by sidecar | Handled by us |
| Server ops | Minimal | Some (Linux, Docker) | None |
| Data residency | Your Mac | Your VPS | Our servers |
| Best for | Tinkering | Serious always-on | Set-and-forget, non-technical |

---

## What happens when your Mac is asleep / offline

Messages queue in the Cloud mailbox. When your Mac wakes up and the cloud client reconnects, queued messages are delivered in order. Your peers see the same behavior as email — you might respond in 30 seconds or 30 minutes, but nothing is lost.

Urgent messages: ARP Cloud can fire a push notification to your mobile app when something needs your attention (re-consent prompts, high-risk approvals, etc.).

---

## What you DON'T have to do

- ❌ Change any KyberBot code
- ❌ Run a tunnel (ngrok / Cloudflare)
- ❌ Open firewall ports
- ❌ Get a VPS
- ❌ Manage TLS certs
- ❌ Keep your Mac on 24/7
- ❌ Learn Cedar, DIDComm, or protocol internals

The tradeoff: **you trust ARP Cloud to run the permission layer.** The cloud never sees the *contents* of your encrypted messages (E2E encrypted between agents), but it does see *metadata* — who talks to whom, when, how much.

If that's a problem, use VPS mode instead. For most people, it's fine.

---

## Gotchas

**1. The cloud client needs to be running for Atlas to receive live messages.** If it crashes or you close the terminal without installing as a service, messages queue in the Cloud until it reconnects. Use `install-service` for real-world use.

**2. If you cancel your ARP Cloud subscription**, your connections don't die — they're signed tokens. But `atlas.agent` stops resolving because we stop serving it. Point the DNS elsewhere (VPS, local tunnel) to migrate. Your Connection Tokens carry forward; just re-host the well-known files and restart DIDComm on the new endpoint.

**3. First-time login needs a browser.** Mostly a one-time thing. After that the cloud client uses a stored refresh token.

---

## Switching modes later

You're not locked in. Your agent DID, your connections, your policies — all portable. If you outgrow Cloud mode and want to self-host on a VPS, just:

1. Spin up the VPS + install the sidecar (see `ARP-example-atlas-vps.md`)
2. Point DNS from ARP Cloud to the VPS IP
3. Cancel your ARP Cloud subscription

Connections keep working. Peers don't notice. Takes ~20 minutes.

---

## Total time

About **5 minutes** after buying the domain. This is by far the fastest setup — it's designed so that anyone who can install a Mac app can set it up.

---

## Quick recap

1. Buy `atlas.agent` → redirect to ARP Cloud
2. Sign in + provision (60 seconds of clicking)
3. `npx @kybernesis/arp-cloud-client init` on your Mac (one command)
4. `npx @kybernesis/arp-cloud-client install-service` so it runs in the background forever
5. Open `https://ian.atlas.agent` to manage it

That's the whole thing. Atlas stays on your Mac, we host the internet-facing layer, and you never touch a tunnel or a VPS.
