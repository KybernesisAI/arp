# ARP Phase 1 — Shared Contract

**Reader:** this document is written for an autonomous coding agent (Claude Code). Every requirement is a directive. Implement as specified; do not ask for clarification mid-run. If two instructions conflict, the lower-numbered section wins.

**Companion docs:** `ARP-phase-0-roadmap.md`, `ARP-our-codebase.md`, `ARP-scope-catalog-v1.md`, `ARP-policy-examples.md`.

---

## 0. Reader orientation

**Phase goal:** publish the three shared-contract npm packages that every other phase depends on.

**Tech pins (see Phase 0 roadmap for global):**
- TypeScript 5.5+, strict mode, no `any`
- Node.js 24 LTS
- pnpm workspaces + Turborepo
- Schema lib: `zod` (for runtime) + JSON Schema (for interop)
- Canonicalization: `canonicalize` (RFC 8785 JCS)
- Build tool: `tsup` (fast, dual ESM+CJS)
- Testing: `vitest`
- Linting: `eslint` flat config + `@typescript-eslint`

**Out of scope for this phase:** runtime, transport, UI, hosting, adapters, TLS. Those are Phase 2+. This phase is pure data + schemas + templates + scope catalog.

**Error handling contract:** exported functions return `Result<T, E>` shape (`{ ok: true, value } | { ok: false, error }`), or throw only for programmer errors. Never throw across a package boundary.

---

## 1. Definition of done

The phase is complete when all of the following are true:

- [ ] Monorepo `arp/` exists with the package layout in §3
- [ ] `@arp/spec` package publishable (compiled, typed, tested)
- [ ] `@arp/templates` package publishable
- [ ] `@arp/scope-catalog` package publishable (includes YAML sources + compiled JSON)
- [ ] All JSON schemas from `ARP-tld-integration-spec-v2.md §6` and `ARP-policy-examples.md §8` are implemented as both Zod schemas and JSON Schema
- [ ] All 50 scopes from `ARP-scope-catalog-v1.md §4` exist as YAML files
- [ ] Cedar schema compiles and validates a sample policy
- [ ] Scope-template → Cedar compiler is pure, deterministic, tested
- [ ] `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint` all green
- [ ] README per package explains install + usage with runnable examples
- [ ] Changesets configured; first release as `0.1.0` on a pre-release npm tag (`next`)

---

## 2. Prerequisites

