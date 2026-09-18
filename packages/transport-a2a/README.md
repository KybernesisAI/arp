# @kybernesis/arp-transport-a2a

Outbound [A2A v1.0](https://a2a-protocol.org) transport for ARP. Resolves a peer's signed agent card, speaks JSON-RPC `message/send` with the ARP Connection Token as the bearer credential, and maps the returned task back onto an ARP `/response` message — so the rest of ARP (audit, reply correlation, adapters) never sees A2A.

Spec: [RFC-0005 — ARP as an A2A extension](https://spec.arp.run/rfcs/0005-arp-as-an-a2a-extension).

```ts
import { createA2aTransport, connectionTokenBearer } from '@kybernesis/arp-transport-a2a';

const a2a = createA2aTransport({
  did: 'did:web:me.agent',
  mirrorSuffix: '.arp.run',                       // `.agent` peers resolve via their ICANN mirror
  bearerFor: (peerDid) => connectionTokenBearer(tokenFor(peerDid)),
});

a2a.listen(async (response) => console.log(response.body.text));
await a2a.send('did:web:peer.example', {
  id: 'msg-1', type: 'https://didcomm.org/arp/1.0/request',
  from: 'did:web:me.agent', to: ['did:web:peer.example'], thid: 'thid-1',
  body: { text: 'hello', connection_id: 'conn_1' },
});
```

Lower-level pieces are exported too: `a2aOriginForDid`, `resolveA2aInterface`, `createA2aClient` (`sendMessage`, `getTask`, `sendAndWait`), `taskText`.

Task → ARP mapping:

| A2A task state | Result |
|---|---|
| `COMPLETED` | `/response` message handed to the listener (`sendAndCollect` returns it) |
| `SUBMITTED` / `WORKING` | polled via `tasks/get` until settled or `waitMs` |
| `REJECTED`, `AUTH_REQUIRED`, `FAILED`, `CANCELED` | `send` throws `{ code: 'send_failed', state }`; `sendAndCollect` returns `denied` |

MIT.
