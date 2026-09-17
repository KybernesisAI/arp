-- AgentID slice S2 (registrar-in-console): domain registrations + identity
-- vs runtime state on the agents row.
--
-- 1. domain_registrations — one row per .agent name a tenant buys through the
--    console. Tracks the Stripe checkout → Headless registration → owner
--    binding lifecycle. `stripe_checkout_session_id` is unique so the
--    fulfilment webhook is idempotent even if `stripe_events` dedup misses.
--
-- 2. agents gains four columns so an identity can exist with no runtime:
--      key_custody             'cloud' (we hold the sealed private key)
--                              | 'exported' (owner downloaded it; we hold none)
--      private_key_enc         sealed Ed25519 seed, `v1:<iv>:<tag>:<ct>`
--                              (base64url parts), NULL when exported
--      runtime_kind            'none' | 'bridge' | 'push'
--      domain_registration_id  FK to the purchase that minted the identity
--
-- Existing rows (all minted via provision-cloud, key handed to the owner)
-- default to key_custody='exported', runtime_kind='bridge'.
--
-- Additive + replay-safe.

CREATE TABLE IF NOT EXISTS domain_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  domain TEXT NOT NULL,
  sld TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  years INTEGER NOT NULL DEFAULT 1,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  headless_domain_id TEXT,
  headless_order_id TEXT,
  registered_at TIMESTAMPTZ,
  expiry_at TIMESTAMPTZ,
  grace_ends_at TIMESTAMPTZ,
  owner_label TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT domain_registrations_status_check CHECK (
    status = ANY (ARRAY[
      'pending_payment'::text,
      'registering'::text,
      'registered'::text,
      'owner_pending'::text,
      'active'::text,
      'failed'::text,
      'expired'::text
    ])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS domain_registrations_checkout_session
  ON domain_registrations (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_domain_registrations_tenant
  ON domain_registrations (tenant_id);

CREATE INDEX IF NOT EXISTS idx_domain_registrations_domain
  ON domain_registrations (domain);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'key_custody'
  ) THEN
    ALTER TABLE agents ADD COLUMN key_custody TEXT NOT NULL DEFAULT 'exported';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'private_key_enc'
  ) THEN
    ALTER TABLE agents ADD COLUMN private_key_enc TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'runtime_kind'
  ) THEN
    ALTER TABLE agents ADD COLUMN runtime_kind TEXT NOT NULL DEFAULT 'bridge';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'domain_registration_id'
  ) THEN
    ALTER TABLE agents ADD COLUMN domain_registration_id UUID;
  END IF;
END$$;

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_key_custody_check;
ALTER TABLE agents ADD CONSTRAINT agents_key_custody_check
  CHECK (key_custody = ANY (ARRAY['cloud'::text, 'exported'::text]));

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_runtime_kind_check;
ALTER TABLE agents ADD CONSTRAINT agents_runtime_kind_check
  CHECK (runtime_kind = ANY (ARRAY['none'::text, 'bridge'::text, 'push'::text]));
