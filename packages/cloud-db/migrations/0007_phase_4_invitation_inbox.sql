-- Phase 4 follow-up: surface incoming pairing requests on the audience-side
-- dashboard, mark invitations consumed when accepted, and let the audience
-- deny invitations addressed to one of their agents.
--
-- Three additive changes:
--   1. pairing_invitations.audience_did — the proposal's `audience` field
--      hoisted to a top-level column so the audience tenant can list
--      "incoming" pending requests by querying for invitations whose
--      audience matches one of their agents (cross-tenant query, predicate
--      enforced by the API layer to require the caller owns the agent).
--      Backfilled from the b64-url payload for any pre-existing rows.
--   2. audit_entries.decision check widening — Phase 4 added 'suspend',
--      'resume', and 'rescope' decision values for the per-pair connection
--      lifecycle endpoints. The 0006 widening only covered 'revoke'.
--   3. Index on audience_did for the inbox query path (filtered to
--      pending rows so it stays small).
--
-- All steps idempotent; safe to replay on top of 0006.

-- 1. audience_did column + backfill + NOT NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pairing_invitations'
      AND column_name = 'audience_did'
  ) THEN
    ALTER TABLE pairing_invitations ADD COLUMN audience_did TEXT;
  END IF;
END$$;

-- Backfill from payload (base64url-encoded JSON of the signed proposal).
-- Postgres has no native b64url so we translate _ → /, - → + and add
-- padding before decode_base64. JSON path extracts the `audience` field.
UPDATE pairing_invitations
SET audience_did = (
  convert_from(
    decode(
      rpad(
        translate(payload, '-_', '+/'),
        ((length(payload) + 3) / 4) * 4,
        '='
      ),
      'base64'
    ),
    'UTF8'
  )::jsonb ->> 'audience'
)
WHERE audience_did IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pairing_invitations'
      AND column_name = 'audience_did'
      AND is_nullable = 'YES'
  ) THEN
    -- Only NOT-NULL the column once every row has a value (defensive: if
    -- somehow the backfill missed a row, leave it nullable — better than
    -- a failed migration).
    IF NOT EXISTS (
      SELECT 1 FROM pairing_invitations WHERE audience_did IS NULL
    ) THEN
      ALTER TABLE pairing_invitations ALTER COLUMN audience_did SET NOT NULL;
    END IF;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_pairing_invitations_audience
  ON pairing_invitations(audience_did)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;

-- 2. Widen audit_entries.decision constraint to include the Phase 4
-- per-pair lifecycle decisions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.check_constraints
    WHERE constraint_name = 'audit_entries_decision_check'
  ) THEN
    ALTER TABLE audit_entries DROP CONSTRAINT audit_entries_decision_check;
  END IF;
  ALTER TABLE audit_entries
    ADD CONSTRAINT audit_entries_decision_check
    CHECK (decision IN ('allow', 'deny', 'revoke', 'suspend', 'resume', 'rescope'));
END$$;
