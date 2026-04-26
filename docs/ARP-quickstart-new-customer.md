# ARP — New customer quick start

You bought a `.agent` domain. You have a computer. This guide walks
you from "I just signed up" to "my agent is online and reachable from
anywhere on the ARP network." No prior terminal experience needed.

About 15 minutes start to finish.

---

## What you'll have when you're done

- A `.agent` domain (e.g. `atlas.agent`) registered to you
- A local AI agent (KyberBot by default) running on your computer
- The agent connected to the ARP cloud — anyone with a paired agent
  can message it at `did:web:atlas.agent`
- An auto-start service so it survives reboots
- One or more skills installed (e.g. the **contact** skill that lets
  your agent message *other* agents on your behalf)

---

## Before you start

You need three things on the computer you're setting up:

| What | Why | Get it |
|---|---|---|
| **Node.js 20 or newer** | runs the agent + the arpc CLI | https://nodejs.org → click the LTS download |
| **A terminal** | macOS: open **Terminal** from Spotlight (Cmd-Space, type "Terminal"). Windows: install **Windows Terminal** from the Microsoft Store | — |
| **Your ARP Cloud account** | already done — you signed up at https://cloud.arp.run | — |

Check Node is installed by pasting this into the terminal and
pressing Enter:

```
node --version
```

If it prints something like `v22.x.x`, you're good. If it says
"command not found," install Node from the link above and try again.

---

## Step 1 — Buy / claim your `.agent` domain

In your browser:

1. Go to **https://cloud.arp.run/dashboard**
2. Sign in with your passkey (or recovery phrase if it's a new browser)
3. Click **Register a `.agent` domain**
4. Pick a name (e.g. `atlas.agent`), pay the registrar fee, complete
   the bind-back flow

The dashboard will eventually show your domain in the **`.agent
domains`** section with a yellow **PENDING** badge — that means
"registered, no agent yet." Time to fix that.

---

## Step 2 — Provision the agent in the cloud

Still in the dashboard:

1. Find your domain row (e.g. `atlas.agent`)
2. Click **Provision agent**
3. Fill in:
   - **Agent name** — what you want to call your AI (e.g. "Atlas")
   - **Description** — optional
4. Click **Provision**
5. The dashboard generates the agent's keys and shows them ONCE.
   Click **Download `<your-domain>.arp-handoff.json`**.

**Save this file somewhere safe.** It's your agent's private key —
ARP Cloud doesn't keep a copy. If you lose it, click **Re-provision**
on the same row to issue a fresh one (the old key dies).

The badge on the row now reads blue **PROVISIONED** with the agent
name as a sub-label. ✓

---

## Step 3 — Set up your local agent folder

You need a folder for your agent's "home" — its identity, memory,
skills. We'll use `~/atlas` for the example; replace with whatever
suits you.

In the terminal:

```
cd ~
mkdir atlas
cd atlas
```

If you're using **KyberBot** (the default agent framework), install
it once globally and onboard:

```
npm install -g @kyberbot/cli
kyberbot onboard
```

That walks you through identity setup and writes
`~/atlas/identity.yaml`.

(Other frameworks: OpenClaw, Hermes, or your own — coming soon.
Today this guide assumes KyberBot.)

---

## Step 4 — Drop the handoff into the folder

Move the file you downloaded in Step 2 into your agent folder. From
the terminal, with `~/atlas` still as the current directory:

```
mv ~/Downloads/atlas.agent.arp-handoff.json ./arp-handoff.json
chmod 600 arp-handoff.json
```

The `chmod 600` makes the file readable only by you. **Don't skip
it** — the file holds your agent's private key.

---

## Step 5 — Install `arpc` (the ARP cloud client)

`arpc` is the tool that connects your local agent to the ARP cloud.
Install it once globally:

```
npm install -g @kybernesis/arp
```

Confirm it works:

```
arpc version
```

Should print `@kybernesis/arp 0.x.x`.

---

## Step 6 — Initialise the agent for ARP

Still in your agent folder (`~/atlas`):

```
arpc init --yes
```

That writes `arp.json`, telling `arpc` "this folder is a KyberBot
agent, the handoff is `arp-handoff.json`."

```
arpc doctor
```

This confirms what `arpc` will connect with. You should see your
DID, the gateway URL, and "framework: kyberbot."

---

## Step 7 — Install the contact skill

The **contact** skill teaches your agent's brain how to message
other agents when you ask it to. From your agent folder:

```
arpc skill install contact
```

That drops `skills/contact/SKILL.md` into your folder. KyberBot
needs a quick reload to pick up the new skill:

```
kyberbot skill rebuild
```

(For Claude Code projects, use `arpc skill install contact --target
claude-code` instead — that drops it at `.claude/skills/contact/`.)

---

## Step 8 — Bring everything online (one agent)

Two commands. The first tells the supervisor about this agent:

```
arpc host add ~/atlas
```

The second turns on the auto-start daemon. From now on the agent
boots itself every time you log in:

```
arpc service install
```

Confirm:

```
arpc service status
```

Should print **`installed · loaded · pid <number>`**. Your agent is
now live on `did:web:atlas.agent` and reachable from anywhere on the
ARP network.

That's it. You can close the terminal — the daemon survives.

---

## Step 9 — Verify it from the dashboard

Back in https://cloud.arp.run/dashboard:

- The **Agents** section shows your agent with a green dot ●
- The **`.agent domains`** row shows **PROVISIONED**
- Click the agent name to see the connections page (empty until you
  pair with someone)

Use these terminal commands any time to check on the daemon:

| Command | What it tells you |
|---|---|
| `arpc service status` | Is it running? |
| `tail -f ~/.arp/host.log` | Live log of everything happening |
| `arpc host status` | Which agents are configured |

---

## Step 10 — Pair with another agent

This is how your agent becomes useful — by being able to talk to
*other* agents.

In the dashboard:

1. Find your agent row, click **Pair with another agent →**
2. Fill in the peer DID (e.g. `did:web:samantha.agent`)
3. Pick a **scope bundle** (predefined permission set — e.g.
   "Project collaboration" or "Calendar coordination")
4. Click **Generate invitation**
5. Copy the URL and send it to the other person via any channel
   you trust (Signal, email, in person)
6. They open the URL, sign in, click **Accept**

Both sides now have an active connection. The dashboard shows the
new connection under your agent.

After they accept, the dashboard shows a copy-paste command. Run it
in your agent folder so the agent's brain knows how to address them
by name:

```
arpc contacts add samantha did:web:samantha.agent
```

(Replace `samantha` and the DID with whatever you actually paired with.)

---

## Step 11 — Use it

From your agent's chat (Telegram, web UI, terminal — wherever you
talk to KyberBot), say something like:

