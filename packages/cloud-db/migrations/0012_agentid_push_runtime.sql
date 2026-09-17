-- AgentID slice S4: push delivery + agent credentials.
--
-- agents.push_url / push_kind: where ARP Cloud delivers inbound messages when
-- runtime_kind = 'push' (no WebSocket session). `eve` targets the Eve session
-- API at <push_url>/eve/v1/session; `generic` posts {prompt, peerDid, thid,
-- connectionId} to <push_url>.
--
-- agent_credentials: long-lived bearer tokens an attached runtime uses to
-- call the gateway's agent-API (list connections, send). Only the SHA-256
-- hash is stored; the token is shown once at attach time.
-- Additive + replay-safe.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'push_url') THEN
    ALTER TABLE agents ADD COLUMN push_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'push_kind') THEN
    ALTER TABLE agents ADD COLUMN push_kind TEXT;
  END IF;
END$$;

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_push_kind_check;
ALTER TABLE agents ADD CONSTRAINT agents_push_kind_check
  CHECK (push_kind IS NULL OR push_kind = ANY (ARRAY['eve'::text, 'generic'::text]));

CREATE TABLE IF NOT EXISTS agent_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  agent_did TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_credentials_token_hash ON agent_credentials (token_hash);
CREATE INDEX IF NOT EXISTS idx_agent_credentials_agent ON agent_credentials (agent_did);
CREATE INDEX IF NOT EXISTS idx_agent_credentials_tenant ON agent_credentials (tenant_id);
