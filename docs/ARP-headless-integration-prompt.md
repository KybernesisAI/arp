# Headless v2.1 ARP integration — production-readiness prompt

**Reader:** Headless Domains' coding agent (autonomous). Drop this whole document into the agent's context window and let it execute.

**Goal:** make Headless's `.agent` TLD service production-ready for ARP v2.1 so Ian Borders (ARP) and Mike (Headless) can run a real customer end-to-end test against a live `.agent` domain. ARP's protocol layer + cloud routes + sidecar binary are already shipped — the gating piece is Headless's registrar UX + the bind-principal callback.

**Authoritative spec:** [`ARP-tld-integration-spec-v2.1.md`](https://github.com/KybernesisAI/arp/blob/main/docs/ARP-tld-integration-spec-v2.1.md) and the v2 base it amends. Read both in full before touching code.

**Scope of this prompt:** the §8 migration list. The §9 done-when checklist is your acceptance criteria. Everything else is non-goal.

---

## 0. Context the spec doesn't give you

### What's already done on ARP's side

- `cloud.arp.run/onboard?domain=&registrar=&callback=` — the redirect target where Setup-ARP-Cloud users sign up. Live in production. Validates params, mints a tenant + browser-held did:key identity, signs a representation JWT, redirects back to your callback.
- `cloud.arp.run/internal/registrar/bind` — the PSK-gated callback you POST to after publishing the TXT record + JWT. Live in production.
- `cloud.arp.run/u/<uuid>/did.json` — the did:web resolution endpoint. Serves the principal's public key + dual-publishes during 90-day rotation grace. Live in production.
- `npx @kybernesis/arp-testkit@next audit <domain>` — the conformance suite (10 probes; will be 11 by your test date). Available under the `next` npm tag for pre-launch validation.
- `ghcr.io/kybernesisai/sidecar:dev` — the sidecar Docker image, available for local agent testing.

### What's pending on ARP's side (will be in place before you start)

ARP team is landing two pre-flight fixes before your integration round-trips:

1. **The cloud-managed principal DID's hostname.** Spec docs say `did:web:arp.cloud:u:<uuid>` but the resolution endpoint serves at `cloud.arp.run`. ARP is either acquiring `arp.cloud` and pointing it at the same Vercel deployment OR changing the mint to `did:web:cloud.arp.run:u:<uuid>`. Either way, the DID returned in the redirect-back will be resolvable as a did:web at the host portion of the DID itself.

2. **`public_key_multibase` in the redirect-back.** Currently the redirect-back only carries `principal_did` + `signed_representation_jwt`. Your `POST /internal/registrar/bind` payload requires `public_key_multibase`. ARP is adding it to the redirect-back query string. Until that ships, derive it server-side by fetching the DID document (see §3.B step 4 below — this code stays useful even after the fix).

3. **`ARP_CLOUD_REGISTRAR_PSK` provisioned on Vercel.** Ian will deliver the PSK value to Mike out-of-band. The route already reads `process.env.ARP_CLOUD_REGISTRAR_PSK` and constant-time compares against the bearer token; once the env var is set + the Deploy workflow re-fires, your PSK calls will succeed.

You should write code resilient to either way ARP fixes (1) and (2). Don't hardcode `cloud.arp.run` or `arp.cloud` for the principal DID's host portion — read the host out of whatever DID we hand back.

---

## 1. The three-PR scope on Headless's side

Land these in one PR or three sequential PRs, your call. They share testing.

### A. Two-option owner-binding chooser (spec §4)

Replace the existing "Sign in with Self.xyz" prompt in your **Setup-ARP-Local** + **Setup-ARP-Cloud** flows with two buttons on the same screen, no menu dive:

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
- `<sld>` is the second-level domain the user is registering (`samantha.agent`, `mike.agent`, etc.). Lowercase. Validated server-side against `^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$`.
- `registrar=headless` is fixed.
- `<callback-url>` is your callback handler. Must be an `https://` URL (or `http://` for dev). Must point to a route on your service that handles the redirect-back (§B).

Cloud handles signup (browser-held did:key keypair, recovery phrase, signs the representation JWT) then redirects the user back to your callback URL with the bound result appended as query parameters:

```
GET <callback-url>
  ?principal_did=<did>
  &signed_representation_jwt=<jws>
  [&public_key_multibase=<mb>]   # added by ARP pre-fix; see §0.2
```

The browser is now back on your domain with the values you need to publish the binding (§B).

#### Option B — "Generate now (advanced)"

In-browser Ed25519 keypair generation. No server hop:

```ts
// In your registrar's frontend (modern browser, Web Crypto + ed25519)
import * as ed25519 from '@noble/ed25519';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

const entropy = crypto.getRandomValues(new Uint8Array(16)); // 128-bit entropy
const mnemonic = entropyToMnemonic(entropy, wordlist);       // 12-word recovery phrase
const privateKey = entropyToPrivateKey(entropy);             // HKDF-SHA256, salt='arp-v2', info='principal-key'
const publicKey = await ed25519.getPublicKeyAsync(privateKey);
const publicKeyMultibase = ed25519RawToMultibase(publicKey); // 'z' + base58btc(0xed01 + raw32)
const principalDid = `did:key:${publicKeyMultibase}`;
```

UI rules:
1. Display the 12-word phrase prominently. Require an "I have written down my recovery phrase" checkbox before continuing (recovery is the user's only safety net — losing it means losing the agent permanently).
2. Sign the representation JWT locally (see §2.3 for the schema).
3. Submit to your `bind-principal` handler with the same shape as Option A.

**Reuse from ARP's reference implementation:** the HKDF-v2 derivation + multibase encoding live in [`apps/owner-app/lib/principal-key-browser.ts`](https://github.com/KybernesisAI/arp/blob/main/apps/owner-app/lib/principal-key-browser.ts). Port directly — same spec, same wire format. The `@kybernesis/arp-transport/browser` subpath exports `ed25519RawToMultibase` if you want to depend on that package directly.

#### UI rules (both options)

- Both buttons MUST appear on the same screen. No deep menu dives.
- Option A label: literally "Use ARP Cloud account (recommended)."
- Option B label: literally "Generate now (advanced)."
- **No "Sign in with Self.xyz" anywhere.** No iframes, no widgets, no redirects to anything containing the literal `self.xyz`, `Self.xyz`, or `selfxyz` (the `no-selfxyz-prompt` testkit probe scrapes your registrar UX HTML for these strings).

### B. Bind-principal callback receiver (spec §5 + §7)

Your existing v2 endpoint shape stays:

```
POST https://<your-host>/api/v1/arp/domains/:sld/bind-principal
Content-Type: application/json

{
  "owner_label":               "<owner>",
  "principal_did":             "<did>",
  "public_key_multibase":      "<mb>",      // optional; derive if missing
  "signed_representation_jwt": "<jws>"
}
```

#### What this handler MUST do, in order

1. **Validate the inputs.**
   - `owner_label` matches `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`
   - `principal_did` matches `^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$`
   - `public_key_multibase` (if provided) starts with `z`, length ≥ 2
   - `signed_representation_jwt` is a 3-part JWS compact serialization (split by `.`, exactly 3 parts)

2. **Persist to your registrar DB** (linked to the domain row). Idempotent on `(domain, owner_label)` — re-binds overwrite (a user rotates their principal). This matches ARP's own bind upsert semantics.

3. **Publish the `_principal.<owner>.<sld>` TXT record** per v2 §5.2:

   ```
   _principal.<owner>.<sld>.   600  IN  TXT  "did=<principal_did>; rep=https://<owner>.<sld>/.well-known/representation.jwt"
   ```

   - Single TXT record, single string value.
   - 600s TTL recommended. The testkit's `dns` probe waits up to 60s for propagation.
   - Whitespace handling: the value is `did=<X>; rep=<Y>` with single spaces around the `;` separator and no spaces around the `=`. The ARP resolver tolerates a single optional space after the semicolon but nothing else.

4. **Host the representation JWT** at `https://<owner>.<sld>/.well-known/representation.jwt`. Public, unauthenticated, raw bytes:

   ```
   HTTP/1.1 200 OK
   Content-Type: application/jwt
   Cache-Control: public, max-age=300
   
   <raw-jws-compact-bytes>
   ```

5. **Derive `public_key_multibase` if not provided.** When the redirect-back didn't include it, fetch the DID document and read it:

   ```ts
   async function derivePublicKeyMultibase(principalDid: string): Promise<string> {
     // Decode did:key inline:
     if (principalDid.startsWith('did:key:')) {
       return principalDid.slice('did:key:'.length); // already a multibase string
     }
     // Resolve did:web:<host>:<path>:<seg>... → https://<host>/<path>/<seg>/did.json
     if (principalDid.startsWith('did:web:')) {
       const tail = principalDid.slice('did:web:'.length);
       const segs = tail.split(':');
       const host = decodeURIComponent(segs[0]);
       const path = segs.slice(1).map(decodeURIComponent).join('/');
       const url = path ? `https://${host}/${path}/did.json` : `https://${host}/.well-known/did.json`;
       const res = await fetch(url, { redirect: 'manual' });
       if (!res.ok) throw new Error(`did:web fetch ${url} → ${res.status}`);
       const doc = await res.json();
       const vm = doc.verificationMethod?.[0];
       if (!vm?.publicKeyMultibase) throw new Error('did:web doc missing verificationMethod[0].publicKeyMultibase');
       return vm.publicKeyMultibase;
     }
     throw new Error(`unsupported DID method in ${principalDid}`);
   }
   ```

6. **POST to ARP Cloud's bind callback:**

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

7. **Return success to your caller** (the browser that just hit your callback URL after the redirect-back). Render a "binding complete" confirmation UI that explains what happens next.

#### Order matters

Publish the TXT record + host the JWT **before** posting to ARP's bind callback. The bind callback is the "I'm done" signal — ARP may run its own verification (today: no; future: maybe). The user-visible state is "domain is bound" only after all three external commitments (TXT, JWT, bind POST) succeed.

If any step fails, surface the failure in the UI and offer a retry button. Don't leave a half-bound domain in your DB.

### C. Existing v2 surface — verify still passing

Your existing v2 endpoints + DNS orchestrator + well-known hoster + handoff-bundle emitter + reserved-names enforcement + compliance plumbing + registrar API: **unchanged**. Run your existing v2 conformance tests; they should remain green. v2.1 is additive + narrowing.

If your test suite uses the testkit, swap the call to:

```bash
npx @kybernesis/arp-testkit@next audit <test-domain>
```

The new probes (`principal-identity-method`, `no-selfxyz-prompt`, `representation-jwt-signer-binding`) join the existing 7. They gate at the next testkit minor version — recommended but not blocking for v2.1 conformance.

---

## 2. Reference materials

### 2.1 The signed representation JWT schema

Schema: [`@kybernesis/arp-spec/src/schemas/representation-vc.ts`](https://github.com/KybernesisAI/arp/blob/main/packages/spec/src/schemas/representation-vc.ts).

Compact-serialized JWS with `alg: EdDSA`. Three parts:

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
  "sub": "<principal_did>",
  "iat": 1730000000,
  "exp": 1761536000,
  "nbf": 1730000000,
  "represents": {
    "domain": "<sld>",
    "owner_label": "<owner>",
    "agent_apex": "<owner>.<sld>"
  },
  "principal": {
    "did": "<principal_did>",
    "publicKeyMultibase": "<mb>"
  }
}
```

