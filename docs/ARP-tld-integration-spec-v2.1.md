# ARP × `.agent` TLD Integration — Spec Amendment v2.1

**Status:** amendment to `ARP-tld-integration-spec-v2.md`. Additive + narrowing only. No DNS record shapes, well-known paths, or JSON schemas change. Existing v2 deployments remain conformant after the two changes in §3.

**Reader:** Headless Domains engineering + their autonomous coding agent.

**Authoritative source:** `ARP-tld-integration-spec-v2.md` remains the base contract. Where this document conflicts with v2, v2.1 wins.

**Effective:** ARP Phase 8.5 (2026-04). Compliance required before Phase 9 co-sign.

---

## 1. Motivation

During ARP Phase 8 mid-build, we audited the identity story and found the `self.xyz`-based principal DID assumption was leaking into the registration UX when the protocol didn't require it. Concretely:

- The protocol layer treats the `principal_did` field as an opaque DID string. It is verified via the resolver (DID method-aware). No code path requires any specific DID method, issuer, or identity provider.
- The `_principal.<owner>.<domain>` TXT record's `did=` value was specified as `did:web:<user>.self.xyz` in §5.2 but the regex in `@kybernesis/arp-spec` accepts any `^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$`.
- Self.xyz was scaffolded in `@kybernesis/arp-selfxyz-bridge` but never wired into production paths. It has been deleted in Phase 8.5.

The result: Headless's v2 flow as specified prompts the user to "sign in with Self.xyz," which is now neither required by the protocol nor supported by the ARP reference implementation. v2.1 formalises the removal and documents the two identity methods that are supported.

---

## 2. What does NOT change (compatibility envelope)

- DNS record names, types, formats. Unchanged.
- Well-known HTTPS paths + file formats (`/.well-known/did.json`, `agent-card.json`, `arp.json`, `representation.jwt`, `revocations.json`). Unchanged.
- JSON Schema shapes in `@kybernesis/arp-spec`. Unchanged.
- Handoff bundle format (`ARP-installation-and-hosting.md §2`). The `principal_did` field value widens to include `did:key:...`; shape unchanged.
- ACME flow. Unchanged.
- Reserved-names enforcement. Unchanged.
- Registrar API surface (§3.4 of v2). Unchanged.
- Compliance test (`@kybernesis/arp-testkit audit <domain>` returns 8/8). Unchanged.

**If Headless's in-flight implementation already passes the v2 compliance suite, the only work needed for v2.1 conformance is the two UX edits in §3 below.**

---

## 3. What changes

### 3.1 `_principal.<owner>.<domain>` TXT record — accepted values

v2 §5.2 example: `did=did:web:ian.self.xyz; rep=https://ian.samantha.agent/.well-known/representation.jwt`

v2.1 **explicit**: the `did=` value MAY be any DID matching `^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$`. The two recommended defaults are:

| Value form | When used | Resolver path |
|---|---|---|
| `did:key:z6Mk...` | Browser-generated keypair, user retains recovery phrase | Public key decoded directly from DID; no HTTPS fetch |
| `did:web:cloud.arp.run:u:<uuid>` | ARP Cloud-managed account | Fetched from `https://arp.cloud/u/<uuid>/did.json` (available Phase 9) |

Values matching `did:web:<any>.self.xyz` are still syntactically valid (the regex permits them) but are no longer the recommended default and MUST NOT be prompted for by the registrar UX.

### 3.2 Registration flow step 9 — "Collect owner binding"

v2 §7 step 9 (paraphrased): "prompt buyer for their principal DID (text input, validated against `^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$`)."

v2.1 **replaces** with the two-option chooser documented in §4 below. The free-form text input MUST be removed. The "Self.xyz sign-in" prompt in `ARP-headless-parallel-build.md §1` MUST be removed.

### 3.3 Registration flow step 11 — "Provision representation JWT"

v2 §7 step 11: "buyer signs the §6.4 payload with their principal key in their wallet; signed JWT is uploaded and served at `https://{owner}.samantha.agent/.well-known/representation.jwt`."

v2.1 **clarifies**: the signer is now one of:

1. **Browser-side, did:key path** — the same browser keypair created in step 9 signs the JWT inline before upload. `kid` = `did:key:z...#key-1`.
2. **ARP Cloud callback, did:web path** — if the user chose "Use ARP Cloud account" in step 9, ARP Cloud signs the JWT server-side using the cloud-managed principal key and POSTs the signed JWT to Headless's hosting endpoint. `kid` = `did:web:cloud.arp.run:u:<uuid>#key-1`.

