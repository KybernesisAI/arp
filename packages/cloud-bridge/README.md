# @kybernesis/arp-cloud-bridge

External bridge that connects an ARP-provisioned agent (handoff JSON
from cloud.arp.run) to a locally running agent framework (KyberBot,
OpenClaw, Hermes, generic HTTP). **The agent framework is never
modified** — the bridge speaks each framework's existing native API.

## Quick start (KyberBot)

```bash
npx @kybernesis/arp-cloud-bridge \
  --handoff ~/atlas/arp-handoff.json \
  --target kyberbot \
  --kyberbot-root ~/atlas
```

The bridge:

1. Opens a WebSocket to the cloud-gateway (URL embedded in the handoff).
2. Authenticates with the agent's private key.
3. Receives inbound DIDComm envelopes pushed down the WS.
4. Calls `POST /api/web/chat` on the running KyberBot agent (the same
   endpoint its web UI uses), reads the SSE stream for the assistant's
   reply.
5. Signs the reply as a DIDComm response and sends it back through the
   WS.

No tunnel. No public port. No code changes to KyberBot.

## Generic HTTP (any framework)

If your agent has any HTTP endpoint that accepts `{ prompt, sessionId }`
and returns a reply, point the bridge at it:

```bash
npx @kybernesis/arp-cloud-bridge \
  --handoff ./handoff.json \
  --target generic-http \
  --url http://127.0.0.1:9090/arp \
  --token sk-...
```

## Programmatic API

```ts
import { startBridge, createKyberBotAdapter } from '@kybernesis/arp-cloud-bridge';

await startBridge({
  handoffPath: '/Users/me/atlas/arp-handoff.json',
  adapter: createKyberBotAdapter({ root: '/Users/me/atlas' }),
});
```

See `src/types.ts` for the `Adapter` interface — write your own to plug
in any framework that doesn't fit the KyberBot or generic-HTTP patterns.
