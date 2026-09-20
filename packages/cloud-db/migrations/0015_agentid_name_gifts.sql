-- AgentID: give a name to someone else ("gift a name").
--
-- name_gifts: one row per gift link an owner creates for a name they hold.
-- The link carries an unguessable token in the URL fragment; only its SHA-256
-- is stored. When the recipient (signed in) accepts, the registration moves to
-- their account, the giver's identity for the name is retired, and a fresh
-- identity is minted for the recipient. The name stays on our registrar
-- account throughout, so nothing upstream changes. Additive + replay-safe.

CREATE TABLE IF NOT EXISTS name_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL,
  domain TEXT NOT NULL,
  from_tenant_id UUID NOT NULL,
  to_tenant_id UUID,
  token_hash TEXT NOT NULL UNIQUE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_name_gifts_domain ON name_gifts (domain);
CREATE INDEX IF NOT EXISTS idx_name_gifts_from_tenant ON name_gifts (from_tenant_id);