Both produce the same JWS compact-serialisation format. JWT schema in `@kybernesis/arp-spec/src/schemas/representation-vc.ts` is unchanged.

### 3.4 `rep=` URL — relaxed hosting topology (Phase 10.5)

v2 §5.2 example showed `rep=https://{owner}.<sld>/.well-known/representation.jwt`, suggesting the JWT must be hosted on the owner subdomain. **This was over-specified.** Asking a registrar to provision per-owner-subdomain TLS certs at scale (thousands of HNS subdomains, each needing public CA chains) requires architectural changes the registrar may not have — Cloudflare for SaaS, dedicated reverse proxies with on-demand TLS, etc.

v2.1 §3.4 **clarifies**: the `rep=` URL in the `_principal.<owner>.<sld>` TXT record can be **any HTTPS URL the registrar controls**. The owner-subdomain form is one option; the centralized-hosting form is another. Both are conformant. Examples:

| Form | URL pattern | When used |
|---|---|---|
| Owner-subdomain | `https://<owner>.<sld>/.well-known/representation.jwt` | Registrar runs per-subdomain TLS (e.g. Cloudflare for SaaS, Caddy on-demand) |
| Centralized-registrar | `https://<registrar>.com/.well-known/arp/<sld>/<owner>/representation.jwt` | Registrar serves all JWTs from a single TLS-terminated host |
| Path on apex | `https://<sld>/<owner>/.well-known/representation.jwt` | Registrar runs apex hosting that handles per-owner routing |

Verifiers (testkit, sidecars, anyone reading the TXT) MUST follow the URL the TXT advertises; they MUST NOT assume a specific path or host structure. The crypto contract is unchanged: anyone fetches `<rep-url>`, decodes the compact JWS, verifies the signature against the verification method whose `id` matches the JWS `kid` in the resolved `iss` DID document.

The §5.2 owner-subdomain CNAME row in v2 is **optional in v2.1** — required only if the registrar uses the owner-subdomain hosting form.

---

## 4. The two-option owner-binding UX

Replace "Collect the owner's principal DID (usually `did:web:<username>.self.xyz`). Prompt for Self.xyz sign-in if needed." with a two-option chooser:

### Option A — "Use ARP Cloud account" (recommended default for most users)

1. User clicks "Use ARP Cloud account."
2. Headless redirects the user's browser to `https://arp.cloud/onboard?domain=<sld>&registrar=headless&callback=<url-encoded-callback>`.
3. ARP Cloud handles signup (identity generation, tenant creation) and redirects the user back to Headless's callback URL with `?principal_did=did:web:arp.cloud:u:<uuid>&signed_representation_jwt=<jwt>` (JWT produced per v2 §6.4, signed by the cloud-managed principal key).
4. Headless proceeds with steps 10-14 of v2 §7 using the returned values.

### Option B — "Generate now (advanced)"

1. User clicks "Generate now (advanced)."
2. Headless UI runs in-browser Ed25519 keypair generation via `@noble/ed25519`:
   ```js
   const privateKey = ed25519.utils.randomPrivateKey();
   const publicKey  = await ed25519.getPublicKeyAsync(privateKey);
   const did        = `did:key:z${multibase.encode(0xed01, publicKey)}`;
   ```
3. The UI displays a 12-word recovery phrase (deterministic from the private key) and requires the user to confirm they have saved it before continuing.
4. The private key downloads as `principal-key.txt` (or equivalent). Headless never persists or transmits it.
5. The UI signs the representation JWT locally with the private key.
6. Headless receives only the public key (multibase), the principal DID (`did:key:z...`), and the signed representation JWT.

Option B is what current self-sovereign / developer users need. Offer it behind an "Advanced" disclosure. Option A should be the default button.

### UI requirements

- Both options MUST appear on the same screen (no deep menu dives).
- Option A button label: "Use ARP Cloud account (recommended)."
- Option B button label: "Generate now (advanced)."
- When Option B is selected: the recovery-phrase UI MUST require explicit confirmation before proceeding ("I've saved my recovery phrase" checkbox or equivalent).
- No "Sign in with Self.xyz" button. No Self.xyz iframe / widget / redirect.

---

## 5. Setup ARP Cloud flow — delegation

`ARP-headless-parallel-build.md §1` Setup ARP Cloud step 6 currently reads "Collect the principal DID via Self.xyz."

v2.1 replaces with:

