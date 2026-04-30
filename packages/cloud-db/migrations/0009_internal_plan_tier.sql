-- Phase 10c: add the `internal` plan tier.
--
-- Internal tenants are unlimited on every dimension (no agent cap, no
-- inbound message cap, $0 bill). Used for the ARP team's own master
-- accounts, integration test fixtures, and explicitly-comped design
-- partners. Never granted automatically; the row is set manually via
-- DB or a future admin UI.
--
-- The check constraint already lists 'free', 'pro', 'team' (where
-- 'team' was the v0 tier collapsed into 'pro' but kept in the
-- constraint for replay safety). Add 'internal' alongside.
--
-- Idempotent: drops + re-adds the constraint with the wider set, so
-- replay-safe on tenants tables that already include 'internal' from
-- the manual session-DB hack we did during Phase 10c testing.

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;

ALTER TABLE tenants ADD CONSTRAINT tenants_plan_check
  CHECK (plan = ANY (ARRAY['free'::text, 'pro'::text, 'team'::text, 'internal'::text]));
