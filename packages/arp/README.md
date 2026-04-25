# @kybernesis/arp

One command to connect a local AI agent to ARP Cloud.

## Quick start

```bash
cd ~/atlas                 # or wherever your agent lives
npx @kybernesis/arp
```

That's it. The CLI looks in the current directory for:
- `arp-handoff.json` (or `*.arp-handoff.json`) — the credentials downloaded from
  [cloud.arp.run/dashboard](https://cloud.arp.run/dashboard) when you provisioned
  the agent
- `identity.yaml` — to know it's a KyberBot agent

It then opens a WebSocket to the cloud-gateway and relays inbound DIDComm
messages to your local agent. **Your agent's code is not modified.** Ctrl-C
to stop.

## Subcommands

```bash
arp                # connect (default)
arp connect        # explicit form of the default
arp doctor         # show what would connect, without opening the WS
arp version
arp help
```

## Flags (rarely needed)

```bash
arp --handoff /path/to/handoff.json
arp --url http://127.0.0.1:9090/arp --token <bearer>     # generic HTTP target
arp --cloud-ws-url wss://gateway.arp.run/ws              # override gateway URL
```

## Programmatic API

For embedded use, depend directly on `@kybernesis/arp-cloud-bridge`. This
package is a thin CLI wrapper.
