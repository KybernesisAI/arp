# `@kybernesis/arp-resolver`

HNS DoH + did:web resolution with an in-memory LRU cache, for agent-to-agent
lookups within the ARP runtime.

## Install

```bash
pnpm add @kybernesis/arp-resolver
```

## Use

```ts
import { createResolver } from '@kybernesis/arp-resolver';

const resolver = createResolver(); // defaults: hnsdoh.com, 300s TTL, 1000-entry LRU

const dns = await resolver.resolveHns('samantha.agent');
// → { a: ['1.2.3.4'], aaaa: [], txt: { _arp: ['v=1; ...'], _did: ['...'] } }

const didDoc = await resolver.resolveDidWeb('did:web:samantha.agent');
// → { ok: true, value: DidDocument }  (validated against @kybernesis/arp-spec)
```

## Options

| Option         | Default                         |
| -------------- | ------------------------------- |
| `dohEndpoint`  | `https://hnsdoh.com/dns-query`  |
| `useLocalHnsd` | `process.env.ARP_HNSD_LOCAL === 'true'` |
| `cacheTtlMs`   | `300_000`                       |
| `cacheMax`     | `1000`                          |
| `timeoutMs`    | `5000`                          |

Set `ARP_HNSD_LOCAL=true` to force resolution through a local `hnsd` daemon
(`127.0.0.1:53`) instead of DoH.

## Design notes

- DoH uses the JSON form (`application/dns-json`) rather than RFC 8484 wire
  format so we avoid a DNS-encoder dependency. `hnsdoh.com`, Cloudflare, and
  Google all serve this format. The `DohClient` interface is pluggable if we
  need to swap in wire format later.
- TLS pinning is **not** part of this package. `@kybernesis/arp-tls` owns that;
  DID docs returned here are fed into the TLS pin check before any DIDComm
  traffic flows.
- The resolver has no transport dependency — runtime, transport, and PDP all
  import this package but nothing here imports them.

See `docs/ARP-phase-2-runtime-core.md` §4 Task 1 and `docs/ARP-hns-resolution.md`
for the broader strategy.
