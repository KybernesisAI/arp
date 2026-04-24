-- Phase 10b: cloud-side revocation emits an audit entry with decision='revoke'
-- so the UI can distinguish revocation events from ordinary allow/deny policy
-- outcomes in the per-connection audit log viewer.
--
-- The 0001 schema constrained decision to ('allow', 'deny'). Widen to include
-- 'revoke' so POST /api/connections/:id/revoke can append a chained audit
-- entry without tripping the check constraint. The hash chain itself is
-- unaffected: the decision value is hashed as-is via JCS + SHA-256, so
-- pre-existing rows continue to verify. This is a pure input-validation
-- widening.
--
-- Additive + idempotent. Safe to replay on any database already on 0005.

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
    CHECK (decision IN ('allow', 'deny', 'revoke'));
END$$;
