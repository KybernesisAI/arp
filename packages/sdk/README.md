# @kybernesis/arp-sdk

The developer-facing TypeScript SDK for building [ARP](https://github.com/KybernesisAI/arp) agents.

Wraps `@kybernesis/arp-runtime`, `@kybernesis/arp-pdp`, `@kybernesis/arp-transport`, `@kybernesis/arp-registry`, and `@kybernesis/arp-audit` into a single `ArpAgent` surface, so agent authors (and framework adapter authors) never need to learn ARP's internal primitives (DIDComm, Cedar, SQLite, etc.).

## Install

```bash
pnpm add @kybernesis/arp-sdk
```

## Minimal agent

```ts
import { ArpAgent } from '@kybernesis/arp-sdk';

const agent = await ArpAgent.fromHandoff('./arp-handoff.json', {
  dataDir: './.arp-data',
  onIncoming: async (task, ctx) => {
    if (task.action === 'ping') return { body: { pong: true } };
    return { body: { received_action: task.action } };
  },
});

await agent.start({ port: 4500 });
```

## The five integration points

Every agent eventually hits the same five seams. The SDK surfaces them as methods on `ArpAgent`:

| Hook | Purpose |
|------|---------|
| `agent.check({ action, resource, context, connectionId })` | Permission check (outbound tool calls, custom resource lookups). |
| `agent.egress({ data, connectionId, obligations })` | Apply obligations (redact, rate-limit, watermark, …) to an outbound payload. |
| `agent.onIncoming(handler)` | Register a handler for inbound peer tasks. Already runs _after_ the PDP. |
| `agent.audit({ connectionId, decision, reason, metadata })` | Append a JSONL audit entry. |
| `agent.on('revocation' \| 'rotation' \| 'pairing', handler)` | Subscribe to lifecycle events. |

## Connection management (admin-side)

```ts
await agent.connections.list();
await agent.connections.revoke(connectionId, 'owner-requested');
await agent.connections.suspend(connectionId);
```

## Obligations applied automatically

When your `onIncoming` handler returns a reply, the SDK runs it through the PDP's obligation pipeline before handing it back to the runtime. Currently supported transforms:

- `redact_fields`
- `redact_fields_except`
- `redact_regex`
- `summarize_only`
- `aggregate_only`
- `insert_watermark`
- `no_downstream_share`

Non-payload obligations (`rate_limit`, `require_fresh_consent`, `charge_usd`, …) are passed through to callers — they're enforced elsewhere in the stack.

## Security posture

- The SDK **refuses to boot** if the Ed25519 private key it loaded does not hash to the `public_key_multibase` committed in the handoff — identical invariant to the sidecar.
- Private key material is written 0600 on disk. Callers that own their own keystore (HSM / TPM / cloud KMS) should pass `privateKey` directly.
- Handoff bundles containing any `private*` or `secret*` field are rejected — private material must not travel in handoffs.

## Deeper docs

- `docs/ARP-installation-and-hosting.md §3.3` — Library install mode
- `docs/ARP-installation-and-hosting.md §8` — The five integration points
- `docs/ARP-adapter-authoring-guide.md` — Building a framework adapter on top of the SDK
