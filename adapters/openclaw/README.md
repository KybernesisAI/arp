# @kybernesis/arp-adapter-openclaw

ARP adapter for **OpenClaw**, published as an OpenClaw plugin.

## Install

```bash
pnpm add @kybernesis/arp-adapter-openclaw @kybernesis/arp-sdk
```

## Usage

```ts
import { OpenClaw } from 'openclaw';
import { arpPlugin } from '@kybernesis/arp-adapter-openclaw';

const agent = new OpenClaw({ /* normal OpenClaw config */ })
  .use(arpPlugin({
    handoff: './arp-handoff.json',
    dataDir: './.arp-data',
  }));

await agent.start();
```

## Plugin hooks used

The adapter consumes OpenClaw's documented public plugin surface — **never** touches internals:

| OpenClaw plugin hook | ARP behaviour |
|---|---|
| `install(client)` | Boots the ARP runtime once. |
| `beforeAction(ctx)` | `agent.check()` → `{ allow, reason }`. |
| `afterAction(ctx, result)` | `agent.egress()` applies obligations. |
| `onInboundMessage(msg)` | `guardAction()` routes scoped peer tasks. |

## Framework access note

If your OpenClaw build exposes a different plugin interface, file an upstream issue with the OpenClaw maintainers — the adapter tracks the **public extension surface**, never internal classes (per Phase-6 Rule 2). The `OpenClawLike` structural type in `src/types.ts` is the exact projection this adapter depends on.

## Options

| Option | Purpose |
|---|---|
| `handoff` | Path to `arp-handoff.json` or a parsed bundle. Required unless `agent` is injected. |
| `agent` | Pre-built `ArpAgent` (tests). |
| `port` | HTTP port the runtime binds to (default `4500`). |
| `actionMapping` | Map an OpenClaw action → ARP action/resource. Defaults to `{ action: action.name, resource: { type: 'Action', id: action.name }, context: action.args }`. |

See [`MIGRATION.md`](./MIGRATION.md) for the before/after walkthrough.
