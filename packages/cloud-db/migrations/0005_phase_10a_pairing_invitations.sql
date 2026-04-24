-- Phase 10a: browser-only URL-fragment pairing invitations on the cloud app.
--
-- Additive migration. Safe to apply on top of 0004_phase_9d_webauthn.sql.
-- Every statement is idempotent so a partial replay is a no-op.
--
-- A row is written by POST /api/pairing/invitations once the tenant's browser
-- client has already signed the PairingProposal with the principal did:key
-- private key (which never leaves the browser). The signed payload is
-- persisted so:
--   1. the issuing tenant can cancel the invitation before consumption;
--   2. GET /api/pairing/invitations can list pending invites for
--      dashboard rendering;
--   3. downstream audit can replay the proposal bytes.
--
-- The invitation URL shared out-of-band carries the signed payload ONLY in the
-- URL fragment (#<payload>) — the cloud server never sees it in an inbound
-- request because fragments are stripped by the browser before the HTTP
-- request. This row holds the payload for the issuer-side lifecycle only.

CREATE TABLE IF NOT EXISTS pairing_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  issuer_agent_did TEXT NOT NULL,
  requested_scopes JSONB NOT NULL,
  challenge TEXT NOT NULL,
  payload TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pairing_invitations_tenant
  ON pairing_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pairing_invitations_issuer_agent
  ON pairing_invitations(issuer_agent_did);
CREATE INDEX IF NOT EXISTS idx_pairing_invitations_expires
  ON pairing_invitations(expires_at)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;
