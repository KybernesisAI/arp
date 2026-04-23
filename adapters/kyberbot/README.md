# @kybernesis/arp-adapter-kyberbot

ARP adapter for the **KyberBot** agent framework.

Wraps a KyberBot instance with the five ARP integration points:
1. **Check** — every outbound tool invocation routes through `agent.check()` before running.
2. **Egress** — every outbound response runs through `agent.egress()` with the connection's obligations.
3. **onIncoming** — inbound ARP peer messages go through the SDK's DIDComm → PDP pipeline.
4. **Audit** — allow/deny decisions stream into KyberBot's logger and the ARP audit log.
5. **Lifecycle events** — revocation / rotation / pairing events surface through the wrapped agent.

## Install

```bash
pnpm add @kybernesis/arp-adapter-kyberbot @kybernesis/arp-sdk
```

## Usage

```ts
import { KyberBot } from 'kyberbot';
import { withArp } from '@kybernesis/arp-adapter-kyberbot';

const bot = new KyberBot({ /* normal KyberBot config */ });
const guarded = withArp(bot, {
  handoff: './arp-handoff.json',
  dataDir: './.arp-data',
  port: 4500,
});

await guarded.start();
```

## How it talks to KyberBot

The adapter consumes a small **structural type** (`KyberBotLike`) covering the KyberBot public-API methods it needs:

| `KyberBotLike` method   | KyberBot public API it maps to          |
|-------------------------|-----------------------------------------|
| `onMessage(handler)`    | KyberBot's inbound message hook         |
| `useToolMiddleware(mw)` | KyberBot's tool-invocation middleware   |
| `useResponseFilter(fn)` | KyberBot's outbound response filter     |
| `log(level, msg, meta)` | KyberBot's built-in structured logger   |
| `start()` / `stop()`    | Normal KyberBot lifecycle               |

This structural-typing approach means the adapter **does not import KyberBot internals** and never forks the framework source (per Phase-6 Rule 2). Anything that implements `KyberBotLike` works, including a test fake — see `tests/stubs/kyberbot-fake.ts`.

> **Framework access note:** at the time of publishing, KyberBot is distributed through its own channels rather than as a small stand-alone npm package under the name `kyberbot`. If your KyberBot build exposes a different public extension API, file an upstream issue — the adapter will track the public shape, not an internal one.

## Customising the mapping

| Option              | Purpose |
|---------------------|---------|
| `toolMapping`       | Map `(toolName, args)` → `{ action, resource, context }`. Defaults to `action = toolName`, `resource = { type: 'Tool', id: toolName }`. |
| `resolveConnectionId` | Pull the ARP `connection_id` out of a KyberBot message. Defaults to `msg.connectionId ?? msg.body.connection_id`. |
| `onToolDenied`      | Replace the tool result when the PDP denies. Defaults to `{ error: 'denied_by_arp', reason }`. |
| `agent`             | Inject a pre-built `ArpAgent` (tests, embedded use). When provided, `handoff` is not required. |

## Migration from unguarded KyberBot

See [`MIGRATION.md`](./MIGRATION.md).
