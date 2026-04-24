# ARP — Mental model

**Audience:** anyone reading the ARP codebase, pitching the product, or trying to explain how it works in a conversation. Protocol deep-dive lives in `ARP-architecture.md`; this doc is the plain-language story the architecture is in service of.

---

## The post office

Your machine is a small post office. Three buildings, one roof:

- **Sidecar** — the post office itself. The building, the sorting room, the mail carriers, the vault with the keys to the PO boxes.
- **Agents** — one PO box per `.agent` domain. `atlas.agent`, `mythos.agent`, `arcana.agent`. Each box has its own key, its own rules about what mail it accepts, its own log of every letter.
- **Agent frameworks** (KyberBot, OpenClaw, LangGraph, whatever) — the assistants reading mail at their respective desks. They don't carry keys. They don't sort. They just read what lands in their tray and write replies.

The post office is **addressable from outside** (DNS points at it). Inside, it routes mail to the right box based on the address on the envelope. Each box's assistant works independently and never sees the others' mail.

---

## A concrete three-agent setup

You run KyberBot three times on your laptop — one persona per agent.

```
 atlas.agent ── DNS ──┐
mythos.agent ── DNS ──┼── <your IP, :443>
arcana.agent ── DNS ──┘
                             │
                   ┌─────────▼──────────┐
                   │      Sidecar       │
                   │ (demuxes by Host)  │
                   │                    │
                   │  agent registry:   │
                   │   atlas  → ws-1    │
                   │   mythos → ws-2    │
                   │   arcana → ws-3    │
                   │                    │
                   │  keystore/ cedar/  │
                   │  connections/      │
                   │  audit/            │
                   └────┬───┬───┬───────┘
                        │   │   │
              ws-1      │   │   │
              ┌─────────▼───┘   │
              │ KyberBot-Atlas   │
              └─────────────────┘
                            │
                 ws-2       │
                 ┌──────────▼──────┐
                 │ KyberBot-Mythos │
                 └─────────────────┘
                                │
                      ws-3      │
                      ┌─────────▼───────┐
                      │ KyberBot-Arcana │
                      └─────────────────┘
```

**One sidecar. N agents. N framework processes.** Each agent has its own keys, own policies, own connections, own audit log.

---

## How you buy a `.agent` and make it an ARP agent

Two steps, not combined:

1. **Buy on Headless.** Normal cart + checkout. No ARP checkbox at purchase — you leave with just a domain.
2. **Set up ARP later, any time.** Open the Headless dashboard → your domain → two buttons appear next to it:
   - **[ Set up ARP Cloud ]** — redirects you to `arp.cloud/onboard`. Minutes to live. Agent runs in ARP Cloud.
   - **[ Set up ARP Local ]** — walks you through `principal-key.txt` download + sidecar install instructions. Agent runs on your machine.

You can flip between the two later. The `.agent` domain is yours either way.

---

## What ties an agent to its `.agent` domain

Three things, in layers:

1. **DNS:** each domain's A record points at wherever the sidecar listens (your IP via Tailscale Funnel / Cloudflare Tunnel / port forward, or ARP Cloud's ingress for cloud-hosted agents). That's how the world *reaches* the sidecar.

2. **`/.well-known/did.json` served per-host:** the sidecar picks the right DID document based on the incoming `Host:` header. That's how external verifiers confirm they're talking to the agent they think they are — the DID doc carries the agent's public key + the TLS fingerprint.

3. **The sidecar's internal agent table**, keyed on agent DID. Each row points at its own keystore entry, policy bundle, live framework connection, and audit-log shard.

No file in the agent's folder does this. The binding lives entirely in the sidecar.

---

## What does NOT tie the agent to the domain

**There is no manifest.** There is no `arp.config.json` dropped in your agent's directory. ARP does not read any file inside your agent's working folder. Your agent's folder — persona prompt, memory, tools, logs, whatever the framework wants — is 100% the framework's business.

The only thread between ARP's world and the framework's world is a **token string** generated once at `arp-sidecar init --domain <name>`. The sidecar writes it to `~/.arp/tokens/<domain>.token`. Your framework reads it at startup (usually via env var). The framework presents it over a local socket to authenticate as that agent. That's the entire coupling.

Move your agent folder to a different machine, keep the token, point the sidecar accordingly — the agent still is who it is.

---

## Files on disk, honestly

