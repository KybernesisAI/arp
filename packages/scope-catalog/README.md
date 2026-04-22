# @kybernesis/arp-scope-catalog

The ARP scope catalog v1 — 50 scope templates authored as YAML — plus the Handlebars→Cedar compiler that turns a selection of scopes into a compiled policy set.

Humans never write Cedar. They pick scopes from this catalog, and a compiler produces the policy. This package is both the source of truth (the `scopes/*.yaml` files) and the tooling (the loader + compiler) for doing that.

## Install

```bash
pnpm add @kybernesis/arp-scope-catalog
```

## Usage

### Load the catalog + compile a single scope

```ts
import { loadScopesFromDirectory, compileScope } from '@kybernesis/arp-scope-catalog';

const catalog = loadScopesFromDirectory('./node_modules/@kybernesis/arp-scope-catalog/scopes');

const permitCalendar = compileScope({
  scope: catalog.find((s) => s.id === 'calendar.availability.read')!,
  audienceDid: 'did:web:ghost.agent',
  params: { days_ahead: 14 },
});

console.log(permitCalendar);
// permit (
//   principal == Agent::"did:web:ghost.agent",
//   action == Action::"check_availability",
//   resource == Calendar::"primary"
// ) when { context.query_window_days <= 14 };
// forbid ( ... ) when { action != Action::"check_availability" };
```

### Compile a bundle of scopes

```ts
import { compileBundle, BUNDLES, findBundle } from '@kybernesis/arp-scope-catalog';

const bundle = findBundle('bundle.scheduling_assistant.v1')!;

const compiled = compileBundle({
  scopeIds: bundle.scopes.map((s) => s.id),
  paramsMap: {
    'calendar.availability.read': { days_ahead: 14 },
    'calendar.events.propose': { max_attendees: 10, max_duration_min: 60 },
    'contacts.search': { attribute_allowlist: ['name', 'email'] },
  },
  audienceDid: 'did:web:ghost.agent',
  catalog,
});

console.log(compiled.policies);          // string[] — one compiled policy per scope
console.log(compiled.obligations);       // Obligation[] — aggregated post-allow requirements
console.log(compiled.expandedScopeIds);  // string[] — including implied scopes
```

The bundle compiler:
- Transitively expands `implies` relations so the consent UI doesn't have to ask for prerequisites twice.
- Detects `conflicts_with` pairs and throws before compilation.
- Inherits parameters along implication edges (e.g., a `project_id` on `files.project.files.read` propagates to its implied `files.project.files.list`).
- Concatenates `obligations_forced` across the expanded set.

## The 50 scopes

Authored as one YAML file per scope under `scopes/`. The `generated/manifest.json` file is the public manifest served at `/.well-known/scope-catalog.json` — see `ARP-scope-catalog-v1.md` for the full list.

Scope categories: identity, calendar, messaging, files, contacts, tasks, notes, payments, work, credentials, tools, delegation.

Risk tiers: low, medium, high, critical (see §2 of the catalog doc for default obligations by tier).

## Phase

Shipped as part of Phase 1. See [`docs/ARP-phase-0-roadmap.md`](../../docs/ARP-phase-0-roadmap.md).

## License

MIT.