- Git repo initialized at `arp/` (public or private — not this phase's concern)
- Node 24 LTS and pnpm 9+ installed on the build machine
- No other ARP phases required

---

## 3. Repository layout

Create exactly this layout. Do not invent additional directories.

```
arp/
├── .changeset/
│   └── config.json
├── .github/
│   └── workflows/
│       └── ci.yml
├── packages/
│   ├── spec/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── schemas/
│   │   │   │   ├── did-document.ts
│   │   │   │   ├── agent-card.ts
│   │   │   │   ├── arp-json.ts
│   │   │   │   ├── representation-vc.ts
│   │   │   │   ├── revocations.ts
│   │   │   │   ├── connection-token.ts
│   │   │   │   ├── handoff-bundle.ts
│   │   │   │   ├── scope-catalog.ts
│   │   │   │   └── cedar-schema.ts
│   │   │   ├── constants.ts
│   │   │   └── types.ts
│   │   ├── json-schema/            # generated JSON Schema files for interop
│   │   │   └── *.json              # emitted by a build step from Zod sources
│   │   ├── tests/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   └── README.md
│   ├── templates/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── did-document.ts
│   │   │   ├── agent-card.ts
│   │   │   ├── arp-json.ts
│   │   │   ├── representation-vc.ts
│   │   │   ├── revocations.ts
│   │   │   ├── handoff-bundle.ts
│   │   │   └── util.ts
│   │   ├── tests/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   └── README.md
│   └── scope-catalog/
│       ├── scopes/                 # YAML sources, one per scope
│       │   └── *.yaml              # 50 files, named by scope ID
│       ├── src/
│       │   ├── index.ts
│       │   ├── loader.ts           # reads YAML, validates, emits JSON
│       │   ├── compiler.ts         # scope template → Cedar policy string
│       │   └── catalog-manifest.ts # generates the public manifest JSON
│       ├── generated/              # compiled JSON (do not hand-edit)
│       │   ├── manifest.json
│       │   └── scopes.json
│       ├── tests/
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsup.config.ts
│       └── README.md
├── tsconfig.base.json
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .gitignore
├── .eslintrc.cjs
├── LICENSE                         # MIT
└── README.md
```

---

## 4. Implementation tasks

Execute in order. Each task is atomic; commit after each.

### Task 1 — Bootstrap monorepo
1. `pnpm init`; set `"name": "arp"`, `"private": true`
2. Create `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - 'packages/*'
   ```
3. Install dev deps at root: `typescript@5.5`, `turbo`, `@changesets/cli`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `prettier`, `vitest`, `tsup`
4. Create `tsconfig.base.json` with strict mode, ESM, target `ES2022`
5. Create `turbo.json` with `build`, `test`, `lint`, `typecheck` pipelines
6. Create `.eslintrc.cjs` flat config with strict rules (no `any`, no unused, prefer const)
7. Initialize Changesets: `pnpm changeset init`
8. Add MIT LICENSE
9. Add root README linking to phase docs

**Acceptance:** `pnpm install` succeeds; `pnpm turbo --help` works.

### Task 2 — CI pipeline
1. Create `.github/workflows/ci.yml` with jobs:
   - Node 24 setup
   - `pnpm install`
   - `pnpm -r typecheck`
   - `pnpm -r build`
   - `pnpm -r test`
   - `pnpm -r lint`
2. Use `actions/setup-node@v4` with pnpm caching

**Acceptance:** workflow file validates via `actionlint` (run locally if available, otherwise just YAML-lint).

### Task 3 — `@arp/spec` package scaffold
1. Create `packages/spec/package.json`:
   ```json
   {
     "name": "@arp/spec",
     "version": "0.1.0",
     "description": "ARP shared contract: JSON Schemas, Zod schemas, constants",
     "main": "./dist/index.cjs",
     "module": "./dist/index.mjs",
     "types": "./dist/index.d.ts",
     "exports": {
       ".": { "import": "./dist/index.mjs", "require": "./dist/index.cjs", "types": "./dist/index.d.ts" },
       "./json-schema/*": "./json-schema/*.json"
     },
     "files": ["dist", "json-schema", "README.md"],
     "scripts": {
       "build": "tsup && node ./scripts/emit-json-schema.mjs",
       "test": "vitest run",
       "typecheck": "tsc --noEmit",
       "lint": "eslint src tests"
     },
     "dependencies": { "zod": "^3.23.0" },
     "devDependencies": { "zod-to-json-schema": "^3.23.0" }
   }
   ```
2. Create `tsup.config.ts` for dual ESM+CJS output
3. Create `tsconfig.json` extending base

**Acceptance:** `pnpm --filter @arp/spec build` produces `dist/*` files.

### Task 4 — Implement Zod schemas in `@arp/spec`
Translate every JSON shape in these sources into a Zod schema, one per file under `src/schemas/`:

| File | Source |
|---|---|
| `did-document.ts` | `ARP-tld-integration-spec-v2.md §6.1` |
| `agent-card.ts` | `ARP-tld-integration-spec-v2.md §6.2` |
| `arp-json.ts` | `ARP-tld-integration-spec-v2.md §6.3` |
| `representation-vc.ts` | `ARP-tld-integration-spec-v2.md §6.4` |
| `revocations.ts` | `ARP-tld-integration-spec-v2.md §6.5` |
| `connection-token.ts` | `ARP-policy-examples.md §3.Layer3` |
| `handoff-bundle.ts` | `ARP-tld-integration-spec-v2.md §7.step14` + `ARP-installation-and-hosting.md §2` |
| `scope-catalog.ts` | `ARP-scope-catalog-v1.md §1` |
| `cedar-schema.ts` | `ARP-policy-examples.md §8` |

For each:
1. Export a Zod schema (`export const DidDocumentSchema = z.object({ ... })`)
2. Export the inferred TS type (`export type DidDocument = z.infer<typeof DidDocumentSchema>`)
3. Include all required + optional fields with precise types
4. Add field-level JSDoc comments from the source docs

Also populate `src/constants.ts` with:
- Reserved DNS names (from `ARP-tld-integration-spec-v2.md §4`)
- Protocol version constants (`ARP_VERSION = '0.1'`)
- TTL defaults
- Standard well-known paths

**Acceptance:** each schema has at least 3 unit tests (valid ✓, invalid ✓, edge case ✓). Aim for ≥30 tests total across the package.

### Task 5 — JSON Schema emission
1. Create `scripts/emit-json-schema.mjs` that imports each Zod schema and runs `zodToJsonSchema` to produce a file in `json-schema/`
2. Files named `did-document.json`, `agent-card.json`, etc.
3. Include `$id` fields with stable URLs: `https://arp.spec/schema/<name>/v0.1.json`

**Acceptance:** after `pnpm build`, `json-schema/` contains 9 `.json` files. Each validates as a draft-2020-12 JSON Schema.

### Task 6 — `@arp/templates` package scaffold
1. Create `packages/templates/package.json` same shape as `spec`
2. Add dep: `@arp/spec: workspace:*`

### Task 7 — Template functions in `@arp/templates`
Each template is a pure function that takes typed inputs and produces a valid document that passes the corresponding Zod schema.

Implement:

```ts
// src/did-document.ts
export function buildDidDocument(input: {
  agentDid: string;          // e.g. "did:web:samantha.agent"
  controllerDid: string;     // principal DID
  publicKeyMultibase: string;
  endpoints: { didcomm: string; agentCard: string };
  representationVcUrl: string;
}): DidDocument { ... }
```

Do this for: `did-document`, `agent-card`, `arp-json`, `representation-vc`, `revocations`, `handoff-bundle`.

Each function:
1. Constructs the object
2. Validates it via the Zod schema from `@arp/spec`
3. Returns it or throws a typed error if invalid

**Acceptance:** property-based tests (at least 10 per template) that generate random valid inputs and verify outputs always pass the schema.

### Task 8 — `@arp/scope-catalog` package scaffold
1. Create `packages/scope-catalog/package.json`
2. Add deps: `@arp/spec: workspace:*`, `yaml`, `handlebars`

### Task 9 — Author all 50 scope YAML files
Using `ARP-scope-catalog-v1.md §4` (table) and §5 (detailed specs):

1. For each of the 50 scopes, create `scopes/<scope-id>.yaml`
2. Match the schema in `ARP-scope-catalog-v1.md §1`
3. For the 10 fully-detailed scopes in §5, copy the exact template from the doc
4. For the remaining 40, synthesize reasonable Cedar templates and consent text based on the table entry

Rules when synthesizing:
- Risk tier dictates default obligations (see `ARP-scope-catalog-v1.md §2`)
- Always include `implies` and `conflicts_with` (empty arrays if none)
- Parameter defaults match values from the table where given

**Acceptance:** all 50 YAML files validate against the `ScopeTemplateSchema` from `@arp/spec`.

### Task 10 — Scope loader + catalog manifest
1. `src/loader.ts` — reads all YAML files from `scopes/`, validates each, returns typed array
2. `src/catalog-manifest.ts` — produces the public manifest JSON (with metadata: catalog version, scope count, checksum)
3. `generated/manifest.json` + `generated/scopes.json` are build artifacts

**Acceptance:** `pnpm --filter @arp/scope-catalog build` produces both generated files. Manifest checksum is deterministic (same input → same hash).

### Task 11 — Scope → Cedar compiler
1. `src/compiler.ts` exports `compileScope(scope: ScopeTemplate, params: Record<string, unknown>, audienceDid: string): string`
2. Uses Handlebars to interpolate the `cedar_template` field
3. Validates parameters against the scope's parameter definitions before compilation
4. Output is a valid Cedar policy string

**Acceptance:** golden-file tests for all 10 fully-specified scopes. Input (scope + params) → known expected Cedar output.

### Task 12 — Bundle compiler
1. Export `compileBundle(scopeIds: string[], paramsMap: Record<string, unknown>, audienceDid: string): { policies: string[], obligations: Obligation[] }`
2. Expand `implies`, detect `conflicts_with` (throw if conflict)
3. Concatenate per-scope compilation results

**Acceptance:** golden-file tests for all 5 bundles in `ARP-scope-catalog-v1.md §6`.

### Task 13 — Cedar schema test
1. Pull the Cedar schema JSON from `ARP-policy-examples.md §8`
2. Place it at `packages/spec/src/cedar-schema.json` (copied; referenced by schema wrapper)
3. Include a test that uses `@cedar-policy/cedar-wasm` to parse the schema and a sample policy (from `ARP-policy-examples.md §3.Layer2`) and confirm the policy is syntactically valid

Note: this adds `@cedar-policy/cedar-wasm` as a devDependency in `@arp/spec` for testing only. Production consumers don't need it for schema access.

**Acceptance:** a test `cedar-schema.test.ts` that parses the schema + policy without error.

### Task 14 — Package READMEs
Each of the three packages gets a README with:
- One-paragraph purpose
- Install command
- Minimal usage example
- Link to phase 0 roadmap

### Task 15 — Changesets config + first release
1. Configure `.changeset/config.json` with `access: "public"`, `baseBranch: "main"`
2. Add an initial changeset: all three packages at `0.1.0`
3. Create a release workflow (`.github/workflows/release.yml`) that runs on merge to `main` and publishes via Changesets (do not actually publish in this phase; just the pipeline is set up)

**Acceptance:** `pnpm changeset status` shows the three packages pending.

---

## 5. Acceptance tests (phase-level)

Run from repo root:

```bash
pnpm install
pnpm -r typecheck
pnpm -r build
pnpm -r test
pnpm -r lint
```

All must exit 0.

Additional phase-level tests (add to a `tests/phase-1/` directory at repo root):

1. **End-to-end template → schema validation:** build a full DID doc via `@arp/templates`, validate it against the JSON Schema from `@arp/spec`, assert pass.
2. **End-to-end scope → Cedar:** load a bundle YAML via `@arp/scope-catalog`, compile it, parse the output with `@cedar-policy/cedar-wasm`, assert no errors.
3. **Handoff bundle round-trip:** build a sample handoff bundle via `@arp/templates`, serialize to JSON, parse, validate, assert equal to original.

---

## 6. Deliverables

At end of phase:

- `arp/` monorepo on GitHub (public or private — not this phase's concern, just initialized)
- Three npm packages buildable, testable, linted
- 50 scope YAML files
- Generated JSON artifacts (JSON Schemas + scope manifest + compiled scopes)
- Full CI green
- `README.md` at repo root summarizing the packages and linking phase docs

---

## 7. Handoff to Phase 2

Phase 2 (Runtime Core) consumes:

- `@arp/spec` — all schemas as Zod and JSON Schema
- `@arp/templates` — functions to generate documents at runtime
- `@arp/scope-catalog` — scope templates + compiler used by PDP and pairing flow
- Cedar schema + sample policies for PDP integration tests

Phase 1 must **not** export any HTTP, filesystem, or network dependencies. Phase 2 layers those on top.

---

## 8. v0 decisions (do not reopen)

- TS only (no multi-language in this phase; Python mirrors come later via phase 6)
- Zod as the runtime schema library
- JSON Schema draft 2020-12 as the interop format
- Handlebars as the scope template engine
- `tsup` for dual ESM+CJS builds
- Changesets for release management
- MIT license
- Pre-release npm tag `next` for v0 packages; no `latest` tag until Phase 9

---

## 9. Common pitfalls (for the implementing agent)

- **Don't hand-write JSON Schemas.** Generate them from Zod via `zod-to-json-schema`. Prevents drift.
- **Don't inline scope definitions in TS.** YAML under `scopes/` is the source of truth; TS loads it.
- **Handlebars is partial-allergic.** If a scope template needs conditionals (`{{#if}}`), test it. Escape curly braces inside Cedar carefully.
- **Cedar schema is JSON, not Cedar syntax.** Don't confuse the two.
- **Do not publish to npm in this phase.** The release workflow exists but is dormant until Phase 9.
