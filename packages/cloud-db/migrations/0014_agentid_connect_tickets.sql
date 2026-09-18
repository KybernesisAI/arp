-- AgentID slice S6a: zero-code connect.
--
-- agent_connect_tickets: one row per "Connect your agent" click. The console
-- creates it (owner session), hands the id to the gateway, and the gateway
-- signs a short-lived connect token for the runtime, verifies the identity
-- document, and records the outcome. The unguessable id is the console →
-- gateway authorization (shared database, no new secret). Single use.
-- Additive + replay-safe.

CREATE TABLE IF NOT EXISTS agent_connect_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  agent_did TEXT NOT NULL,
  url TEXT NOT NULL,
  link_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_connect_tickets_agent ON agent_connect_tickets (agent_did);
