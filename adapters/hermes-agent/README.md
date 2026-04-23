# @kybernesis/arp-adapter-hermes-agent

ARP adapter for **Hermes-Agent**, wrapping the framework's public
middleware / event surface.

## Install

```bash
pnpm add @kybernesis/arp-adapter-hermes-agent @kybernesis/arp-sdk
```

## Usage

```ts
import { HermesAgent } from 'hermes-agent';
import { withArp } from '@kybernesis/arp-adapter-hermes-agent';

const guarded = withArp(new HermesAgent({ /* normal config */ }), {
  handoff: './arp-handoff.json',
  dataDir: './.arp-data',
  port: 4500,
});

await guarded.start();
```

## Public extension points used

| Hermes-Agent API | ARP behaviour |
|---|---|
| `useToolMiddleware(mw)` | `guardAction()` — check → run → egress → audit. |
| `onPeerMessage(handler)` | Inbound peer task gated by `agent.check()`. |
| `useEgress(fn)` | Applies connection-level obligations. |

Multi-agent-in-one-process installs are safe: the adapter scopes all per-check state by `agentInstanceId` (defaults to `hermes.id`) to prevent cross-agent leakage.

## Options

| Option | Purpose |
|---|---|
| `handoff` | Handoff bundle path or object. |
| `agent` | Inject a pre-built `ArpAgent` (tests). |
| `port` | Runtime bind port (default 4500). |
| `agentInstanceId` | Override the per-agent scoping id. |
| `toolMapping` | Map tool call → ARP action/resource. |
| `onToolDenied` | Customise the denied-tool fallback. |
| `checkTimeoutMs` | Max wait for a PDP call (default 5000). |

## Framework access note

If your Hermes-Agent build exposes different middleware hooks, file an upstream issue. The adapter pins against `HermesAgentLike` — a typed projection of the public API. It never touches Hermes-Agent internals (Phase-6 Rule 2).

See [`MIGRATION.md`](./MIGRATION.md).
