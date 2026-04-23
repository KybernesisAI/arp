# @kybernesis/arp-testkit

Compliance testkit for ARP. Audits any `.agent` domain's ARP
implementation against an 8-probe suite covering DNS, well-known docs,
DID resolution, TLS pinning, DIDComm liveness, pairing, revocation, and
cross-connection isolation.

Shipped as a CLI + programmatic API. Phase 5 ships the package; Phase 9
publishes it to npm.

---

## Install

```bash
# Phase 9+ (once published):
npm i -g @kybernesis/arp-testkit
# or
npx @kybernesis/arp-testkit audit samantha.agent

# Phase 5 (from this repo):
pnpm --filter @kybernesis/arp-testkit exec arp-testkit audit samantha.agent
```

---

## Run an audit

```bash
arp-testkit audit samantha.agent
```

Output (human mode):

```
ARP Compliance Audit — samantha.agent
=====================================

  ✓ dns                        (312ms)
  ✓ well-known                 (421ms)
  ✓ did-resolution             (189ms)
  ✓ tls-fingerprint            (234ms)
  ✓ didcomm-probe              (812ms)
  • pairing-probe              (0ms) (skipped: pairing probe needs issuer/counterparty keys)
  ✓ revocation                 (120ms)
  • cross-connection           (0ms) (skipped: needs programmatic driver)

  5/6 passed · 2 skipped · 2.1s total
```

JSON mode:

```bash
arp-testkit audit samantha.agent --json > /tmp/audit.json
```

---

## Interpret the output

| Marker | Meaning |
|---|---|
| `✓` | Probe passed. |
| `✗` | Probe failed. Run with `--verbose` to see `details` / `error.message`. |
| `•` | Probe was skipped (e.g. local target, no config). |

Exit codes:

| Code | Meaning |
|---|---|
| 0 | audit ran; no failures |
| 1 | usage error |
| 2 | audit ran; one or more probes failed |
| 3 | crash (unhandled exception) |

---

## Individual probes

```bash
arp-testkit probe dns samantha.agent
arp-testkit probe well-known samantha.agent
arp-testkit probe did-resolution samantha.agent
arp-testkit probe tls-fingerprint samantha.agent
arp-testkit probe didcomm-probe samantha.agent
arp-testkit probe revocation samantha.agent
```

| Probe | Does |
|---|---|
| `dns` | Checks `_arp` / `_did` / `_didcomm` / `_revocation` TXT records on the apex. |
| `well-known` | Fetches + schema-validates `did.json`, `agent-card.json`, `arp.json`. |
| `did-resolution` | Confirms `did:web:<target>` resolves to a schema-valid doc with an Ed25519 key + DIDComm service. |
| `tls-fingerprint` | Pins the peer TLS cert against the fingerprint advertised by the agent (falls back to `/health` when running against a local `http://` sidecar). |
| `didcomm-probe` | POSTs a signed envelope; confirms the endpoint parses JWS and rejects unknown peers with `unknown_peer`. |
| `pairing-probe` | Drives the full pairing flow end-to-end via admin API. Requires programmatic options (admin token + principal keys); skips otherwise. |
| `revocation` | Validates `/.well-known/revocations.json` shape. With `expectedRevokedId`, polls until a previously-revoked id appears. |
| `cross-connection` | Takes a programmatic driver that exercises two connections against one peer; asserts zero leaks across 10 memory categories. |

---

## Compare two agents

```bash
arp-testkit compare samantha.agent ghost.agent
```

Emits a capability and scope diff between two agent cards.

---

## Programmatic use

```ts
import {
  runAudit,
  createPairingProbe,
  createCrossConnectionProbe,
  DEFAULT_MEMORY_CATEGORIES,
} from '@kybernesis/arp-testkit';

const summary = await runAudit('samantha.agent');
if (!summary.ok) {
  console.error('audit failed:', summary.probes.filter((p) => !p.pass));
  process.exit(2);
}
```

`createPairingProbe` + `createCrossConnectionProbe` accept dependency-
injection options so tests can drive the full flow against an in-process
runtime pair.

---

## Contribute a probe

1. Implement `Probe` in `src/probes/<name>.ts`. Signature:
   `(ctx: ProbeContext) => Promise<ProbeResult>`.
2. Add unit tests under `tests/<name>.test.ts` using a mock fetch /
   DoH / TLS socket.
3. Add an integration test in `tests/phase-5/testkit-integration.test.ts`
   that runs the probe against the dual-runtime harness.
4. Register the probe in `src/audit.ts` (`DEFAULT_PROBE_SUITE`) and
   export it from `src/probes/index.ts`.
5. Update this README's probe table.

Acceptance criteria for new probes:
- Unit-testable in < 100ms (mocks only).
- Integration-testable against a single runtime in < 2s.
- Sets `skipped: true` with a clear `skipReason` when preconditions
  aren't met (e.g. localhost target, missing credentials). Never
  hard-fails on "unprovisioned infrastructure".

---

## Nightly compliance CI

`.github/workflows/testkit-nightly.yml` runs the full audit against
every domain listed in the `TESTKIT_TARGET_DOMAINS` repository variable
(comma-separated). Set it in repo settings → Variables. Until Phase 5B
provisions real `.agent` domains, the variable stays unset and the
workflow exits cleanly with a `no targets configured` notice.
