# examples/kyberbot-atlas

Minimal KyberBot + ARP integration.

Replace `FakeBot` with a real `import { KyberBot } from 'kyberbot'` and point `handoff` at your registrar-issued `arp-handoff.json`. See `../../adapters/kyberbot/MIGRATION.md`.

The full conformance test for this adapter is run from `tests/phase-6/adapter-conformance.test.ts` — it boots the adapter, pairs with a local peer, runs the 8-probe testkit audit, and exercises tool-allow / tool-deny / obligation redaction end-to-end.
