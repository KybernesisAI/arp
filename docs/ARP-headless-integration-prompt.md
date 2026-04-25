# Headless v2.1 ARP integration — production-readiness prompt

**Reader:** Headless Domains' coding agent (autonomous). Drop this whole document into the agent's context window and let it execute.

**Goal:** make Headless's `.agent` TLD service production-ready for ARP v2.1 so Ian Borders (ARP) and Mike (Headless) can run a real customer end-to-end test against a live `.agent` domain. ARP has shipped the protocol layer, the cloud routes, the sidecar binary, the npm packages (24 of them under `@kybernesis/*` at the `latest` tag), and the GHCR sidecar image — the gating piece is Headless's registrar UX + the bind-principal callback.

**Authoritative spec:** [`ARP-tld-integration-spec-v2.1.md`](https://github.com/KybernesisAI/arp/blob/main/docs/ARP-tld-integration-spec-v2.1.md) and the v2 base it amends. Read both in full before touching code.

**Companion:** [`ARP-headless-parallel-build.md`](https://github.com/KybernesisAI/arp/blob/main/docs/ARP-headless-parallel-build.md) — the from-zero whole-world plan with 9 build tasks (provisioner, DNS orchestrator, well-known hoster, owner-subdomain hoster, handoff bundle emitter, dashboard buttons, reserved-names, compliance, registrar API). If you have **no v2 implementation in flight yet**, read the parallel-build first; this prompt is the v2.1-specific delta after v2 ships.

---

## 0. Which doc applies to me?

| State of your codebase | Read this | Then do |
|---|---|---|
| No `.agent` TLD integration at all yet | `parallel-build.md` (whole-world) → then this prompt | All 9 tasks in parallel-build, then §1 below |
| v2 implementation in flight, has Self.xyz prompt + missing bind callback | This prompt | §1.A + §1.B + §1.C below |
| v2 implementation already passing 8/8 testkit | This prompt | §1.A only (drop Self.xyz, swap to chooser) — your callback may already exist |

If unsure: this prompt covers the v2.1 amendment. The §9 done-when checklist is your acceptance.

---

## 1. Three things to ship, in one PR or three

### A. Two-option owner-binding chooser (spec §4)

Replace any "Sign in with Self.xyz" prompt in your **Setup-ARP-Local** + **Setup-ARP-Cloud** flows with two buttons on the same screen, no menu dive:

```
┌───────────────────────────────────────────────────────────┐
│  How do you want to bind ownership of this .agent domain? │
│                                                           │
│  ┌───────────────────────────────┐  ┌──────────────────┐  │
│  │ Use ARP Cloud account          │  │ Generate now      │  │
│  │ (recommended)                  │  │ (advanced)        │  │
│  └───────────────────────────────┘  └──────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

#### Option A — "Use ARP Cloud account (recommended)"

User clicks → redirect to `cloud.arp.run/onboard`:

```
GET https://cloud.arp.run/onboard
  ?domain=<sld>
  &registrar=headless
  &callback=<url-encoded-callback-url>
```

Where:
- `<sld>` is the second-level domain the user is registering (`samantha.agent`, `mike.agent`, etc.). Lowercase. Server-side validated against `^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$`.
- `registrar=headless` is fixed (single-registrar PSK in v2.1; per-registrar map is post-launch).
- `<callback-url>` is your callback handler. Must be `https://` (or `http://` for dev). Must point to a route on your service that handles the redirect-back (§B).

**Rate limits on `/onboard`:** 10/min burst, 100/hour sustained per IP. Honor `Retry-After` if you ever hit them.

Cloud handles signup (browser-held did:key keypair, recovery phrase, signs the representation JWT) then redirects the user back to your callback URL with the bound result appended as query parameters:

```
GET <callback-url>
  ?principal_did=did:web:cloud.arp.run:u:<uuid>
  &public_key_multibase=z6Mk...
  &signed_representation_jwt=eyJ...
```

All three params are present (Phase 10.5a added `public_key_multibase` so registrars don't have to do an extra did:web fetch).

The browser is now back on your domain with the values you need to publish the binding (§B).

#### Option B — "Generate now (advanced)"

In-browser Ed25519 keypair generation. No server hop:

```ts
// In your registrar's frontend (modern browser, Web Crypto + ed25519)
import * as ed25519 from '@noble/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

const HKDF_SALT_V2 = new TextEncoder().encode('arp-v2');
const HKDF_INFO_V2 = new TextEncoder().encode('principal-key');

const entropy = crypto.getRandomValues(new Uint8Array(16)); // 128-bit entropy
const mnemonic = entropyToMnemonic(entropy, wordlist);       // 12-word recovery phrase
const privateKey = hkdf(sha256, entropy, HKDF_SALT_V2, HKDF_INFO_V2, 32);
const publicKey = await ed25519.getPublicKeyAsync(privateKey);

// Multibase ed25519 public-key encoding (multicodec 0xed01 + base58btc-z prefix).
// Reference: ed25519RawToMultibase in @kybernesis/arp-transport/browser
const principalDid = `did:key:${publicKeyMultibase}`;
```

UI rules:
1. Display the 12-word phrase prominently. Require an "I have written down my recovery phrase" checkbox before continuing (recovery is the user's only safety net — losing it means losing the agent permanently).
2. Sign the representation JWT locally — see §2.1 for the exact W3C VC envelope.
3. Submit to your `bind-principal` handler with the same shape as Option A.

**Reuse from ARP's reference implementation:**
- `npm install @kybernesis/arp-transport` exports `ed25519RawToMultibase` (browser-safe via `/browser` subpath).
- Browser principal-key derivation lives in [`apps/owner-app/lib/principal-key-browser.ts`](https://github.com/KybernesisAI/arp/blob/main/apps/owner-app/lib/principal-key-browser.ts).
- Browser representation-JWT signer lives in [`apps/cloud/lib/representation-jwt-browser.ts`](https://github.com/KybernesisAI/arp/blob/main/apps/cloud/lib/representation-jwt-browser.ts).

#### UI rules (both options)

- Both buttons MUST appear on the same screen. No deep menu dives.
- Option A label: literally "Use ARP Cloud account (recommended)."
- Option B label: literally "Generate now (advanced)."
- **No "Sign in with Self.xyz" anywhere.** No iframes, no widgets, no redirects to anything containing the literal `self.xyz`, `Self.xyz`, or `selfxyz`. The `no-selfxyz-prompt` testkit probe scrapes registrar UX HTML for these strings.

### B. Bind-principal callback receiver (spec §5 + §7)

Implement (or update) `POST /api/v1/arp/domains/:sld/bind-principal`:

```
POST https://<your-host>/api/v1/arp/domains/:sld/bind-principal
Content-Type: application/json

{
  "owner_label":               "<owner>",
  "principal_did":             "<did>",
  "public_key_multibase":      "<mb>",
  "signed_representation_jwt": "<jws>"
}
```

#### What this handler MUST do, in order

1. **Validate the inputs.**
   - `owner_label` matches `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`
   - `principal_did` matches `^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$`
   - `public_key_multibase` starts with `z`, length ≥ 2
   - `signed_representation_jwt` is a 3-part JWS compact serialization (split by `.`, exactly 3 parts)

2. **Persist to your registrar DB** (linked to the domain row). Idempotent on `(domain, owner_label)` — re-binds overwrite (a user rotates their principal). This matches ARP's own bind upsert semantics.

3. **Publish the `_principal.<owner>.<sld>` TXT record** per v2 §5.2:

   ```
   _principal.<owner>.<sld>.   600  IN  TXT  "did=<principal_did>; rep=https://<owner>.<sld>/.well-known/representation.jwt"
   ```

   - Single TXT record, single string value.
   - 600s TTL recommended. The testkit's `dns` probe waits up to 60s for propagation.
   - Whitespace handling: the value is `did=<X>; rep=<Y>` with single spaces around the `;` separator and no spaces around the `=`.

4. **Host the representation JWT** at `https://<owner>.<sld>/.well-known/representation.jwt`. Public, unauthenticated, raw bytes:

   ```
   HTTP/1.1 200 OK
   Content-Type: application/jwt
   Cache-Control: public, max-age=300
   
   <raw-jws-compact-bytes>
   ```

   This URL is on your subdomain hoster (you serve `<owner>.<sld>` for any `<sld>` your registrar manages). Use a valid public CA cert (Let's Encrypt or wildcard).

5. **POST to ARP Cloud's bind callback:**

   ```
   POST https://cloud.arp.run/internal/registrar/bind
   Authorization: Bearer <ARP_CLOUD_REGISTRAR_PSK>
   Content-Type: application/json
   
   {
     "domain":               "<sld>",
     "owner_label":          "<owner>",
     "principal_did":        "<did>",
     "public_key_multibase": "<mb>",
     "representation_jwt":   "<jws>",
     "registrar":            "headless"
   }
   ```

   **PSK handling:** delivered out-of-band by Ian. Store in your secret manager. Never log. Never commit. The route constant-time-compares; a wrong PSK returns `401 unauthorized`.

   **Expected responses:**
   - `200 { ok: true, tenant_id: "<uuid|null>", binding_id: "<uuid>" }` — success. `tenant_id` may be `null` if the user hasn't completed `/onboard` yet on ARP's side; ARP reconciles on next login.
   - `400 { error: "bad_request", issues: [...] }` — your payload didn't pass validation. Issues array follows zod's shape.
   - `401 { error: "unauthorized" }` — PSK mismatch.
   - `429 { error: "rate_limited", retry_after: <seconds> }` — you exceeded the rate limit (60/min burst, 600/hour sustained). Honor `retry_after`.
   - `500 { error: "bind_failed" }` — DB write failed on ARP's side. Retry with exponential backoff up to 3 attempts.

   **Idempotency:** the upsert on `(domain, owner_label)` makes retries safe. Same `(domain, owner_label)` with new values overwrites previous values — that's the rotation case.

6. **Return success to your caller** (the browser that just hit your callback URL after the redirect-back). Render a "binding complete" confirmation UI that explains what happens next.

#### Order matters

Publish the TXT record + host the JWT **before** posting to ARP's bind callback. The bind callback is the "I'm done" signal — ARP may run its own verification (today: no; future: maybe). The user-visible state is "domain is bound" only after all three external commitments (TXT, JWT, bind POST) succeed.

If any step fails, surface the failure in the UI and offer a retry button. Don't leave a half-bound domain in your DB.

### C. Existing v2 surface — verify still passing

Your existing v2 endpoints + DNS orchestrator + well-known hoster + handoff-bundle emitter + reserved-names enforcement + compliance plumbing + registrar API: **unchanged**. Run your existing v2 conformance tests; they should remain green. v2.1 is additive + narrowing.

---

## 2. Reference materials

### 2.1 The signed representation JWT — exact W3C VC envelope

Schema source: [`@kybernesis/arp-spec/src/schemas/representation-vc.ts`](https://github.com/KybernesisAI/arp/blob/main/packages/spec/src/schemas/representation-vc.ts) (or `npm install @kybernesis/arp-spec` and import `RepresentationVcSchema`).

Compact-serialized JWS with `alg: EdDSA`. Three parts.

**Header (base64url JSON):**
```json
{
  "alg": "EdDSA",
  "kid": "<principal_did>#key-1",
  "typ": "JWT"
}
```

**Body (base64url JSON):**
```json
{
  "iss": "<principal_did>",
  "sub": "<agent_did>",
  "iat": 1730000000,
  "exp": 1761536000,
  "vc": {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    "type": ["VerifiableCredential", "AgentRepresentation"],
    "credentialSubject": {
      "id": "<agent_did>",
      "representedBy": "<principal_did>",
      "scope": "full",
      "constraints": {
        "maxConcurrentConnections": 10,
        "allowedTransferOfOwnership": false
      }
    }
  }
}
```

Notes:
- `iss` is the **principal** DID (the human's identity).
- `sub` is the **agent** DID — typically `did:web:<sld>` for the apex agent.
- `iat` + `exp` are Unix seconds, not milliseconds. `exp` defaults to `iat + 1 year` in the cloud-managed flow.
- `nbf` is **not** a field (don't include it).
- `vc.credentialSubject.scope` is `"full"` for whole-agent representation, `"scoped"` for partial (rare).
- `constraints.maxConcurrentConnections` defaults to 10. Use the spec defaults unless the user has a specific need.
- `constraints.allowedTransferOfOwnership` is `false` until v0.2 of the spec.

**Signature:** Ed25519 over `base64url(header) + "." + base64url(body)` using the principal's private key.

The `kid` MUST resolve via the ARP resolver to a key that verifies `iss`. The `representation-jwt-signer-binding` testkit probe asserts this — if you serve a JWT signed by a different key than what the DID document publishes, the probe fails.

The cloud-managed Option A flow signs this for you and returns it in the redirect-back. The browser-generated Option B flow signs it locally — port the helper from `apps/cloud/lib/representation-jwt-browser.ts` or use `@kybernesis/arp-spec` + your own `@noble/ed25519` signer.

### 2.2 The 11 testkit probes

Listed by `npx @kybernesis/arp-testkit --help` (verified against published `0.2.0`):

```
1. dns                                — _principal TXT exists + parses
2. well-known                         — /.well-known/{did,agent-card,arp}.json all 200
3. did-resolution                     — DID in TXT resolves through the ARP resolver
4. tls-fingerprint                    — TLS cert fingerprint pinned in DID doc matches actual cert
5. didcomm-probe                      — DIDComm endpoint serves expected JSON
6. pairing-probe                      — pair invitation flow round-trips with a test peer (programmatic only)
7. revocation                         — revocation list endpoint serves valid JSON
8. cross-connection                   — connection-token isolation across two test peers (programmatic only)
9. principal-identity-method          — TXT did= value resolves through resolver (needs ownerLabel)
10. no-selfxyz-prompt                 — registrar UX HTML contains no self.xyz literals (warn-only)
11. representation-jwt-signer-binding — JWT kid resolves to the same key that verifies iss (needs ownerLabel)
```

**Skip behavior matters.** When you run `npx @kybernesis/arp-testkit audit <sld>`, the CLI does not pass an `ownerLabel`, so probes 9 + 10 + 11 + the programmatic ones (6 + 8) auto-skip. The CLI is authoritative for 6 of 11 probes (`dns`, `well-known`, `did-resolution`, `tls-fingerprint`, `didcomm-probe`, `revocation`). The other 5 require either:
- The programmatic API: `import { runAudit } from '@kybernesis/arp-testkit'` and pass `{ ownerLabel, registrarSetupUrl }` in the context.
- Or call individual probes via `import { createPrincipalIdentityMethodProbe, createRepresentationJwtSignerBindingProbe, createNoSelfxyzPromptProbe } from '@kybernesis/arp-testkit/probes'`.

### 2.3 Real testkit output (ground truth)

This is what `npx @kybernesis/arp-testkit audit cloud.arp.run` emits today against ARP's cloud management surface. **It's not an agent**, so 5 probes fail (correctly) and 5 skip (no programmatic context). Your `<test-domain>.agent` should look very different — the failed probes here should pass against your bound domain.

```
ARP Compliance Audit — cloud.arp.run
====================================

  ✗ dns                        (676ms)
  ✗ well-known                 (366ms)
  ✗ did-resolution             (75ms)
  ✓ tls-fingerprint            (372ms)
  ✗ didcomm-probe              (149ms)
  • pairing-probe              (0ms)  (skipped: needs programmatic driver)
  ✗ revocation                 (67ms)
  • cross-connection           (0ms)  (skipped: needs programmatic driver)
  • principal-identity-method  (0ms)  (skipped: no ownerLabel in CLI)
  • no-selfxyz-prompt          (0ms)  (skipped: no registrarSetupUrl in CLI)
  • representation-jwt-signer-binding (0ms)  (skipped: no ownerLabel in CLI)

  1/6 passed · 5 skipped · 5 failed · 1.7s total
```

Against a properly-bound `samantha.agent` with sidecar running, you'd expect: `6/6 passed · 5 skipped · 0 failed`. The 5 skipped become testable when you call the programmatic API with `ownerLabel: "ian"` (or whatever owner sub-label you bound).

### 2.4 cURL recipes

**Test the redirect target manually:**

```bash
open "https://cloud.arp.run/onboard?domain=test-mike.agent&registrar=headless&callback=https://httpbin.org/get"
```

Sign up with a fresh browser, watch the redirect-back hit httpbin. Inspect the three query parameters (`principal_did`, `public_key_multibase`, `signed_representation_jwt`).

**Test the bind callback manually:**

```bash
curl -i -X POST https://cloud.arp.run/internal/registrar/bind \
  -H "Authorization: Bearer $ARP_CLOUD_REGISTRAR_PSK" \
  -H "Content-Type: application/json" \
  -d '{
    "domain":               "test-mike.agent",
    "owner_label":          "test",
    "principal_did":        "did:key:z6MkfakeYourFakeFakeFakeFakeFake",
    "public_key_multibase": "z6MkfakeYourFakeFakeFakeFakeFake",
    "representation_jwt":   "eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ4In0.AAAA",
    "registrar":            "headless"
  }'
```

Expected: `200 { "ok": true, "tenant_id": null, "binding_id": "<uuid>" }` (`tenant_id` null because the principal_did is fake; the row still inserts).

**Run the testkit:**

```bash
# CLI — runs 6 of 11 probes (the ones that don't need programmatic context)
npx @kybernesis/arp-testkit@latest audit test-mike.agent

# Single probe
npx @kybernesis/arp-testkit@latest probe well-known test-mike.agent

# Compare two domains
npx @kybernesis/arp-testkit@latest compare test-mike.agent samantha.agent --json
```

**Boot a local sidecar to test against:**

```bash
docker pull ghcr.io/kybernesisai/sidecar:latest
docker run --rm -p 7878:7878 -p 8443:443 \
  -v $(pwd)/data:/data \
  -e ARP_ADMIN_TOKEN="$(openssl rand -hex 32)" \
  ghcr.io/kybernesisai/sidecar:latest start \
  --data-dir /data \
  --port 8443
```

---

## 3. Acceptance criteria — your "done" definition

These are the spec §9 items, made concrete:

- [ ] **No Self.xyz literals** in any ARP-related UX text or asset. The `no-selfxyz-prompt` probe (warn-only) catches this.
- [ ] **"Setup ARP Local" button** presents the §1.A two-option chooser. Both buttons visible on first paint, no menu dive.
- [ ] **"Setup ARP Cloud" button** redirects to `cloud.arp.run/onboard?domain=<sld>&registrar=headless&callback=...` with all three query params populated.
- [ ] **`_principal.<owner>.<sld>` TXT publication** accepts both `did:key:...` and `did:web:cloud.arp.run:u:<uuid>` values. No host-portion validation that breaks the cloud-managed flow.
- [ ] **`POST /api/v1/arp/domains/:sld/bind-principal`** exists, persists the binding (idempotent on `(domain, owner_label)`), publishes the TXT, hosts the JWT, and POSTs to `cloud.arp.run/internal/registrar/bind` with the PSK.
- [ ] **Bind callback round-trip** — running `npx @kybernesis/arp-testkit@latest audit <test-domain>` returns 6/6 CLI-runnable probes green for at least one real test domain you registered through the new flow.
- [ ] **Programmatic 5/5 probes** — when you run the testkit programmatically with `ownerLabel` + `registrarSetupUrl` populated, the remaining 5 probes also return green.

When all seven are checked, email `ian@darkstarvc.com`. ARP team runs the audit and co-signs per `ARP-headless-parallel-build.md §5`.

---

## 4. Test domain strategy

Pick a throwaway test domain — a free internal `.agent` you can spin up cheaply, OR a real `.agent` registration on Mike's account specifically for this test. The flow runs the same way against either.

Ian and Mike will agree on the test domain out-of-band. Use whatever they tell you. Recommended naming: `test-arp-prod.agent` or `mike-arp-test.agent` so it's obvious in logs.

Once the integration round-trips end-to-end:
1. Register a real production domain (Ian's `samantha.agent`).
2. Drive Ian through the new Setup-ARP-Cloud flow.
3. Confirm `samantha.agent` resolves + serves well-knowns + testkit returns all probes green.
4. Email Ian for sign-off.

---

## 5. Non-goals

- **Mobile UX.** v2.1 is browser-only (the user's principal key lives in their browser localStorage). Mobile pairing is post-launch.
- **Self.xyz fallback.** It's deleted from ARP — do not add a "previously supported" toggle.
- **Multi-registrar PSK map.** v2.1 hardcodes `registrar=headless` for the PSK; future versions add a per-registrar map.
- **Custom Cedar policy at registration time.** Domain-default policies are scope-catalog defaults; per-domain policy editing happens after the user lands in `cloud.arp.run`.
- **VPS deployment instrumentation.** The sidecar Docker image works on any Linux host once DNS is pointed at it; Headless's role ends at TXT + JWT + bind callback.

---

## 6. Out-of-band delivery from Ian

Ian will message Mike directly with:

1. **`ARP_CLOUD_REGISTRAR_PSK`** (32 bytes hex). Set in your secret manager. Used as `Authorization: Bearer <psk>` against `cloud.arp.run/internal/registrar/bind`.
2. **Test domain name** — the `.agent` you both use for cross-org testing.
3. **Signal channel** for cross-org sign-off.

Don't proceed past §1.A until you've received #1 and #2.

---

## 7. Troubleshooting — what to do if a probe fails

| Probe | Failure mode | Likely cause | Fix |
|---|---|---|---|
| `dns` | TXT not found | Propagation delay or wrong record name | Wait 60s. Verify `_principal.<owner>.<sld>` (NOT `_principal.<sld>`). |
| `dns` | TXT value malformed | Wrong delimiter or quoting | Single TXT string `did=<X>; rep=<Y>`. Single space after `;`. No nested quotes. |
| `well-known` | 404 on representation.jwt | Hosting at wrong path | MUST be `https://<owner>.<sld>/.well-known/representation.jwt` (subdomain at `<owner>`, not apex). |
| `well-known` | TLS error | Self-signed cert or hostname mismatch | The owner-subdomain serves the JWT — issue a valid public CA cert for `<owner>.<sld>` (Let's Encrypt or your wildcard). |
| `did-resolution` | DID document not found | Wrong host portion in did:web | The DID Mike receives in the redirect-back is the source of truth. Don't rewrite it. |
| `tls-fingerprint` | mismatch | DID doc declares wrong fingerprint, OR cert renewed without DID-doc update | Sidecar's bootstrap regenerates the fingerprint on startup — restart the sidecar to align. |
| `principal-identity-method` | Method not supported | Bad DID format | The TXT `did=` must match `^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$`. did:key + did:web both supported. |
| `representation-jwt-signer-binding` | kid doesn't match iss | JWT signed with wrong key OR JWT envelope wrong | Your registrar must NOT re-sign the JWT. Pass through whatever the user (or ARP cloud) signed. The W3C VC envelope in §2.1 is non-negotiable. |
| `no-selfxyz-prompt` | warn: literal found | Stray UX string | Grep your codebase for `self.xyz` / `Self.xyz` / `selfxyz`. Remove. |
| `pairing-probe` | timeout | Sidecar not running at the agent apex | Pairing tests against a sidecar at `<sld>` (not `<owner>.<sld>`). If the user picked Setup-ARP-Cloud (no sidecar), pairing-probe is informational, not gating. |
| `revocation` | non-2xx | Revocation endpoint not implemented | Sidecar serves it at `<sld>/.well-known/revocations.json`. Headless doesn't host this — it's the user's sidecar's responsibility. |

---

## 8. Code reuse pointers

All published under the `@kybernesis/*` npm scope at the `latest` tag (24 packages, all 0.x.x).

| What you need | Package | Notable export |
|---|---|---|
| Browser-side principal key (HKDF v2 + multibase) | source: `apps/owner-app/lib/principal-key-browser.ts` | port directly |
| Browser-side representation JWT signer | source: `apps/cloud/lib/representation-jwt-browser.ts` | port directly |
| Multibase encode/decode (browser-safe) | `@kybernesis/arp-transport` (subpath: `/browser`) | `ed25519RawToMultibase` |
| DID resolver (server-side, Node.js) | `@kybernesis/arp-resolver` | `createResolver()` |
| TXT-record parser | `@kybernesis/arp-resolver` | (used internally by the resolver) |
| Cedar schema | `@kybernesis/arp-spec` | `cedar-schema.json` |
| Representation JWT schema | `@kybernesis/arp-spec` | `RepresentationVcSchema` |
| Compliance testkit (CLI + programmatic) | `@kybernesis/arp-testkit` | `runAudit(target, baseUrl, { context })` |
| Sidecar Docker image | `ghcr.io/kybernesisai/sidecar:latest` | `arp-sidecar start` |

---

## 9. Begin here

1. Read both spec docs end-to-end (`ARP-tld-integration-spec-v2.md` + `ARP-tld-integration-spec-v2.1.md`).
2. Stand up a feature branch in your registrar repo.
3. Wait for Ian's out-of-band delivery (PSK + test domain).
4. Implement §1.A (chooser UI). Open a draft PR.
5. Implement §1.B (callback receiver). Push to the same branch.
6. Run `npx @kybernesis/arp-testkit@latest audit <test-domain>`. Iterate until green.
7. Run the programmatic audit with `ownerLabel` populated. Iterate until 11/11.
8. Email Ian for cross-org sign-off.

Estimated scope: ~250 LOC of UI + ~150 LOC of backend + ~50 LOC of tests. One to two days of focused work. The narrow contract is what makes this fast — every detail above is enforced by an automated probe, so you can drive against the testkit without round-trips through humans.

---

*Authored 2026-04-25. Validated against published `@kybernesis/arp-testkit@0.2.0` and live `cloud.arp.run` endpoints. The §2.3 ground-truth output is from a real CLI run. Update this doc in place if probes change.*