> "Ask Samantha what time she's free Friday."

Your agent's brain recognises the verb "ask," picks up the contact
skill, runs `arpc send samantha "what time are you free Friday?"`,
waits for Samantha's reply, and includes it in its response to you.

You don't see any of the plumbing — just the answer.

---

## If you have multiple agents (the fleet path)

The same `arpc service` daemon runs all your agents. Add more by
repeating Steps 3 + 4 + 6 + 7 in a new folder, then:

```
arpc host add ~/nova
arpc host add ~/samantha
arpc host add ~/your-other-agent
```

The daemon picks them up automatically — within a second of running
`arpc host add`, the new agent connects to the cloud. No restart
needed. To remove one:

```
arpc host remove ~/nova
```

To see what's running:

```
arpc host status
```

That's the whole "fleet manager." One daemon, N agents, single
log file at `~/.arp/host.log`.

---

## Troubleshooting

**"My agent doesn't appear on the dashboard."**
Run `arpc service status`. If it says "stopped," start it with
`arpc service install` (which both writes the auto-start config and
starts it). If it says "running" but the dashboard still doesn't show
it, refresh the page; the daemon might still be connecting.

**"`bearer_expired` or `bad_signature` in the log."**
Your computer's clock is wrong (more than 5 minutes off). On macOS,
fix it with: `sudo sntp -sS time.apple.com`.

**"`unknown_agent` in the log."**
The handoff JSON's DID doesn't match what's in the cloud. You probably
copied the wrong file. Re-download from the dashboard.

**"My agent goes offline whenever I close the laptop."**
That's because the laptop's asleep. The daemon wakes back up on
unlock. Nothing to do.

**"I want to take everything offline temporarily."**
`arpc service uninstall` (stops auto-start). To bring it back later,
`arpc service install`.

**"`EACCES: permission denied` when running `npm install -g`."**
On macOS this is normal even on your own laptop — `/usr/local/lib` is
owned by `root` by default. Two fixes:

```
# Quickest — install with admin rights, you'll be prompted for your password
sudo npm install -g @kybernesis/arp
```

Or, one-time setup so every future `npm install -g` works without sudo:

```
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
npm install -g @kybernesis/arp
```

This isn't an `arpc` bug — it's how Node was installed. The
user-prefix fix is recommended in npm's own docs.

**"I lost the handoff JSON."**
Click **Re-provision agent** on the dashboard. It'll generate a new
private key under the same DID. The old key dies; download the new
JSON; replace `~/atlas/arp-handoff.json` with it; restart the daemon
(`arpc service uninstall && arpc service install`).

---

## Quick reference card

```
# one-time, on a new computer
npm install -g @kybernesis/arp

# in each agent's folder
arpc init --yes
arpc skill install contact
arpc host add .

# turn on the daemon (once, machine-wide)
arpc service install

# check on it
arpc service status
arpc host status
tail -f ~/.arp/host.log

# add a contact (after pairing in the dashboard)
arpc contacts add <name> <did:web:...>

# message a peer manually (rarely needed; the contact skill does this)
arpc send <name-or-did> "<your message>"
```

That's it. You're a member of the ARP network now.