```
~/.arp/                          ← ARP's world
├── keystore/
│   ├── atlas.agent.key
│   ├── mythos.agent.key
│   └── arcana.agent.key
├── policies/
│   ├── atlas.agent.cedar
│   ├── mythos.agent.cedar
│   └── arcana.agent.cedar
├── tokens/
│   ├── atlas.agent.token        ← shared secret for KyberBot-Atlas
│   ├── mythos.agent.token
│   └── arcana.agent.token
├── db.sqlite                    ← agents, connections, audit
└── config.yaml

~/my-agents/                     ← YOUR world — ARP never looks here
├── atlas/
│   ├── persona.md
│   ├── memory/
│   ├── tools/
│   └── startup.sh               ← reads token, starts KyberBot
├── mythos/
│   └── ...
└── arcana/
    └── ...
```

The **only** filesystem bridge between these two worlds is your `startup.sh`, which reads a token from `~/.arp/tokens/…` and passes it as an environment variable to KyberBot. Everything else is separate.

---

## The pairing flow, concretely

Nick wants to work with **Mythos** on a project.

1. You open the local dashboard at `http://localhost:7878`. You **select Mythos** from the agent dropdown (top-left).
2. Click **"Pair with someone."** Mythos's sidecar signs a pairing invitation with its own key. The QR code on screen encodes the invitation — `issuer_agent_did: did:web:mythos.agent`, `requested_scopes: [share.drafts, message.send]`, `challenge: <random>`.
3. Nick scans it in his app. He sees: *"Mythos (did:web:mythos.agent) wants to pair for drafts + messaging."* Nick picks which of his own agents should respond.
4. Both sides review + approve. High-risk scopes prompt biometric.
5. A **Connection Token** is minted — a signed blob that says "mythos.agent ↔ nick.agent, scopes X/Y, obligations Z, valid until T." Both sides store it.

That token lives in Mythos's `connections` table. **Atlas and Arcana have no row for it.** They can't use it. If Atlas tried to send a message through this connection, the sidecar would reject it (policy engine: Atlas has no token for this peer).

---

## Two conversations, in parallel, independently

Nick's agent POSTs to `mythos.agent/didcomm`. Mike's agent POSTs to `atlas.agent/didcomm`. Same machine, same port 443, same sidecar.

The sidecar demuxes by `Host:` header. Mythos gets Nick's message. Atlas gets Mike's message. Each message runs through *its own agent's* policy bundle, *its own connection token*, *its own audit log*. The respective framework processes compose replies in their own personas. Sidecar signs each reply with the respective agent key and sends it back.

At no point do Mythos's messages leak to Atlas. Not by accident, not by bug — by construction, because they're two different agent records, two different keys, two different WebSocket pipes, two different connection tokens.

---

## The cloud path, briefly

When you pick **[ Set up ARP Cloud ]** instead of ARP Local, everything above still applies — except:

- There's no sidecar on your machine. The sidecar logic runs in Vercel Fluid Compute as `@kybernesis/arp-cloud-runtime`.
- There's no separate framework process. OpenClaw (or whichever framework you picked) is imported directly into the cloud-runtime and runs inside the same invocation.
- There's no token file. The framework doesn't need one — it's the same process as the runtime.
- Agent signing keys are stored encrypted in Neon, unwrapped per-invocation with the tenant's KEK.

From the outside, it looks identical: `ian.agent` DNS points at cloud.arp.run's ingress, `/.well-known/did.json` is served, ARP envelopes are signed + verified, pairing and policy work the same way. From the inside, the sidecar + framework + keystore that would be three things on your machine are one process in the cloud.

---

## The key invariant

**The agent framework never speaks ARP.** KyberBot speaks KyberBot. OpenClaw speaks OpenClaw. The adapter layer sits between framework and sidecar (local path) or framework and runtime (cloud path) and does all the ARP work — signature verification, DID resolution, policy evaluation, audit logging, envelope signing.

That's why swapping from KyberBot to LangGraph is a one-line config change. That's also why the answer to "how is KyberBot tied to `atlas.agent`?" is:

> **It isn't. The sidecar is. KyberBot just happens to be the assistant the sidecar forwards mail to for that agent.**

---

## One-paragraph elevator version

You buy a `.agent` domain on Headless. Later, in the Headless dashboard, you click one of two buttons — ARP Cloud or ARP Local — depending on whether you want the agent to run on their infrastructure or yours. Either way, you end up with a sidecar (on your machine or in the cloud) that owns the agent's identity keys, publishes its DID document, enforces its permission policies, and writes its audit log. Your agent framework — KyberBot, OpenClaw, whatever — runs separately and talks to the sidecar via a local socket authenticated by a shared secret. The framework never speaks the ARP protocol itself; the sidecar handles all of it. One sidecar can host many agents, each with its own domain, keys, policies, and audit trail. When you pair with someone else's agent, a signed connection token is minted that scopes exactly what the two agents can do together; either party can revoke it instantly. That's the whole system.
