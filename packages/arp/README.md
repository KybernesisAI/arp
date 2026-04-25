# @kybernesis/arp

`arpc` — one CLI to connect local AI agents to ARP Cloud.

> The bin is **`arpc`** (not `arp`) so it doesn't collide with macOS's
> built-in `/usr/sbin/arp` network tool.

## Install

```bash
npm install -g @kybernesis/arp
```

…or use it without installing via npx (longer to type, but no global state):

```bash
npx @kybernesis/arp <command>
```

## Quick start — one agent (background, recommended)

```bash
arpc host add ~/atlas    # tell the supervisor about your agent folder
arpc host start          # daemonise — runs in background, no terminal needed
arpc host status         # confirm
arpc host stop           # graceful shutdown
```

The daemon logs to `~/.arp/host.log`. Each agent's bridge auto-restarts
on crash with exponential backoff. Stops cleanly with `arpc host stop`.

## Quick start — many agents

```bash
arpc host add ~/atlas
arpc host add ~/nova
arpc host add ~/samantha
arpc host start
```

One process holds all the bridges. The supervisor reads each folder's
`arp.json` manifest (or legacy `identity.yaml` for kyberbot) so adding
an agent is just `arpc host add <folder>`.

## One agent in foreground (debugging)

```bash
cd ~/atlas
arpc           # attaches stdio, Ctrl-C to stop
arpc doctor    # show what would connect, don't actually do it
arpc init      # create / overwrite arp.json (interactive)
```

## Per-agent manifest — `arp.json`

Each agent folder declares its framework + handoff:

```jsonc
{
  "framework": "kyberbot",            // kyberbot | openclaw | hermes | generic-http
  "handoff": "./arp-handoff.json",    // optional; auto-detected
  "kyberbot": { "root": "." }
}
```

For a custom agent that exposes any HTTP endpoint:

```jsonc
{
  "framework": "generic-http",
  "handoff": "./arp-handoff.json",
  "generic-http": {
    "url": "http://127.0.0.1:8080/arp",
    "token": "${MY_AGENT_TOKEN}"      // ${ENV_VAR} substitution
  }
}
```

`arpc init` will create this for you interactively (or `--yes` for defaults).

## Subcommands cheatsheet

```text
arpc                       connect this folder's agent (foreground)
arpc init [--yes]          create arp.json
arpc doctor                show what would connect; don't open WS
arpc host                  foreground supervisor — runs all agents
arpc host start            daemonise the supervisor
arpc host stop             stop the daemon
arpc host status           daemon + agent list
arpc host list             print configured agents
arpc host add <folder>     add an agent
arpc host remove <folder>  remove an agent
arpc version
arpc help
```
