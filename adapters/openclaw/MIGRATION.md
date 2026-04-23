# Migrating an OpenClaw agent to ARP

## Before

```ts
import { OpenClaw } from 'openclaw';

const agent = new OpenClaw({ /* tools, channels, prompts */ });
await agent.start();
```

## After

```ts
import { OpenClaw } from 'openclaw';
import { arpPlugin } from '@kybernesis/arp-adapter-openclaw';

const agent = new OpenClaw({ /* tools, channels, prompts */ })
  .use(arpPlugin({
    handoff: './arp-handoff.json',
    dataDir: './.arp-data',
  }));
await agent.start();
```

## What ARP adds

- Cedar permission check before every action.
- Obligations (redact, rate limit, watermark) applied to every outbound result.
- Append-only hash-chained audit log per connection.
- Revocation + rotation events surfaced through OpenClaw's logger.

## What ARP does NOT change

- **No prompt changes.** Prompts, LLM routing, and tool registries are untouched.
- **No fork of OpenClaw.** The adapter is a normal OpenClaw plugin; you can remove it by deleting one `.use(...)` call.
- **No channels re-routed.** Your Slack / Discord / HTTP channels still work identically.

## FAQ

**Will my existing tools still work?**
Yes. `beforeAction` runs _before_ your tool; if the PDP allows, the tool runs unchanged.

**Latency?**
<5 ms per PDP check on a realistic bundle. See `ARP-installation-and-hosting.md §8`.

**Debuggability?**
Every decision flows through OpenClaw's `logger.info/warn/error`, and the hash-chained audit log lives at `<dataDir>/audit/<connection_id>.jsonl`. Use `arp-testkit audit <agent>` to verify.

**What about revocations?**
Subscribe via `agent.on('revocation', handler)` — the plugin exposes the underlying `ArpAgent` through `arpPlugin(...).agent()`.
