/**
 * SQLite DDL applied on registry open. Matches `ARP-phase-2-runtime-core.md`
 * §4 Task 3.1 exactly — columns, constraints, and indexes are normative.
 */

export const REGISTRY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS connections (
  connection_id TEXT PRIMARY KEY,
  label TEXT,
  self_did TEXT NOT NULL,
  peer_did TEXT NOT NULL,
  purpose TEXT,
  token_jws TEXT NOT NULL,
  cedar_policies_json TEXT NOT NULL,
  status TEXT CHECK (status IN ('active','suspended','revoked')) DEFAULT 'active',
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  last_message_at INTEGER,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS connection_spend (
  connection_id TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  amount_usd_cents INTEGER NOT NULL,
  PRIMARY KEY (connection_id, window_start)
);

CREATE TABLE IF NOT EXISTS revocations (
  type TEXT NOT NULL,
  id TEXT NOT NULL,
  revoked_at INTEGER NOT NULL,
  reason TEXT,
  PRIMARY KEY (type, id)
);

CREATE INDEX IF NOT EXISTS idx_conn_peer ON connections(peer_did);
CREATE INDEX IF NOT EXISTS idx_conn_status ON connections(status);
`;
