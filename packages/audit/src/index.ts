/**
 * @kybernesis/arp-audit — append-only hash-chained audit log.
 *
 * Writes one JSON-Lines file per connection under `<dir>/<connection_id>.jsonl`.
 * Each entry carries `seq`, `prev_hash`, and `self_hash` so the full chain is
 * tamper-evident. `self_hash = sha256(JCS(entry minus self_hash))`; genesis
 * `prev_hash` is 32 zero bytes prefixed `sha256:`.
 */

export {
  openAuditLog,
  verifyAuditChain,
  verifyFile,
  type AuditLog,
  type AuditLogOptions,
} from './log.js';
export {
  type AuditEntry,
  type AuditEntryInput,
  type AuditDecision,
  type VerifyResult,
  HASH_PREFIX,
  GENESIS_PREV_HASH,
} from './types.js';
export { hashJcs, jcsCanonical } from './canonical.js';
