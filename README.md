# ARP — Agent Relationship Protocol

The shared contract, runtime, and tooling for an agent-to-agent permission + communications layer over the Handshake `.agent` TLD.

This is the **`github.com/KybernesisAI/arp`** monorepo. It hosts the three shared-contract npm packages that every other component (runtime, SDKs, owner app, registrar integration) depends on, plus the runtime itself as later phases land.

## Packages

| Package | Purpose |
|---|---|
| [`@kybernesis/arp-spec`](./packages/spec) | Zod + JSON Schema definitions for every ARP document shape (DID doc, agent card, `arp.json`, representation VC, revocations, connection token, handoff bundle, scope catalog, Cedar schema). |
| [`@kybernesis/arp-templates`](./packages/templates) | Pure functions that build valid ARP documents from typed inputs. |
| [`@kybernesis/arp-scope-catalog`](./packages/scope-catalog) | The 50-scope v1 catalog (YAML source of truth) + the Handlebars→Cedar compiler. |

## Development

```bash
pnpm install
pnpm -r typecheck
pnpm -r build
pnpm -r test
pnpm -r lint
```

Node 24 LTS and pnpm 9+ required.

## Phase docs

Build is broken into phases — each doc is a self-contained brief. Read them in order.

- [`docs/ARP-phase-0-roadmap.md`](./docs/ARP-phase-0-roadmap.md) — map of all phases, global tech pins, dependency graph
- [`docs/ARP-phase-1-shared-contract.md`](./docs/ARP-phase-1-shared-contract.md) — **this phase**: publish the shared contract packages
- [`docs/ARP-phase-2-runtime-core.md`](./docs/ARP-phase-2-runtime-core.md) — runtime (PDP, transport, registry, audit)
- [`docs/ARP-phase-3-sidecar.md`](./docs/ARP-phase-3-sidecar.md) and onward

Design refs: `ARP-architecture.md`, `ARP-our-codebase.md`, `ARP-scope-catalog-v1.md`, `ARP-policy-examples.md`, `ARP-tld-integration-spec-v2.md`.

## License

MIT. See [`LICENSE`](./LICENSE).
