-- Phase 9b: v2.1 TLD registrar integration + mobile push registration.
--
-- Additive migration. Safe to apply on top of 0001_init.sql. Every statement
-- is idempotent so a partial replay is a no-op. No alters, no drops.

-- -------------------------------------------------------- registrar_bindings
-- Populated by POST /internal/registrar/bind (PSK-gated). `tenant_id` is
-- nullable because the registrar callback may arrive before the user has
-- completed the /onboard flow; it is reconciled on next login.
CREATE TABLE IF NOT EXISTS registrar_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  domain TEXT NOT NULL,
  owner_label TEXT NOT NULL,
  registrar TEXT NOT NULL,
  principal_did TEXT NOT NULL,
  public_key_multibase TEXT NOT NULL,
  representation_jwt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS registrar_bindings_domain_owner
  ON registrar_bindings(domain, owner_label);
CREATE INDEX IF NOT EXISTS idx_registrar_bindings_tenant
  ON registrar_bindings(tenant_id)
  WHERE tenant_id IS NOT NULL;

-- -------------------------------------------------------- onboarding_sessions
-- Short-lived record of a /onboard entry-point visit; 1h TTL. Lets the
-- cloud reconcile a tab-closed mid-flow onboarding with the next login.
CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  registrar TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  principal_did TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_expires
  ON onboarding_sessions(expires_at);

-- -------------------------------------------------------- push_registrations
-- Mobile APNs / FCM device token registry. Tenant-scoped; upsert on
-- (tenant_id, device_token) via the PK-less unique index below.
CREATE TABLE IF NOT EXISTS push_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  bundle_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_registrations_tenant_token
  ON push_registrations(tenant_id, device_token);
CREATE INDEX IF NOT EXISTS idx_push_registrations_tenant
  ON push_registrations(tenant_id);
