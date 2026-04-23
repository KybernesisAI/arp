# @kybernesis/arp-create-adapter

Scaffolds a conformance-passing ARP framework adapter in TypeScript or Python.

## Install + run

```bash
npx @kybernesis/arp-create-adapter \
  --framework my-framework \
  --language ts \
  --out ./adapters/my-framework
```

Generates:
- `package.json` (or `pyproject.toml`) with correct ARP dependencies
- `src/` / `arp_adapter_<slug>/` skeleton wiring the 5 ARP integration points
- A placeholder `MyFrameworkLike` structural type covering the public extension surface you need to depend on (replace with the real framework's shape)
- `tests/conformance.test.ts` (or `tests/test_conformance.py`) wired for the `@kybernesis/arp-testkit` audit
- `README.md` + `MIGRATION.md` ready to publish

## Why a structural-type scaffold?

Per Phase-6 Rule 2, adapters **must not fork framework source** — they wrap a documented public extension API. The scaffold picks that up explicitly: you describe your framework as a protocol, wire your framework's real hooks to that protocol, and the adapter's logic is portable across framework versions.

## Programmatic API

```ts
import { scaffoldAdapter } from '@kybernesis/arp-create-adapter';

await scaffoldAdapter({
  framework: 'my-framework',
  displayName: 'My Framework',
  language: 'ts',
  out: './adapters/my-framework',
});
```

## After scaffolding

1. Replace the `{FrameworkName}Like` placeholder type with your framework's real public interface.
2. Wire the ARP hooks (`agent.check`, `agent.egress`, etc.) to the framework's actual hook names.
3. Run the shipped conformance test; add a real integration test that pairs the generated adapter with the ARP reference agents in `examples/`.
4. See [`docs/ARP-adapter-authoring-guide.md`](../../docs/ARP-adapter-authoring-guide.md) for the full contract + anti-patterns.

Phase-6 in the ARP monorepo validates all five required adapters with this same scaffold structure.