> Redirect the user to `arp.cloud/onboard?domain=<sld>&registrar=headless` immediately after the DNS/well-known work in step 5. ARP Cloud:
>
> - Onboards the user (browser-held did:key identity, same flow as Option B but hosted on our side with a slightly simpler recovery UX).
> - Creates the tenant.
> - Calls back to your `POST /api/v1/arp/domains/<sld>/bind-principal` endpoint with the principal DID, public key multibase, and the signed representation JWT.
>
> After receiving the callback, you (Headless) publish the `_principal` TXT record and host the representation JWT at `{owner}.<sld>/.well-known/representation.jwt` per v2 §5.2 + §6.4. No other changes.

If the callback endpoint does not yet exist on Headless's side, Phase 8.5 exposes a stub documented in §7 below.

---

## 6. Test-vector additions

`@kybernesis/arp-testkit` (Phase 5, conformance suite) gains three new probes in Phase 8.5:

- `principal-identity-method`: asserts the `_principal` TXT record's `did=` value resolves via the ARP resolver (both `did:web:` and `did:key:` accepted).
- `no-selfxyz-prompt`: optional, best-effort probe against the registrar UX HTML (checks for literal strings `self.xyz`, `Self.xyz`, `selfxyz`). Warn-only; not blocking.
- `representation-jwt-signer-binding`: asserts the representation JWT's `kid` resolves to the same key that verifies the `iss` DID.

All three probes are additive. The 8/8 compliance count grows to 10/10 at Phase 9 launch; Phase 8.5 interim target is 8/8 passing on the existing probe set + the new three green on stubbed data.

---

## 7. Stub / endpoint contract (for Headless implementation)

While Phase 8.5 is in flight, ARP Cloud exposes a stub callback receiver:

```
POST https://arp.cloud/internal/registrar/bind
  Authorization: Bearer <pre-shared-key>
  Content-Type: application/json
  Body: {
    "domain":                "samantha.agent",
    "owner_label":           "ian",
    "principal_did":         "did:web:arp.cloud:u:<uuid>",
    "public_key_multibase":  "z6Mk...",
    "representation_jwt":    "eyJhbGciOiJFZERTQSJ9..."
  }
  Response (200): {
    "ok": true,
    "tenant_id": "<opaque>"
  }
```

Headless calls this AFTER hosting the representation JWT + publishing the `_principal` TXT record, so we can mirror the state into our tenant DB. This closes the loop for "Setup ARP Cloud" users.

Pre-shared key is rotated at Phase 9 launch; interim key is delivered out-of-band to the Headless primary contact.

---

## 8. Migration guide for Headless

If your in-flight v2 implementation:

- [x] Has "Setup ARP Local" + "Setup ARP Cloud" dashboard buttons
- [x] Prompts "sign in with Self.xyz" or similar for the principal DID
- [ ] Has no `arp.cloud` callback integration yet

Do these three edits in one PR on your side:

1. Replace the Self.xyz prompt in "Setup ARP Local" with the two-option chooser from §4. ~200 LOC of UI work; no backend change.
2. Replace the Self.xyz prompt in "Setup ARP Cloud" with the redirect-to-arp.cloud flow from §5. ~50 LOC, adds one callback handler `POST /api/v1/arp/domains/:sld/bind-principal`.
3. Exercise the ARP Cloud stub at `arp.cloud/internal/registrar/bind` end-to-end with a test domain.

That is the full migration. DNS orchestrator, well-known hoster, owner-subdomain hoster, handoff-bundle emitter, reserved-names enforcement, compliance plumbing, registrar API: **unchanged.**

---

## 9. Done-when checklist (Headless-side conformance)

- [ ] No user-facing mentions of "Self.xyz," "self.xyz," or Self.xyz branding in any ARP-related flow.
- [ ] "Setup ARP Local" button presents the two-option owner-binding UX from §4.
- [ ] "Setup ARP Cloud" button redirects to `arp.cloud/onboard?domain=<sld>&registrar=headless`.
- [ ] `_principal.<owner>.<domain>` TXT record publication accepts both `did:key:...` and `did:web:...` values.
- [ ] `POST /api/v1/arp/domains/:sld/bind-principal` endpoint exists and persists the principal DID, public key multibase, and representation JWT.
- [ ] `@kybernesis/arp-testkit audit <test-domain>` returns 8/8 green on the existing probe set (new probes gate at Phase 9).

Email the Headless lead when done; ARP core runs the audit and co-signs per `ARP-headless-parallel-build.md §5`.

---

*Amendment v2.1 — authored during ARP Phase 8.5 — 2026-04-24.*
