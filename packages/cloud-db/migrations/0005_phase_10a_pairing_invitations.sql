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

-- -------------------------------------------------------- connections PK swap
--
-- Phase-10a adds dual-tenant insert in POST /api/pairing/accept: when both
-- sides of a pairing are cloud tenants, each gets their own `connections` row
-- so either principal can see + revoke the connection from their dashboard.
--
-- The 0001 schema made `connection_id` the sole primary key. That worked
-- fine when connections were minted once per cloud (via admin bootstrap) but
-- blocks the dual-insert path. Swap to `(tenant_id, connection_id)` which is
-- the correct multi-tenant shape. Tenant-isolation predicates already read
-- both columns in every query (`TenantDb.getConnection` etc.) so no call-site
-- change is required.
--
-- Idempotent via DO-block: if the PK is already composite (e.g. the dev DB
-- was rebuilt from 0001 after this migration landed) we skip the swap.
DO $$
DECLARE
  existing_pk_columns INTEGER;
BEGIN
  SELECT COUNT(*) INTO existing_pk_columns
  FROM information_schema.key_column_usage
  WHERE table_name = 'connections'
    AND constraint_name = 'connections_pkey';
  IF existing_pk_columns = 1 THEN
    ALTER TABLE connections DROP CONSTRAINT connections_pkey;
    ALTER TABLE connections ADD PRIMARY KEY (tenant_id, connection_id);
  END IF;
END$$;

-- Non-unique lookup index keeps cross-tenant administrative queries that key
-- on connection_id fast. We intentionally do NOT re-add a single-column
-- uniqueness here — the same connection_id is expected to appear twice
-- (once per tenant) once dual-tenant insert is in effect.
CREATE INDEX IF NOT EXISTS idx_connections_connection_id
  ON connections(connection_id);
