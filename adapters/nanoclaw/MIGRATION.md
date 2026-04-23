# Migrating a NanoClaw deployment to ARP

## Before

```ts
import { NanoClaw } from 'nanoclaw';
const nano = new NanoClaw({ /* ... */ });
await nano.start();
```

## After (tool-level)

```ts
import { NanoClaw } from 'nanoclaw';
import { ArpAgent } from '@kybernesis/arp-sdk';
import { arpGuardedTool } from '@kybernesis/arp-adapter-nanoclaw';

const nano = new NanoClaw({ /* ... */ });
const agent = await ArpAgent.fromHandoff('./arp-handoff.json');
await agent.start({ port: 4500 });

nano.registerTool(
  'search',
  arpGuardedTool(agent, { connectionId: currentConnectionId, toolName: 'search' },
    async (args) => runSearch(args)),
);
await nano.start();
```

## After (NanoClaw-like host)

```ts
import { NanoClaw } from 'nanoclaw';
import { withArp } from '@kybernesis/arp-adapter-nanoclaw';

const guarded = withArp(new NanoClaw({ /* ... */ }), {
  handoff: './arp-handoff.json',
});
await guarded.start();
```

## What ARP adds on NanoClaw

- Cedar PDP gate before every tool call.
- Obligations (redact, rate limit, watermark) on every outbound reply.
- Append-only audit log.
- **Constrained-friendly**: `outboundOnly: true` skips HTTP binding for edge / FaaS deployments; `privateKey` injection avoids disk I/O entirely.

## FAQ

**Latency on constrained hardware?**
The PDP is in-process Cedar-WASM; on a modern x86 it runs a realistic policy bundle in well under 5 ms. Memory footprint is <10 MB for the WASM runtime itself.

**Can I run without a disk?**
Yes. Pass `privateKey` directly (from a KMS / vault) and set a memory-backed `dataDir` (e.g. `/tmp` on Lambda, or a ramdisk). The SDK will accept your injected key without writing.

**Bundle size?**
The adapter itself is <10 KB. The SDK + runtime are <100 KB gzipped. The Cedar-WASM binary is the dominant size (~1 MB uncompressed).
