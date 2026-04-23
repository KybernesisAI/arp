# @kybernesis/arp-cloud-client

Outbound WebSocket client for ARP Cloud (Phase 7).

## What it does

Runs on a user's machine (macOS, Linux, or any Node 24 host) and maintains a persistent WebSocket to `wss://arp.cloud/ws`. When the cloud receives a DIDComm message for that user's agent it pushes the envelope down the socket; the client POSTs the envelope to the user's locally-running agent HTTP endpoint and acknowledges the cloud once delivery succeeds.

## Install + run

```bash
npx @kybernesis/arp-cloud-client init          # interactive setup
npx @kybernesis/arp-cloud-client start         # run in foreground
npx @kybernesis/arp-cloud-client install-service   # systemd / launchd unit
npx @kybernesis/arp-cloud-client status        # dump config
```

Configuration lives at `~/.arp-cloud/config.json`; the private key is a separate 32-byte file at `~/.arp-cloud/private.key` (mode 0600). The public key of that pair is registered with the cloud when you provision your agent in the ARP Cloud dashboard.

## Reconnect policy

Exponential backoff: 1s, 2s, 4s, 8s, …, capped at 60s. Messages queued while the client is disconnected stay in the cloud for 7 days; on reconnect the server drains the queue in insertion order, no loss.

## Zero DIDComm deps

The cloud is authoritative for envelope verification and PDP decisions. The client never parses envelopes — it only transports bytes between the socket and the local agent. This keeps the package tiny (<500 LOC) and removes an entire class of security bugs.
