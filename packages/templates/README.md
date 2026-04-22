# @kybernesis/arp-templates

Pure builder functions that produce validated ARP documents from typed inputs.

Every export in this package takes a small typed input, constructs the canonical ARP shape, validates the result against the matching Zod schema from [`@kybernesis/arp-spec`](../spec), and returns the validated object. On validation failure, the builder throws `TemplateValidationError` — you should never see an invalid document leak out of a builder.

These functions are stateless: no filesystem, no network, no clock reads beyond documented optional defaults. Safe to use in registrar integrations, the ARP runtime, SDKs, or the owner app.

## Install

```bash
pnpm add @kybernesis/arp-templates
# peer: @kybernesis/arp-spec is bundled as a regular dependency
```

## Usage

### Build a DID document

```ts
import { buildDidDocument } from '@kybernesis/arp-templates';

const didDoc = buildDidDocument({
  agentDid: 'did:web:samantha.agent',
  controllerDid: 'did:web:ian.self.xyz',
  publicKeyMultibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
  endpoints: {
    didcomm: 'https://samantha.agent/didcomm',
    agentCard: 'https://samantha.agent/.well-known/agent-card.json',
  },
  representationVcUrl: 'https://ian.samantha.agent/.well-known/representation.jwt',
});
```

### Build an agent card

```ts
import { buildAgentCard } from '@kybernesis/arp-templates';

const card = buildAgentCard({
  name: 'Samantha',
  did: 'did:web:samantha.agent',
  endpoints: {
    didcomm: 'https://samantha.agent/didcomm',
    pairing: 'https://samantha.agent/pair',
  },
  agentOrigin: 'https://samantha.agent',
});
```

### Build a handoff bundle (registrar integration)

```ts
import { buildHandoffBundle } from '@kybernesis/arp-templates';

const bundle = buildHandoffBundle({
  agentDid: 'did:web:samantha.agent',
  principalDid: 'did:web:ian.self.xyz',
  publicKeyMultibase: 'z6Mk...',
  agentOrigin: 'https://samantha.agent',
  dnsRecordsPublished: ['A', '_arp TXT', '_did TXT', '_didcomm TXT', '_principal TXT'],
  certExpiresAt: '2026-07-22T00:00:00Z',
  bootstrapToken: bootstrapJwt,
});
```

## Builders

| Export | Source |
|---|---|
| `buildDidDocument` | `ARP-tld-integration-spec-v2.md §6.1` |
| `buildAgentCard` | `ARP-tld-integration-spec-v2.md §6.2` |
| `buildArpJson` | `ARP-tld-integration-spec-v2.md §6.3` |
| `buildRepresentationVc` | `ARP-tld-integration-spec-v2.md §6.4` |
| `buildRevocations` | `ARP-tld-integration-spec-v2.md §6.5` |
| `buildHandoffBundle` | `ARP-tld-integration-spec-v2.md §7 step 14` |

## Phase

Shipped as part of Phase 1. See [`docs/ARP-phase-0-roadmap.md`](../../docs/ARP-phase-0-roadmap.md).

## License

MIT.
