-- Phase 9c: DB-backed fixed-window rate limiter for public-ish routes.
--
-- Additive migration. Safe to apply on top of 0002_phase_9b_registrar_and_push.sql.
-- Every statement is idempotent so a partial replay is a no-op.
--
-- Per-bucket semantics are enforced by `bucket` uniqueness: the rate-limit
-- helper rotates the bucket string on each window boundary (e.g. `onboard:ip:
-- 1.2.3.4:2026-04-24T10:30` for a 1-minute window), so a collision on the
-- unique index is an intentional "same window, increment" signal and a
-- DO UPDATE SET hits = hits + 1 atomically bumps the counter.

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rate_limit_hits_bucket
  ON rate_limit_hits(bucket);
CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_window_end
  ON rate_limit_hits(window_end);
