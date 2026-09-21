-- Device links (owner account, S6d): move the account key from a device that
-- has it to a device that is signed in without it. The new device posts an
-- ephemeral public key under a 6-digit code; the device with the key claims
-- the code and posts the key encrypted to that public key. The server only
-- ever stores ciphertext. Single use, 10 minutes.
CREATE TABLE IF NOT EXISTS device_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code_hash TEXT NOT NULL,
  receiver_pub TEXT NOT NULL,
  ciphertext TEXT,
  iv TEXT,
  sender_pub TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_links_tenant ON device_links (tenant_id, created_at DESC);
