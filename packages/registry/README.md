# `@kybernesis/arp-registry`

Agent-local SQLite store for Connection Tokens, rolling spend windows, and
revocations. Used by the runtime to persist the connection registry across
restarts.

## Install

```bash
pnpm add @kybernesis/arp-registry
```

## Use

```ts
import { openRegistry } from '@kybernesis/arp-registry';

const reg = openRegistry('/var/lib/arp/registry.sqlite');

await reg.createConnection({
  token,                       // ConnectionToken (schema-validated upstream)
  token_jws: rawJws,           // signed envelope to keep for replay/audit
  self_did: 'did:web:samantha.agent',
  label: 'Ghost on Project Alpha',
});

const conns = await reg.listConnections({ peer_did: 'did:web:ghost.agent' });
const spent7d = await reg.getSpendWindow(conn.connection_id, 60 * 60 * 24 * 7);

await reg.revokeConnection(conn.connection_id, 'user_requested');
```

## Schema

```
connections       — primary record, policies, status, created_at, expires_at
connection_spend  — (connection_id, window_start) → cents per second-bucket
revocations       — (type, id) with reason + revoked_at
```

Schema matches `docs/ARP-phase-2-runtime-core.md §4 Task 3.1` verbatim. All
writes go through prepared statements; revoke + update status are wrapped in
a single transaction.

## Design notes

- `better-sqlite3` is synchronous. We expose an async interface for uniformity
  with the rest of the ARP surface; under the hood, every call is blocking.
- The registry does **not** validate token signatures. Upstream (runtime +
  PDP) owns verification; we store the already-validated `ConnectionToken`
  and its JWS so the full envelope is available for audit.
- One registry file per running agent. Multi-tenant runs (ARP Cloud, Phase 7)
  will open one registry per tenant — not shared.
