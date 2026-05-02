# ARP — Agent Relationship Protocol

[![CI](https://github.com/KybernesisAI/arp/actions/workflows/ci.yml/badge.svg)](https://github.com/KybernesisAI/arp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![npm scope](https://img.shields.io/badge/npm-%40kybernesis-cb3837)](https://www.npmjs.com/org/kybernesis)
[![Node 24](https://img.shields.io/badge/node-24%20LTS-green)](https://nodejs.org)

> The open protocol for AI agents to work with each other — safely, with permission, on infrastructure you control.

ARP gives any two AI agents a way to pair, message, and prove what each is allowed to do. Sovereign identity (Handshake `.agent` + DIDs), per-purpose Connection Tokens, Cedar policy with plain-English consent, DIDComm v2 transport, tamper-evident audit. MIT-licensed.

- 🌐 **[arp.run](https://arp.run)** — open protocol
- ☁️ **[cloud.arp.run](https://cloud.arp.run)** — managed hosting (free tier)
- 🛠️ **[app.arp.run](https://app.arp.run)** — your dashboard once signed in
- 📚 **[docs.arp.run](https://docs.arp.run)** · **[spec.arp.run](https://spec.arp.run)** · **[status.arp.run](https://status.arp.run)**

---

## Install

You need:

| | Why | Get it |
|---|---|---|
| **Node.js 20+** | runs the agent + `arpc` | <https://nodejs.org> → LTS |
| **Terminal** | macOS Terminal / Windows Terminal | — |
| **ARP Cloud account** | hosts your `.agent` name | sign in at <https://cloud.arp.run> |

Then install the CLI once, on the machine where your agent runs:

```bash
npm install -g @kybernesis/arp
arpc version          # should print @kybernesis/arp 0.x.x
```

> macOS `EACCES` on global install? Either `sudo npm install -g @kybernesis/arp` or one-time fix: `mkdir -p ~/.npm-global && npm config set prefix '~/.npm-global' && echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc && source ~/.zshrc`.

---

## Setup — bring an agent online (≈ 10 minutes)

### 1. Get a `.agent` name

In your browser at [cloud.arp.run/dashboard](https://cloud.arp.run/dashboard):

1. Sign in (passkey or recovery phrase)
2. **Register a `.agent` domain** → pick a name (e.g. `atlas.agent`), pay the registrar fee, complete the bind-back

Your domain shows up with a yellow **PENDING** badge.

### 2. Provision the agent

Same dashboard, on your domain row:

1. **Provision agent** → name it (e.g. "Atlas") + optional description
2. The dashboard generates the agent's keys **and shows them once**. Click **Download `<your-domain>.arp-handoff.json`** and save it somewhere safe — ARP Cloud does not keep a copy. (Lose it? **Re-provision** rotates the key.)

Badge flips to blue **PROVISIONED**.

### 3. Set up the agent folder

Pick a folder for your agent's home (identity, memory, skills). Example uses `~/atlas`:

```bash
cd ~ && mkdir atlas && cd atlas
```

If you're using **KyberBot** (default framework — OpenClaw / Hermes / NanoClaw / LangGraph adapters also supported):

```bash
npm install -g @kyberbot/cli
kyberbot onboard            # writes identity.yaml
```

### 4. Drop the handoff in

```bash
mv ~/Downloads/atlas.agent.arp-handoff.json ./arp-handoff.json
chmod 600 arp-handoff.json     # private key — read-only by you
```

### 5. Initialise + sanity-check

```bash
arpc init --yes      # writes arp.json (framework + handoff path)
arpc doctor          # prints DID, gateway URL, framework — no network
```

### 6. Install the **contact** skill

This teaches your agent's brain how to message *other* agents when you ask:

```bash
arpc skill install contact
kyberbot skill rebuild        # KyberBot picks up the new skill
```

For Claude Code projects use `arpc skill install contact --target claude-code` instead.

### 7. Bring it online (auto-start daemon)

```bash
arpc host add ~/atlas         # register this agent with the supervisor
arpc service install          # auto-start service, survives reboots
arpc service status           # → installed · loaded · pid <n>
```

That's it. Your agent is live on `did:web:atlas.agent`, reachable from anywhere on the ARP network. Close the terminal — the daemon survives.

### 8. Verify

In [cloud.arp.run/dashboard](https://cloud.arp.run/dashboard):

- **Agents** section shows your agent with a green dot ●
- Click the agent name → connections page (empty until you pair)

From the terminal at any time:

```bash
arpc service status            # is it running?
arpc host status               # which agents are configured?
tail -f ~/.arp/host.log        # live log
```

---

## Use — pair with another agent

Pairing is what makes the agent useful: it can now talk to specific other agents under specific permissions.

### From the dashboard

1. Your agent's row → **Pair with another agent →**
2. Enter the peer DID (e.g. `did:web:samantha.agent`)
3. Pick a **scope bundle** — a predefined permission set (e.g. "Project collaboration", "Calendar coordination")
4. **Generate invitation** → copy the URL → send it to the other person over a channel you trust
5. They open it, sign in, **Accept**

Both sides now have an active **Connection Token** — a mutually-signed envelope binding the policy, scopes, expiry, and revocation URL.

### Tell your agent the contact's name

After they accept, the dashboard shows a copy-paste command. Run it in your agent folder:

```bash
arpc contacts add samantha did:web:samantha.agent
```

Now your agent can reach Samantha by name.

### Talk

From your agent's chat (Telegram / web UI / terminal — wherever you talk to KyberBot):

> "Ask Samantha what time she's free Friday."

The contact skill picks it up, runs `arpc send samantha "what time are you free Friday?"`, waits for the reply, includes it in its response to you. The Cedar policy on your Connection Token is evaluated on both sides — every message — before either LLM ever sees it.

### Manage live connections

In [app.arp.run](https://app.arp.run): the dashboard shows every connection, every scope, every recent message. **Revoke** any connection at any time — kill it surgically without touching any other.

---

## Multiple agents (fleet mode)

One daemon runs all your agents. After Step 7 for the first one, just repeat steps 3–6 in a new folder and:

```bash
arpc host add ~/nova
arpc host add ~/samantha
arpc host status
```

The daemon picks them up within a second — no restart. Remove one with `arpc host remove ~/nova`. Single log at `~/.arp/host.log`.

---

## Three install modes

| Mode | When | How |
|---|---|---|
| **Cloud** (above) | SaaS agents, zero infra | `npm install -g @kybernesis/arp` + handoff |
| **Sidecar** | self-hosted, privacy-max | `docker run -d -v ~/.arp:/data -p 8443:8443 ghcr.io/kybernesisai/arp-sidecar:latest` |
| **Library** | custom TS/Python agents | `npm install @kybernesis/arp-sdk`, ~30 LOC |

All three use the same wire format. Tokens bind to the agent DID, not the host — migrate later without re-pairing.

### Library mode (TypeScript)

```typescript
import { ArpAgent } from '@kybernesis/arp-sdk';

const agent = await ArpAgent.fromHandoff('./arp-handoff.json', {
  agentName: 'Atlas',
  onIncoming: async (task, ctx) => {
    // ctx.decision is already 'allow'; obligations applied on egress.
    const reply = await myLlm.complete(task.body);
    return { body: { result: reply } };
  },
});

await agent.start({ port: 4500 });
```

Python SDK lives at `python/arp-sdk/` (will split out at v1.0).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Agent doesn't appear on dashboard | `arpc service status` → if stopped, `arpc service install`; if running, refresh the dashboard |
| `bearer_expired` / `bad_signature` in log | Clock skew (>5 min). macOS: `sudo sntp -sS time.apple.com` |
| `unknown_agent` in log | Handoff DID ≠ cloud DID — re-download the handoff |
| Agent offline when laptop sleeps | Expected. Daemon wakes on unlock |
| Lost handoff | **Re-provision agent** in dashboard → download new JSON → replace `arp-handoff.json` → `arpc service uninstall && arpc service install` |

Take everything offline temporarily: `arpc service uninstall`. Bring back: `arpc service install`.

---

## Quick reference

```bash
# one-time per machine
npm install -g @kybernesis/arp

# per agent folder
arpc init --yes
arpc skill install contact
arpc host add .

# daemon (machine-wide)
arpc service install
arpc service status
arpc host status
tail -f ~/.arp/host.log

# pairing follow-up
arpc contacts add <name> <did:web:...>
arpc send <name-or-did> "message"
```

---

## Build from source (contributors)

**Requirements:** Node.js 24 LTS, pnpm 10+

```bash
git clone https://github.com/KybernesisAI/arp
cd arp
pnpm install
pnpm run typecheck && pnpm run build && pnpm run test && pnpm run lint
```

All four must exit 0. Routes through Turborepo — **never** use `pnpm -r <task>` (bypasses build-order coordination, breaks downstream typechecks). See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch conventions and the phase-review checklist.

---

## Documentation

| | |
|---|---|
| [`docs/ARP-quickstart-new-customer.md`](./docs/ARP-quickstart-new-customer.md) | Long-form version of the steps above |
| [`docs/ARP-developer-quickstart.md`](./docs/ARP-developer-quickstart.md) | 10-minute SDK intro + working agent in ~30 lines |
| [`docs/ARP-architecture.md`](./docs/ARP-architecture.md) | Seven-layer system design |
| [`docs/ARP-installation-and-hosting.md`](./docs/ARP-installation-and-hosting.md) | Cloud / Sidecar / Library in depth |
| [`docs/ARP-scope-catalog-v1.md`](./docs/ARP-scope-catalog-v1.md) | All 50 permission scopes |
| [`docs/ARP-policy-examples.md`](./docs/ARP-policy-examples.md) | Cedar policy worked examples |
| [`docs/ARP-adapter-authoring-guide.md`](./docs/ARP-adapter-authoring-guide.md) | Building framework adapters |
| [`docs/ARP-tld-integration-spec-v2.1.md`](./docs/ARP-tld-integration-spec-v2.1.md) | Headless `.agent` TLD contract |

Rendered: **[docs.arp.run](https://docs.arp.run)** · **[spec.arp.run](https://spec.arp.run)** · **[status.arp.run](https://status.arp.run)**

---

## License

MIT. See [LICENSE](./LICENSE).
