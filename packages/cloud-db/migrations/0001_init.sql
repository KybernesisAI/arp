-- ARP Cloud multi-tenant schema (Phase 7).
--
-- Every runtime table is keyed by `tenant_id` or `agent_did` (indirectly via
-- the agents table). Tenant context is enforced in application code via the
-- branded `TenantDb` type exported from `@kybernesis/arp-cloud-db`. Queries
-- without a tenant scope are unrepresentable at compile time.
--
-- PostgreSQL 14+. Runs idempotently: every statement is guarded.
-- `gen_random_uuid()` is in core since PG 13; no `pgcrypto` extension needed.

-- ------------------------------------------------------------------- tenants
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_did TEXT UNIQUE NOT NULL,
  display_name TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
  message_quota_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_principal_did ON tenants(principal_did);
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer ON tenants(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- -------------------------------------------------------------------- agents
CREATE TABLE IF NOT EXISTS agents (
  did TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  principal_did TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  agent_description TEXT NOT NULL DEFAULT '',
  public_key_multibase TEXT NOT NULL,
  handoff_json JSONB NOT NULL,
  well_known_did JSONB NOT NULL,
  well_known_agent_card JSONB NOT NULL,
  well_known_arp JSONB NOT NULL,
  scope_catalog_version TEXT NOT NULL DEFAULT 'v1',
  tls_fingerprint TEXT NOT NULL DEFAULT 'cloud-hosted',
  ws_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agents_ws_session ON agents(ws_session_id)
  WHERE ws_session_id IS NOT NULL;

-- --------------------------------------------------------------- connections
CREATE TABLE IF NOT EXISTS connections (
  connection_id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_did TEXT NOT NULL REFERENCES agents(did) ON DELETE CASCADE,
  peer_did TEXT NOT NULL,
  label TEXT,
  purpose TEXT,
  token_jws TEXT NOT NULL,
  token_json JSONB NOT NULL,
  cedar_policies JSONB NOT NULL,
  obligations JSONB NOT NULL DEFAULT '[]'::jsonb,
  scope_catalog_version TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
  revoke_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_connections_tenant ON connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_connections_agent ON connections(agent_did);
CREATE INDEX IF NOT EXISTS idx_connections_peer ON connections(peer_did);

-- ----------------------------------------------------------------- messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_did TEXT NOT NULL REFERENCES agents(did) ON DELETE CASCADE,
  connection_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  msg_id TEXT NOT NULL,
  msg_type TEXT NOT NULL,
  envelope_jws TEXT NOT NULL,
  body JSONB,
  peer_did TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'delivered', 'expired', 'failed')),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_messages_agent_queued ON messages(agent_did, created_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_msg_id ON messages(agent_did, msg_id);

-- ------------------------------------------------------------- audit entries
CREATE TABLE IF NOT EXISTS audit_entries (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_did TEXT NOT NULL REFERENCES agents(did) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  seq BIGINT NOT NULL,
  msg_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny')),
  obligations JSONB NOT NULL DEFAULT '[]'::jsonb,
  policies_fired JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT,
  spend_delta_cents INTEGER NOT NULL DEFAULT 0,
  prev_hash TEXT NOT NULL,
  self_hash TEXT NOT NULL,
  CONSTRAINT uniq_audit_agent_conn_seq UNIQUE (agent_did, connection_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_agent_conn ON audit_entries(agent_did, connection_id, seq);

-- ----------------------------------------------------------------- revocations
CREATE TABLE IF NOT EXISTS revocations (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_did TEXT NOT NULL REFERENCES agents(did) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('connection', 'key')),
  subject_id TEXT NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT,
  PRIMARY KEY (agent_did, kind, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_revocations_tenant ON revocations(tenant_id);

-- --------------------------------------------------------------- usage_meter
CREATE TABLE IF NOT EXISTS usage_counters (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  inbound_messages INTEGER NOT NULL DEFAULT 0,
  outbound_messages INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, period)
);

-- ------------------------------------------------------- stripe_webhook_log
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------- principal_sessions
CREATE TABLE IF NOT EXISTS principal_sessions (
  session_id TEXT PRIMARY KEY,
  principal_did TEXT NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_principal ON principal_sessions(principal_did);
