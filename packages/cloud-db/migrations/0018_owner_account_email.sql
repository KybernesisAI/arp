-- Owner account: an email address as the everyday sign-in, next to the key.
--
-- tenants.email: the owner's verified address (unique across tenants).
-- login_codes: one-time 6-digit codes sent by email, hashed at rest, single
-- use, short-lived; used both to verify a new address and to sign in on a
-- device that does not hold the key. Additive + replay-safe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'email') THEN
    ALTER TABLE tenants ADD COLUMN email TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS tenants_email_unique ON tenants (lower(email));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'email_verified_at') THEN
    ALTER TABLE tenants ADD COLUMN email_verified_at TIMESTAMPTZ;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS login_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'sign_in',
  tenant_id UUID,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_codes_email ON login_codes (lower(email), created_at DESC);
