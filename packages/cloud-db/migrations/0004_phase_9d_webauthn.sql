-- Phase 9d: WebAuthn / passkey authenticator + HKDF-v2 identity rotation.
--
-- Additive migration. Safe to apply on top of 0003_phase_9c_rate_limits.sql.
-- Every statement is idempotent so a partial replay is a no-op.
--
-- Two concerns in a single file because they share a release boundary:
--
--   1. WebAuthn passkey authenticator (user_credentials + webauthn_challenges).
--      Passkey is the *authenticator*; the principal DID stays did:key. The
--      credential id + public key are stored server-side so passkey sign-in
--      issues a session under the same principal.
--
--   2. HKDF-v2 identity rotation (tenants.principal_did_previous +
--      tenants.v1_deprecated_at). A user-initiated flow rotates the principal
--      did:key from the v1 entropy-padded seed to an HKDF-SHA256-derived v2
--      seed. The previous DID is retained for a 90-day grace window so old
--      audit-log signatures (signed by the v1 key) still verify.

-- -------------------------------------------------------- user_credentials
-- Tenant-scoped passkey credentials. A single tenant may register multiple
-- passkeys (one per device / platform authenticator). credential_id is the
-- WebAuthn assertion id (base64url of the raw credential id) and is globally
-- unique across all tenants — a single unique index serves as the lookup
-- key during pre-session authentication flows.
CREATE TABLE IF NOT EXISTS user_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT '{}',
  nickname TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS user_credentials_credential_id
  ON user_credentials(credential_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_tenant
  ON user_credentials(tenant_id);

-- -------------------------------------------------------- webauthn_challenges
-- Short-lived (60s TTL) challenges issued by /api/webauthn/*/options routes.
-- `tenant_id` is nullable because pre-session authentication issues a
-- challenge before the caller has a session. `purpose` distinguishes
-- registration challenges (require a live session) from auth challenges
-- (pre-session discoverable-credential flow). Rows are consumed exactly once
-- and swept opportunistically; no cron dependency.
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'auth')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires
  ON webauthn_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_challenge
  ON webauthn_challenges(challenge);

-- ------------------------------------------------------- tenants HKDF columns
-- Rotation state. `principal_did` always points at the *current* DID; after a
-- v1 → v2 rotation, `principal_did_previous` holds the old did:key and
-- `v1_deprecated_at` stamps when the grace window started. The GET
-- /u/<uuid>/did.json route dual-publishes both verification methods until
-- v1_deprecated_at + 90 days has elapsed, after which the column clears on
-- next read (fire-and-forget).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS principal_did_previous TEXT,
  ADD COLUMN IF NOT EXISTS v1_deprecated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenants_principal_did_previous
  ON tenants(principal_did_previous)
  WHERE principal_did_previous IS NOT NULL;
