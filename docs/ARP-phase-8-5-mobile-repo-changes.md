# Phase 8.5 — Mobile Repo Handoff Note

**Target repo:** `github.com/KybernesisAI/arp-mobile` (private, separate from the monorepo).
**Scope:** docs-only updates to align the mobile scaffold with Phase 8.5's auth/identity shift. The scaffold ships no end-user functionality yet; these edits are to prevent stale guidance from propagating to Phase 10 (public mobile launch).

## Changes to make in `arp-mobile`

1. **Remove Self.xyz from install docs.** If `README.md` or `docs/setup.md` mentions `@selfxyz/mobile-sdk`, Self.xyz developer access, Self.xyz Expo config plugins, or EAS Development Builds specifically for Self.xyz — delete those lines. The reference implementation does not use Self.xyz.

2. **Update identity narrative.** Any doc prose that says the mobile app will "sign in with Self.xyz" or "prove identity with Self.xyz" — replace with:
   > The mobile app uses a `did:key` Ed25519 keypair held in the device's secure enclave (iOS Keychain Services, Android Keystore). Biometric unlock gates key usage. This mirrors the web apps' browser-held-key approach.

3. **Swap example DIDs.** In any example JSON (DID documents, handoff bundles, Connection Tokens), replace `did:web:ian.self.xyz` with `did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp` (the illustrative fixture).

4. **Dependency list.** If `package.json` lists `@selfxyz/*` packages, remove them. Leave the `@noble/ed25519` dep (used for key generation).

5. **Roadmap note.** If there's a roadmap / TODO file listing Self.xyz integration as Phase 10 scope — remove it. Add instead: "Passkey / WebAuthn integration (biometric-gated, iOS + Android keystore-backed)."

## What NOT to change

- Do NOT delete the app scaffold or any RN/Expo infrastructure.
- Do NOT change `app.json` or `expo.json` entitlements.
- Do NOT rewrite the navigation / screen structure.
- This is a narrative-only update. No code changes.

## Reference docs

- `ARP-phase-8-5-auth-identity-shift.md` (monorepo) — the full phase brief.
- `ARP-tld-integration-spec-v2.1.md` (monorepo) — Headless-facing amendment.

## Verification

After edits:
```bash
grep -rn -i "self\.xyz\|selfxyz\|self_xyz" . 2>/dev/null | grep -v node_modules
```

Expected: empty, or only matches in `CHANGELOG.md` if you log the removal there.

---

*Hand-off note authored 2026-04-24. Execute in a fresh Claude Code session targeting the mobile repo.*
