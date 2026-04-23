# Migrating a Hermes-Agent to ARP

## Before

```ts
import { HermesAgent } from 'hermes-agent';
const agent = new HermesAgent({ /* ... */ });
await agent.start();
```

## After

```ts
import { HermesAgent } from 'hermes-agent';
import { withArp } from '@kybernesis/arp-adapter-hermes-agent';

const guarded = withArp(new HermesAgent({ /* ... */ }), {
  handoff: './arp-handoff.json',
});
await guarded.start();
```

## What ARP adds

- Cedar PDP check before every tool call.
- Obligation pipeline (redact, rate limit, watermark) applied to every outbound reply.
- Audit log per connection, hash-chained.
- Lifecycle events (`revocation`, `rotation`, `pairing`) surface through `guarded.agent.on(...)`.

## What doesn't change

- **No prompt changes.** Hermes-Agent's prompt/routing configuration is untouched.
- **No fork.** The adapter is a tiny plugin — remove the wrapper in one line to go back.
- **No concurrency regressions.** PDP calls are in-process and run isolated per connection; the 5 s check-timeout catches pathological policy hangs.

## FAQ

**Will my tools still work?**
Yes. The middleware only wraps the invocation — your tool code runs unchanged when the PDP allows.

**Latency?**
<5 ms per check.

**Can I debug?**
Every decision is emitted via `hermes.emit('arp.decision', …)` and written to `<dataDir>/audit/<connection_id>.jsonl`. Use `arp-testkit audit <agent>` to verify the chain.

**Revocations?**
`guarded.agent.on('revocation', handler)` fires as soon as the owner revokes a connection. Subsequent tool calls and peer messages on that connection are denied at PDP time.
