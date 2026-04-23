# ghost-reference

Counterparty to `samantha-reference`. Used for Phase-5 interop demos:
Samantha issues invitations, Ghost countersigns and exchanges messages
under the 5 ARP bundles. Structure intentionally mirrors
`apps/samantha-reference` — only DID + principal + fixture content
differ.

**Phase 5 scope — NOT deployed this run.** Phase 5B follows.

## Quickstart (local)

```bash
node apps/ghost-reference/fixtures/gen-test-handoff.mjs --out /tmp/ghost-demo
pnpm --filter @kybernesis/arp-ghost-reference run build
node apps/ghost-reference/dist/main.js \
  --handoff /tmp/ghost-demo/handoff.json \
  --data-dir /tmp/ghost-demo/data \
  --port 4502 \
  --host 127.0.0.1 \
  --admin-token demo-admin-token \
  --kb apps/ghost-reference/fixtures/kb.json
```

See `apps/samantha-reference/README.md` for the paired walkthrough.
