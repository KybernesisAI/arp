-- Billing, lander model (2026-09-29): a name is a yearly Stripe subscription
-- that auto-renews; Connect is a monthly subscription per account. The old
-- free/pro-per-agent model is retired (tenants.plan stays for 'internal').
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='domain_registrations' AND column_name='stripe_subscription_id') THEN
    ALTER TABLE domain_registrations ADD COLUMN stripe_subscription_id TEXT;
    ALTER TABLE domain_registrations ADD COLUMN auto_renew BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE domain_registrations ADD COLUMN current_period_end TIMESTAMPTZ;
    ALTER TABLE domain_registrations ADD COLUMN upstream_renewal_status TEXT NOT NULL DEFAULT 'none';
    ALTER TABLE domain_registrations ADD COLUMN last_reminder_days INTEGER;
    CREATE INDEX IF NOT EXISTS idx_domain_registrations_subscription ON domain_registrations (stripe_subscription_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='connect_status') THEN
    ALTER TABLE tenants ADD COLUMN connect_status TEXT NOT NULL DEFAULT 'none';
    ALTER TABLE tenants ADD COLUMN connect_subscription_id TEXT;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  to_email TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_log_kind_ref ON email_log (kind, ref);
