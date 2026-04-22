# @kybernesis/arp-spec

The shared contract for ARP (Agent Relationship Protocol). Zod schemas, JSON Schema (draft 2020-12) equivalents, and protocol constants that every ARP implementer — runtime, registrar integration, SDKs, owner app — agrees on.

This package is intentionally pure data: no HTTP, filesystem, or network. If you need builder functions, see [`@kybernesis/arp-templates`](../templates); if you need the scope catalog, see [`@kybernesis/arp-scope-catalog`](../scope-catalog).

## Install

```bash
pnpm add @kybernesis/arp-spec
# or
npm install @kybernesis/arp-spec
```

## Usage

### Validate an incoming document (Zod)

```ts
import { DidDocumentSchema } from '@kybernesis/arp-spec';

const result = DidDocumentSchema.safeParse(await fetch('/.well-known/did.json').then((r) => r.json()));
if (!result.success) {
  throw new Error(`invalid DID document: ${result.error.message}`);
}
const didDoc = result.data; // fully typed
```

### Validate with a JSON Schema consumer (Ajv, etc.)

```ts
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import agentCardSchema from '@kybernesis/arp-spec/json-schema/agent-card.json' with { type: 'json' };

const ajv = new Ajv2020();
addFormats(ajv);
const validate = ajv.compile(agentCardSchema);
if (!validate(candidate)) throw new Error(ajv.errorsText(validate.errors));
```

### Use protocol constants

```ts
import { ARP_VERSION, WELL_KNOWN_PATHS, PROTOCOL_RESERVED_NAMES } from '@kybernesis/arp-spec';

console.log(ARP_VERSION);                // "0.1"
console.log(WELL_KNOWN_PATHS.DID);       // "/.well-known/did.json"
console.log(PROTOCOL_RESERVED_NAMES);    // ["_arp", "_did", ...]
```

## Schemas shipped

Every schema has a Zod version (type-inferable in TS) and a JSON Schema version (for interop with non-TS consumers). Both are kept in sync by a build step that emits the JSON Schema files from the Zod sources.

| Name | Source |
|---|---|
| `did-document` | `ARP-tld-integration-spec-v2.md §6.1` |
| `agent-card` | `ARP-tld-integration-spec-v2.md §6.2` |
| `arp-json` | `ARP-tld-integration-spec-v2.md §6.3` |
| `representation-vc` | `ARP-tld-integration-spec-v2.md §6.4` |
| `revocations` | `ARP-tld-integration-spec-v2.md §6.5` |
| `connection-token` | `ARP-policy-examples.md §3 Layer 3` |
| `handoff-bundle` | `ARP-tld-integration-spec-v2.md §7 step 14` |
| `scope-catalog` | `ARP-scope-catalog-v1.md §1` |
| `cedar-schema` | `ARP-policy-examples.md §8` |

JSON Schema `$id` URLs follow `https://arp.spec/schema/<name>/v0.1.json`.

## Error contract

Schemas are value objects; they don't throw across package boundaries. Parsing an invalid document gives you a structured `SafeParseReturnType` from Zod. Helpers that do throw (like those in `@kybernesis/arp-templates`) wrap the issues in typed error classes you can catch.

## Phase

Shipped as part of Phase 1 of the ARP build roadmap. See [`docs/ARP-phase-0-roadmap.md`](../../docs/ARP-phase-0-roadmap.md) for the overall plan.

## License

MIT.
