/**
 * Postgres-backed audit writer.
 *
 * Mirrors the JCS+SHA-256 hash chain from @kybernesis/arp-audit but writes
 * each entry as a row in `audit_entries` (scoped to tenant + agent_did +
 * connection_id). `listAudit` → `verifyChain` roundtrips produce the same
 * VerifyResult the agent-local JSONL audit emits.
 */

import canonicalizeFn from 'canonicalize';
import { createHash } from 'node:crypto';
import type { Obligation } from '@kybernesis/arp-spec';
import {
  HASH_PREFIX,
  GENESIS_PREV_HASH,
  type AuditEntry,
  type AuditDecision,
} from '@kybernesis/arp-audit';
import type { AuditEntryRow, TenantDb } from '@kybernesis/arp-cloud-db';
import type { CloudRuntimeLogger } from './types.js';

const canonicalize = canonicalizeFn as (value: unknown) => string;

function hashJcs(value: unknown): string {
  const canonical = canonicalize(value);
  const hex = createHash('sha256').update(canonical).digest('hex');
  return `${HASH_PREFIX}${hex}`;
}

export interface PostgresAuditInput {
  agentDid: string;
  connectionId: string;
  msgId: string;
  decision: AuditDecision;
  obligations?: Obligation[];
  policiesFired: string[];
  reason?: string;
  spendDeltaCents?: number;
  timestamp?: string;
}

export interface PostgresAudit {
  append(input: PostgresAuditInput): Promise<AuditEntry>;
  list(agentDid: string, connectionId: string, opts?: { limit?: number; offset?: number }): Promise<AuditEntry[]>;
  count(agentDid: string, connectionId: string): Promise<number>;
  verify(agentDid: string, connectionId: string): Promise<{ valid: boolean; entriesSeen: number; firstBreakAt?: number; error?: string }>;
}

export function createPostgresAudit(params: {
  tenantDb: TenantDb;
  logger?: CloudRuntimeLogger;
  now?: () => Date;
}): PostgresAudit {
  const now = params.now ?? (() => new Date());
  const db = params.tenantDb;
  const log = params.logger;

  function rowToEntry(row: AuditEntryRow): AuditEntry {
    return {
      seq: row.seq,
      timestamp: row.timestamp.toISOString(),
      msg_id: row.msgId,
      decision: row.decision as AuditDecision,
      policies_fired: (row.policiesFired as string[]) ?? [],
      obligations: (row.obligations as Obligation[]) ?? [],
      spend_delta_cents: row.spendDeltaCents,
      reason: row.reason,
      prev_hash: row.prevHash,
      self_hash: row.selfHash,
    };
  }

  return {
    async append(input) {
      // Concurrent dispatches racing the same (agent, connection) pair
      // both read latest seq=N, both try to insert seq=N+1, second insert
      // hits uniq_audit_agent_conn_seq → 500. Retry on unique conflict;
      // each retry re-reads latest so we converge to a fresh seq. Cap
      // retries to bound worst-case under sustained load (the ping-pong
      // case generated hundreds of concurrent inserts).
      const MAX_RETRIES = 8;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const latest = await db.latestAudit(input.agentDid, input.connectionId);
        const seq = latest ? latest.seq + 1 : 0;
        const prevHash = latest ? latest.selfHash : GENESIS_PREV_HASH;
        const timestamp = input.timestamp ?? now().toISOString();
        const obligations = input.obligations ?? [];
        const policiesFired = [...input.policiesFired];
        const spend = input.spendDeltaCents ?? 0;
        const reason = input.reason ?? null;

        const base = {
          seq,
          timestamp,
          msg_id: input.msgId,
          decision: input.decision,
          policies_fired: policiesFired,
          obligations,
          spend_delta_cents: spend,
          reason,
          prev_hash: prevHash,
        };
        const selfHash = hashJcs(base);

        try {
          await db.appendAudit(
            input.agentDid,
            {
              connectionId: input.connectionId,
              msgId: input.msgId,
              decision: input.decision,
              obligations,
              policiesFired,
              timestamp,
              ...(reason !== null ? { reason } : {}),
              spendDeltaCents: spend,
            },
            { prevHash, selfHash, seq },
          );
          log?.debug(
            { agentDid: input.agentDid, connectionId: input.connectionId, seq, decision: input.decision, attempt },
            'audit append',
          );
          return { ...base, self_hash: selfHash };
        } catch (err) {
          const msg = (err as Error).message ?? '';
          // Postgres unique violation surfaces with code 23505; the
          // serverless drivers tend to leak the constraint name in the
          // message. Match either signal to be driver-agnostic.
          const isSeqRace =
            msg.includes('uniq_audit_agent_conn_seq') ||
            msg.includes('duplicate key') ||
            (err as { code?: string }).code === '23505';
          if (!isSeqRace || attempt === MAX_RETRIES - 1) {
            throw err;
          }
          lastErr = err;
          // Tiny jittered backoff so racers don't lockstep.
          await new Promise((r) => setTimeout(r, Math.random() * 25));
        }
      }
      throw lastErr ?? new Error('audit append: exhausted retries');
    },
    async list(agentDid, connectionId, opts) {
      const rows = await db.listAudit(agentDid, connectionId, opts ?? {});
      return rows.map(rowToEntry);
    },
    async count(agentDid, connectionId) {
      return db.countAudit(agentDid, connectionId);
    },
    async verify(agentDid, connectionId) {
      // Fetch all entries ascending.
      const rows = await db.listAudit(agentDid, connectionId, { limit: 100000 });
      rows.sort((a, b) => a.seq - b.seq);
      let expectedPrev = GENESIS_PREV_HASH;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const entry = rowToEntry(row);
        if (entry.seq !== i) {
          return { valid: false, entriesSeen: i, firstBreakAt: i, error: `seq mismatch at line ${i}` };
        }
        if (entry.prev_hash !== expectedPrev) {
          return { valid: false, entriesSeen: i, firstBreakAt: i, error: `prev_hash mismatch at seq ${entry.seq}` };
        }
        const { self_hash, ...rest } = entry;
        void self_hash;
        const expected = hashJcs(rest);
        if (expected !== entry.self_hash) {
          return { valid: false, entriesSeen: i, firstBreakAt: i, error: `self_hash mismatch at seq ${entry.seq}` };
        }
        expectedPrev = entry.self_hash;
      }
      return { valid: true, entriesSeen: rows.length };
    },
  };
}
