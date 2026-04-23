# samantha-reference

Reference agent for `samantha.agent`. Uses `@kybernesis/arp-runtime`
directly to demonstrate the bare-bones pattern — no custom framework, no
SDK sugar. Paired counterparty is `ghost-reference` (`apps/ghost-reference`).

**Phase 5 scope — NOT deployed this run.** The configuration here is
committed in-repo so Phase 5B can drop in a real handoff.json + domain and
run `fly deploy` without code changes. All Phase-5 validation exercises
this package locally (see `tests/phase-5/*.test.ts`).

---

## 1. What it is

- A **binary** (`apps/samantha-reference/src/main.ts`) that bootstraps the
  sidecar's key material + TLS cert, then starts `@kybernesis/arp-runtime`
  wired with the Samantha dispatch handler.
- A **dispatch handler** (`src/dispatch.ts`) with three demo tools:
  `summarize`, `check_availability`, `read_project_file`, plus
  `remember` / `recall` that round-trip into the runtime's per-connection
  memory for the isolation story.
- A **fixture knowledge base** (`src/fixtures/knowledge-base.ts` +
  `fixtures/kb.json`) scoped by `connection_id`. Tiny, throwaway, fake
  content.

## 2. Running it locally (Phase 5 scope)

Phase 5 uses the reference agents via `tests/phase-5/*.test.ts` — they
import the dispatch handler + knowledge base directly and spin up the
runtime in-process, no Docker / VPS required.

To dry-run the binary against a local handoff fixture:

```bash
# 1. Generate a throwaway keypair + handoff.json into /tmp/samantha-demo.
node apps/samantha-reference/fixtures/gen-test-handoff.mjs --out /tmp/samantha-demo

# 2. Start the reference agent against the fixture (binds 127.0.0.1:4501).
pnpm --filter @kybernesis/arp-samantha-reference run build
node apps/samantha-reference/dist/main.js \
  --handoff /tmp/samantha-demo/handoff.json \
  --data-dir /tmp/samantha-demo/data \
  --port 4501 \
  --host 127.0.0.1 \
  --admin-token demo-admin-token \
  --kb apps/samantha-reference/fixtures/kb.json

# 3. Hit the well-known docs.
curl -s http://127.0.0.1:4501/.well-known/did.json | jq .

# 4. Run the testkit audit against it.
pnpm --filter @kybernesis/arp-testkit exec arp-testkit audit localhost:4501 \
  --base http://127.0.0.1:4501
```

## 3. Docker (Phase 5B)

`Dockerfile.compose` layers on the published sidecar image. Not built in
CI this run; Phase 5B wires the buildx step + registry push.

## 4. Fly.io (Phase 5B)

`fly.toml` targets `fly.io` with a 1GB persistent volume at `/data`. Not
deployed this run; Phase 5B provisions the `samantha.agent` DNS apex at
Headless and runs `fly launch --copy-config --name samantha-agent`.

## 5. Key rotation

The committed `handoff.json` is a placeholder. `fixtures/gen-test-handoff.mjs`
mints a fresh keypair on demand. Before any public demo, the production
handoff + the matching private key are re-generated out of band; neither
is ever checked in for a real deployment.

## 6. Relationship to the testkit

`@kybernesis/arp-testkit audit samantha.agent` (when we ship Phase 5B)
must return 8/8 pass. `tests/phase-5/bundle-coverage.test.ts` exercises the
full dispatch handler against Ghost under every ARP bundle.
