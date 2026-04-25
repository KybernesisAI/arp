# Phase 10 slice 10d — owner-app WebAuthn on a VPS

**Audience:** anyone running the sidecar on a VPS (rather than localhost).
The default Phase-10/10d WebAuthn config assumes `rpId=localhost` which
matches the `docker run -p 7878:7878` flow Ian uses for development. On a
real host you have to pin the rpId + origins to the served domain or
WebAuthn registration will fail (origin mismatch).

## Conservative call (slice 10d)

Slice 10d ships passkey support tested only against `localhost` (browsers
treat `localhost` HTTP as a secure context, so WebAuthn works without a
TLS cert). The non-localhost path is fully implemented but not
end-to-end verified — listed as a deferred conservative call.

## Required env vars when serving from a real domain

```bash
# Public hostname the user reaches the owner-app at.
WEBAUTHN_RP_ID=owner.samantha.agent

# Friendly name shown in the platform authenticator prompt.
WEBAUTHN_RP_NAME="Samantha Owner App"

# Comma-separated allowed origins. Must match exactly — protocol + host +
# port — what the browser sends as `Origin:` during a WebAuthn ceremony.
WEBAUTHN_ORIGINS=https://owner.samantha.agent
```

## TLS requirement

Browsers refuse WebAuthn on plain HTTP except for `localhost`. So the
non-localhost path must be served behind TLS. Two viable shapes:

1. **Sidecar TLS terminator.** The sidecar already serves
   `/.well-known/did.json` over its DID-pinned TLS cert; same listener
   handles `/owner/*` once the owner-app is wired in. RP ID = the
   serving hostname.
2. **Reverse proxy (Caddy / Cloudflare Tunnel / Tailscale Funnel).** The
   proxy terminates TLS and forwards to the sidecar over plain HTTP.
   `WEBAUTHN_ORIGINS` must list the public origin the user types in,
   not the loopback origin.

## Cross-device passkey sync

Whatever the OS provides — iCloud Keychain, Google Password Manager,
1Password, Bitwarden — handles synchronisation transparently. The user
registers a passkey on Device A; signing in on Device B uses the same
credential (the platform authenticator hands the assertion back over the
same `rpId`). No code change required on our end.

## Known gaps

- **Multi-RP configurations** (e.g. `owner.samantha.agent` AND
  `owner.atlas.agent` served by the same sidecar) aren't supported in
  v0. Each sidecar binds a single rpId at boot.
- **WebAuthn challenge TTL** is hard-coded to 60s in `auth-store.ts`.
  Tighten/relax via the env var if a real-world deployment needs it.
- **No attestation enforcement.** We accept `attestationType: 'none'`
  to reduce friction. If a deployment requires hardware-only attestors,
  flip to `direct` and validate the AAGUID — out of scope for slice 10d.
