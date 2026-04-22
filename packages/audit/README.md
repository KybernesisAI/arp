# `@kybernesis/arp-audit`

Append-only hash-chained audit log. One JSON-Lines file per connection.

## Format

```json
{
  "seq": 42,
  "timestamp": "2026-04-22T...",
  "msg_id": "...",
  "decision": "allow",
  "policies_fired": ["p_alpha_read"],
  "obligations": [...],
  "spend_delta_cents": 2,
  "reason": null,
  "prev_hash": "sha256:...",
  "self_hash": "sha256:..."
}
```

- `self_hash = sha256(JCS_canonicalize(entry minus self_hash))`
- Genesis `prev_hash` = `sha256:` + 32 zero bytes

## Use

```ts
import { openAuditLog, verifyAuditChain } from '@kybernesis/arp-audit';

const log = openAuditLog({
  connectionId: 'conn_7a3f',
  dir: '/var/lib/arp/audit',
});

log.append({
  msg_id: 'msg_1',
  decision: 'allow',
  policies_fired: ['p_alpha_read'],
  spend_delta_cents: 2,
});

const result = verifyAuditChain(log.path);
// { valid: true, entriesSeen: 42 }  or  { valid: false, firstBreakAt: 17 }
```

## Design notes

- Writes use `appendFileSync` so the chain is correct under single-writer
  assumptions. Phase 7 (Cloud) will replace the FS backend with an
  append-only Postgres store while keeping the same hash format.
- Canonicalization uses RFC 8785 (`canonicalize` package). Don't roll your
  own — key ordering and number formatting are strict.
- `reason` is serialised as `null` when absent so JCS produces a stable
  canonical form.
