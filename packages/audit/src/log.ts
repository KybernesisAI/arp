import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hashJcs } from './canonical.js';
import {
  GENESIS_PREV_HASH,
  type AuditEntry,
  type AuditEntryInput,
  type VerifyResult,
} from './types.js';

/**
 * Serialise an entry for hashing. The `self_hash` field MUST be omitted —
 * `self_hash = sha256(JCS(entry minus self_hash))` (Phase 2 §4 Task 4).
 */
function entryForHash(entry: Omit<AuditEntry, 'self_hash'>) {
  return {
    seq: entry.seq,
    timestamp: entry.timestamp,
    msg_id: entry.msg_id,
    decision: entry.decision,
    policies_fired: entry.policies_fired,
    obligations: entry.obligations,
    spend_delta_cents: entry.spend_delta_cents,
    reason: entry.reason,
    prev_hash: entry.prev_hash,
  };
}

export interface AppendContext {
  seq: number;
  prev_hash: string;
}

export interface AuditLogOptions {
  /** Connection this log belongs to. Controls the file name. */
  connectionId: string;
  /** Directory that holds the audit log. Created if missing. */
  dir: string;
  /** Clock injection for tests. */
  now?: () => Date;
}

export interface AuditLog {
  /** Append a new entry; returns the full recorded entry (including seq + self_hash). */
  append(input: AuditEntryInput): AuditEntry;
  /** Re-read and verify the full chain. */
  verify(): VerifyResult;
  /** Path to the underlying JSONL file. */
  readonly path: string;
  /** Number of entries currently in the log (after any pending appends). */
  readonly size: number;
}

export function openAuditLog(opts: AuditLogOptions): AuditLog {
  mkdirSync(opts.dir, { recursive: true });
  const path = join(opts.dir, `${opts.connectionId}.jsonl`);
  const clock = opts.now ?? (() => new Date());

  const state = loadTailState(path);

  return {
    get path() {
      return path;
    },
    get size() {
      return state.seq;
    },
    append(input) {
      const base: Omit<AuditEntry, 'self_hash'> = {
        seq: state.seq,
        timestamp: input.timestamp ?? clock().toISOString(),
        msg_id: input.msg_id,
        decision: input.decision,
        policies_fired: [...input.policies_fired],
        obligations: input.obligations ?? [],
        spend_delta_cents: input.spend_delta_cents ?? 0,
        reason: input.reason ?? null,
        prev_hash: state.prev_hash,
      };
      const self_hash = hashJcs(entryForHash(base));
      const entry: AuditEntry = { ...base, self_hash };
      appendFileSync(path, `${JSON.stringify(entry)}\n`, 'utf8');
      state.seq += 1;
      state.prev_hash = self_hash;
      return entry;
    },
    verify() {
      return verifyFile(path);
    },
  };
}

interface TailState {
  seq: number;
  prev_hash: string;
}

function loadTailState(path: string): TailState {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    return { seq: 0, prev_hash: GENESIS_PREV_HASH };
  }
  const contents = readFileSync(path, 'utf8');
  if (!contents.trim()) {
    return { seq: 0, prev_hash: GENESIS_PREV_HASH };
  }
  const lines = contents.split('\n').filter((l) => l.length > 0);
  const last = lines[lines.length - 1];
  if (!last) return { seq: 0, prev_hash: GENESIS_PREV_HASH };
  try {
    const parsed = JSON.parse(last) as AuditEntry;
    return { seq: parsed.seq + 1, prev_hash: parsed.self_hash };
  } catch (err) {
    throw new Error(
      `failed to parse last audit entry in ${path}: ${(err as Error).message}`,
    );
  }
}

export function verifyFile(path: string): VerifyResult {
  if (!existsSync(path)) {
    return { valid: true, entriesSeen: 0 };
  }
  const contents = readFileSync(path, 'utf8');
  const lines = contents.split('\n').filter((l) => l.length > 0);
  let expectedPrev = GENESIS_PREV_HASH;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;
    let entry: AuditEntry;
    try {
      entry = JSON.parse(raw) as AuditEntry;
    } catch (err) {
      return {
        valid: false,
        entriesSeen: i,
        firstBreakAt: i,
        error: `parse error at line ${i}: ${(err as Error).message}`,
      };
    }
    if (entry.seq !== i) {
      return {
        valid: false,
        entriesSeen: i,
        firstBreakAt: i,
        error: `seq mismatch at line ${i}: got ${entry.seq}`,
      };
    }
    if (entry.prev_hash !== expectedPrev) {
      return {
        valid: false,
        entriesSeen: i,
        firstBreakAt: i,
        error: `prev_hash mismatch at seq ${entry.seq}`,
      };
    }
    const { self_hash, ...rest } = entry;
    const expected = hashJcs(entryForHash(rest));
    if (expected !== self_hash) {
      return {
        valid: false,
        entriesSeen: i,
        firstBreakAt: i,
        error: `self_hash mismatch at seq ${entry.seq}`,
      };
    }
    expectedPrev = self_hash;
  }
  return { valid: true, entriesSeen: lines.length };
}

/** Convenience alias matching Phase 2 §4 Task 4 signature. */
export function verifyAuditChain(path: string): VerifyResult {
  return verifyFile(path);
}
