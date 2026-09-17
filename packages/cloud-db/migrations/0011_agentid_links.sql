-- AgentID slice S3: identity links. One row per identity attached to a
-- .agent name (nostr key, Kybernesis control-plane handle, runtime endpoint,
-- web origin). `challenge` is the nonce the other side must embed in its
-- proof; `proof_json` records what verified the link. Verified links feed
-- the DID document (alsoKnownAs / service) and the NIP-05 document.
-- Additive + replay-safe.

CREATE TABLE IF NOT EXISTS agent_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  agent_did TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT,
  challenge TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  proof_json JSONB,
  verified_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_links_kind_check CHECK (kind = ANY (ARRAY['nostr'::text, 'kybernesis'::text, 'runtime'::text, 'web'::text])),
  CONSTRAINT agent_links_status_check CHECK (status = ANY (ARRAY['pending'::text, 'verified'::text, 'revoked'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_links_agent_kind_value
  ON agent_links (agent_did, kind, value);

CREATE INDEX IF NOT EXISTS idx_agent_links_tenant ON agent_links (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_links_agent ON agent_links (agent_did);
