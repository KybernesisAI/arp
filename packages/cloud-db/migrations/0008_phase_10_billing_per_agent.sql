-- Phase 10 billing: per-agent Stripe subscription quantity model.
--
-- One additive change:
--   tenants.subscription_quantity — mirrors the Stripe subscription
--   `quantity` for the per-agent line item. Pro tenants pay $5/mo per
--   unit; the cloud auto-syncs this on agent create/archive and on
--   `customer.subscription.updated` webhooks (in case the user edits
--   the count via the Stripe portal).
--
-- Free tenants always have subscription_quantity = 1 (one provisioned
-- agent, no subscription). Pro tenants default to 1 at checkout and
-- scale up as agents are created.
--
-- The unused `message_quota_cents` column (added in Phase-7, never
-- read) is intentionally left in place to keep the migration additive
-- and replay-safe on older runners.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants'
      AND column_name = 'subscription_quantity'
  ) THEN
    ALTER TABLE tenants
      ADD COLUMN subscription_quantity INTEGER NOT NULL DEFAULT 1;
  END IF;
END$$;
