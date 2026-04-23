# @kybernesis/arp-adapter-nanoclaw

Lightweight ARP adapter for **NanoClaw** — the constrained-footprint variant
of OpenClaw. ≤500 lines of source by design.

## Install

```bash
pnpm add @kybernesis/arp-adapter-nanoclaw @kybernesis/arp-sdk
```

## Two integration shapes

### 1. Wrap a tool directly

When NanoClaw calls your tool as a plain async function:

```ts
import { ArpAgent } from '@kybernesis/arp-sdk';
import { arpGuardedTool } from '@kybernesis/arp-adapter-nanoclaw';

const agent = await ArpAgent.fromHandoff('./arp-handoff.json');
await agent.start();

export const search = arpGuardedTool(
  agent,
  { connectionId: currentConnectionId, toolName: 'search' },
  async (args: { q: string }) => runSearch(args.q),
);
```

### 2. Wrap a NanoClaw-like host

When NanoClaw exposes a pluggable tool wrapper / inbound hook:

```ts
import { NanoClaw } from 'nanoclaw';
import { withArp } from '@kybernesis/arp-adapter-nanoclaw';

const nano = new NanoClaw({ /* config */ });
const guarded = withArp(nano, {
  handoff: './arp-handoff.json',
  outboundOnly: true, // common in serverless deployments
});
await guarded.start();
```

## Constrained-environment notes

- Bundle target: `esm + cjs`, single file output via tsup.
- `outboundOnly: true` skips starting the HTTP DIDComm listener — use this on edge / FaaS where inbound traffic goes through ARP Cloud, not through your process.
- The adapter never installs filesystem writers of its own — the SDK's `bootstrap` only needs a 32-byte key path. On read-only FS, pass `privateKey` directly and avoid disk entirely.

## Framework access note

If your NanoClaw build exposes a different hook interface (subclass, decorator), file an upstream issue. The adapter's `NanoClawLike` interface is the minimal public projection; never touches internals (Phase-6 Rule 2).

See [`MIGRATION.md`](./MIGRATION.md).
