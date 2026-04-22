# `@kybernesis/arp-runtime`

The reference ARP agent runtime. Hono HTTP server, Cedar PDP, connection
registry, hash-chained audit log, DIDComm v2 signed messaging, and per-
connection memory partitioning — wired together behind a single
`Runtime` interface.

## Endpoints

| Path                             | Purpose                                   |
| -------------------------------- | ----------------------------------------- |
| `GET /health`                    | Liveness probe + version/uptime           |
| `GET /.well-known/did.json`      | W3C DID Document                          |
| `GET /.well-known/agent-card.json` | Agent Card                               |
| `GET /.well-known/arp.json`      | Version + capability advertisement        |
| `GET /.well-known/revocations.json` | Local list, or proxied to owner URL    |
| `POST /didcomm`                  | DIDComm v2 signed envelope ingest         |
| `POST /pair`                     | Stubbed (501) — implemented in Phase 4    |

## Request pipeline (POST /didcomm)

```
decrypt+verify signature (via @kybernesis/arp-transport)
  → load Connection Token from registry
  → verify not suspended / revoked
  → PDP.evaluate (@kybernesis/arp-pdp)
  → if allow → dispatch(handler)
  → audit.append (@kybernesis/arp-audit)
  → transport.send reply
```

Deny paths audit and return an error envelope; revocation audits as
`reason: "revoked"` and short-circuits the pipeline.

## Use

```ts
import { createRuntime } from '@kybernesis/arp-runtime';
import { createResolver } from '@kybernesis/arp-resolver';
import { createFileKeyStore } from '@kybernesis/arp-transport';
import schemaJson from '@kybernesis/arp-spec/cedar-schema.json' with { type: 'json' };

const runtime = await createRuntime({
  config: { did: 'did:web:samantha.agent', /* ... */ },
  keyStore: createFileKeyStore({ did, path: '/var/lib/arp/agent.key' }),
  resolver: createResolver(),
  cedarSchemaJson: JSON.stringify(schemaJson),
  registryPath: '/var/lib/arp/registry.sqlite',
  auditDir: '/var/lib/arp/audit',
  mailboxPath: '/var/lib/arp/mailbox.sqlite',
  dispatch: async ({ message, memory }) => {
    const prior = memory.get('last_seen');
    memory.set('last_seen', Date.now());
    return { reply: { prior } };
  },
});

await runtime.start(4401);
```

## Per-connection memory

`runtime.memory` is an in-memory Map-of-Maps keyed by `connection_id`. The
dispatch handler gets a pre-bound accessor:

```ts
dispatch: async ({ memory }) => {
  memory.set('knowledge', { foo: 'bar' }); // scoped to the connection
  const v = memory.get('knowledge');
}
```

Reads are strictly partitioned — `connection_A.get(k)` never returns a
value written under `connection_B`. See
`docs/ARP-phase-2-runtime-core.md §4 Task 9`.

## Shutdown

```ts
process.on('SIGTERM', async () => {
  await runtime.stop();
});
```

`stop()` drains the transport, closes SQLite, and releases the HTTP port.
