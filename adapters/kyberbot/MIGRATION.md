# Migrating a KyberBot agent to ARP

## Before (no ARP)

```ts
import { KyberBot } from 'kyberbot';

const bot = new KyberBot({
  // tool registry, channels, prompt config …
});
await bot.start();
```

## After (with ARP)

```ts
import { KyberBot } from 'kyberbot';
import { withArp } from '@kybernesis/arp-adapter-kyberbot';

const bot = new KyberBot({
  // same tool registry, channels, prompt config …
});
const guarded = withArp(bot, {
  handoff: './arp-handoff.json',
  dataDir: './.arp-data',
  port: 4500,
});
await guarded.start();
```

## What ARP does for you

- Adds a Cedar permission check before every outbound tool invocation.
- Applies obligations (redaction, rate-limits, watermarks) to outbound responses.
- Maintains an append-only audit log per connection.
- Exposes admin endpoints (`/admin/connections`, `/admin/audit/:id`, `/admin/connections/:id/revoke`) for the owner app.
- Pairs with peer ARP agents via the Phase-4 pairing flow.

## What ARP does NOT do

- Does **not** modify your prompt, LLM routing, or tool schemas.
- Does **not** proxy your own channels (Slack / Discord / etc.) — those still flow through KyberBot.
- Does **not** require you to change your tool-call code; the middleware wraps them transparently.

## FAQ

**Will my existing tools still work?**
Yes. The adapter registers a middleware in front of every tool call; if the PDP allows it the middleware hands off to your existing implementation unchanged.

**How much latency does this add?**
The Cedar PDP check is in-process and typically <1 ms for a realistic policy bundle; the obligation pipeline is a synchronous JSON transform. Total overhead is well under the 5 ms budget stated in `ARP-installation-and-hosting.md §8`.

**Can I debug what the PDP decides?**
Yes — every decision is logged through KyberBot's own logger (the adapter calls `bot.log('info', ...)`) and written to the agent-local audit log at `<dataDir>/audit/<connection_id>.jsonl`. The audit log is hash-chained; use `arp-testkit audit <agent>` to verify integrity.

**What happens on revocation?**
The adapter subscribes to `agent.on('revocation', ...)` and KyberBot's logger sees the event immediately. Any subsequent tool call or peer message for that connection is denied at PDP time.