**Signature:** Ed25519 over `base64url(header) + "." + base64url(body)` using the principal's private key.

`kid` MUST resolve via the ARP resolver to a key that verifies `iss`. The `representation-jwt-signer-binding` testkit probe asserts this — if you serve a JWT signed by a different key than `principal.publicKeyMultibase`, the probe fails.

The cloud-managed Option A flow signs this for you and returns it in the redirect-back. The browser-generated Option B flow signs it locally — port the helper from [`apps/cloud/lib/representation-jwt-browser.ts`](https://github.com/KybernesisAI/arp/blob/main/apps/cloud/lib/representation-jwt-browser.ts).

### 2.2 The 10 testkit probes (will be 11 by your test date)

```
1. dns                            — _principal TXT exists + parses + matches DOMAIN_REGEX
2. well-known                     — /.well-known/{did,agent-card,arp,representation}.json all 200
3. did-resolution                 — DID in TXT resolves via the ARP resolver
4. didcomm-probe                  — DIDComm handshake against the agent's endpoint succeeds
5. pairing-probe                  — pair invitation flow round-trips with a test peer
6. revocation                     — revocation list endpoint serves valid JSON
7. cross-connection               — connection-token isolation verified across two test peers
8. principal-identity-method      — TXT did= value resolves through the ARP resolver (did:web OR did:key)
9. representation-jwt-signer-binding — JWT's kid resolves to the same key that verifies iss
10. no-selfxyz-prompt             — registrar UX HTML at registrar's homepage contains no self.xyz literals (warn-only, not blocking)
```

Probe 10 fetches your registrar's homepage and any linked Setup-ARP-* pages. It scans for the literal strings. Keep them out.

### 2.3 Useful cURL recipes

**Test the redirect target manually:**

```bash
open "https://cloud.arp.run/onboard?domain=test-mike.agent&registrar=headless&callback=https://httpbin.org/get"
```

Sign up with a fresh browser, watch the redirect-back hit httpbin. Inspect the query parameters.

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

Expected: `200 { "ok": true, "tenant_id": null, "binding_id": "<uuid>" }` (tenant_id null because principal_did is fake; the row still inserts).

**Run the testkit:**

```bash
npx @kybernesis/arp-testkit@next audit test-mike.agent
```

Outputs a per-probe report. Exit code 0 if all green, non-zero on any failure.

---

## 3. Acceptance criteria — your "done" definition

These are the spec §9 items, made concrete:

- [ ] **No Self.xyz literals** in any ARP-related UX text or asset. Verified by `no-selfxyz-prompt` probe.
- [ ] **"Setup ARP Local" button** presents the §A two-option chooser. Both buttons visible on first paint, no menu dive.
- [ ] **"Setup ARP Cloud" button** redirects to `cloud.arp.run/onboard?domain=<sld>&registrar=headless&callback=...` with all three query params populated.
- [ ] **`_principal.<owner>.<sld>` TXT publication** accepts both `did:key:...` and `did:web:...` values. No host-portion validation that breaks the cloud-managed flow.
- [ ] **`POST /api/v1/arp/domains/:sld/bind-principal`** exists, persists the binding (idempotent on `(domain, owner_label)`), publishes the TXT, hosts the JWT, and POSTs to `cloud.arp.run/internal/registrar/bind` with the PSK.
- [ ] **Bind callback round-trip** — running `npx @kybernesis/arp-testkit@next audit <test-domain>` returns all probes green for at least one real test domain you registered through the new flow. Probe 10 (`no-selfxyz-prompt`) being warn-only does NOT count as failure.

When all six are checked, email `ian@darkstarvc.com`. ARP team runs the audit and co-signs per `ARP-headless-parallel-build.md §5` and we proceed to launch.

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

- **Mobile UX.** v2.1 is browser-only (the user's principal key lives in their browser localStorage). Mobile pairing is post-launch (Phase 11+ track in the ARP repo, mirrored at `github.com/KybernesisAI/arp-mobile`).
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

Don't proceed past §A until you've received #1 and #2.

---

## 7. Troubleshooting — what to do if a probe fails

| Probe | Failure mode | Likely cause | Fix |
|---|---|---|---|
| `dns` | TXT not found | Propagation delay or wrong record name | Wait 60s. Verify `_principal.<owner>.<sld>` (NOT `_principal.<sld>`). |
| `dns` | TXT value malformed | Wrong delimiter or quoting | Single TXT string `did=<X>; rep=<Y>`. Single space after `;`. No nested quotes. |
| `well-known` | 404 on representation.jwt | Hosting at wrong path | MUST be `https://<owner>.<sld>/.well-known/representation.jwt` (subdomain at `<owner>`, not apex). |
| `well-known` | TLS error | Self-signed cert or hostname mismatch | The owner-subdomain serves the JWT — issue a valid public CA cert for `<owner>.<sld>` (Let's Encrypt or your wildcard). |
| `did-resolution` | DID document not found | Wrong host portion in did:web | The DID Mike receives in the redirect-back is the source of truth. Don't rewrite it. If resolution fails, message Ian — likely the ARP-side hostname fix hasn't landed. |
| `principal-identity-method` | Method not supported | Bad DID format | The TXT `did=` must match `^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$`. did:key and did:web both supported. |
| `representation-jwt-signer-binding` | kid doesn't match iss | JWT signed with wrong key | Your registrar must NOT re-sign the JWT. Pass through whatever the user (or ARP cloud) signed with their principal key. |
| `no-selfxyz-prompt` | warn: literal found | Stray UX string | Grep your codebase for `self.xyz` / `Self.xyz` / `selfxyz`. Remove. (Warn-only — won't block sign-off, but keep it clean.) |
| `pairing-probe` | timeout | Sidecar not running at the agent apex | Pairing tests against a sidecar at `<sld>` (not `<owner>.<sld>`). If the user picked Setup-ARP-Cloud (no sidecar), pairing-probe is informational, not gating. |
| `revocation` | non-2xx | Revocation endpoint not implemented | Sidecar serves it at `<sld>/.well-known/revocations.json`. Headless doesn't host this — it's the user's sidecar's responsibility. |

---

## 8. Code reuse pointers

| What you need | Where it lives in the ARP repo |
|---|---|
| Browser-side principal key (HKDF v2 + multibase) | `apps/owner-app/lib/principal-key-browser.ts` |
| Browser-side representation JWT signer | `apps/cloud/lib/representation-jwt-browser.ts` |
| Multibase encode/decode | `@kybernesis/arp-transport/browser` (`ed25519RawToMultibase`) |
| DID resolver (server-side, Node.js) | `@kybernesis/arp-resolver` |
| TXT-record value parser | `@kybernesis/arp-resolver/parse-principal-txt` |
| Cedar schema (for understanding scope-catalog) | `packages/spec/src/cedar-schema.json` |

All published under the `@kybernesis/*` npm scope (use the `@next` tag during pre-launch).

---

## 9. Begin here

1. Read both spec docs end-to-end.
2. Stand up a feature branch in your registrar repo.
3. Wait for Ian's out-of-band delivery (PSK + test domain).
4. Implement §A (chooser UI). Open a draft PR.
5. Implement §B (callback receiver). Push to the same branch.
6. Run `npx @kybernesis/arp-testkit@next audit <test-domain>`. Iterate until green.
7. Email Ian for cross-org sign-off.

Estimated scope: ~250 LOC of UI + ~150 LOC of backend + ~50 LOC of tests. One to two days of focused work. The narrow contract is what makes this fast — every detail above is enforced by an automated probe, so you can drive against the testkit without round-trips through humans.

---

*Authored 2026-04-25 against ARP repo state at commit on `main`. Mirrors `ARP-tld-integration-spec-v2.1.md` §8 + §9 with concrete implementation guidance. Update in place if the underlying spec drifts.*
