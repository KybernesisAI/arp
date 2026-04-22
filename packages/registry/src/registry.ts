import Database, { type Database as BetterSqlite3Database } from 'better-sqlite3';
import { ConnectionTokenSchema, type ConnectionToken } from '@kybernesis/arp-spec';
import { RegistryError_, type RegistryErrorCode } from './errors.js';
import { REGISTRY_SCHEMA_SQL } from './schema.js';
import type {
  ConnectionFilter,
  ConnectionRecord,
  ConnectionStatus,
  CreateConnectionInput,
  Revocation,
  RevocationType,
} from './types.js';

interface ConnectionRow {
  connection_id: string;
  label: string | null;
  self_did: string;
  peer_did: string;
  purpose: string | null;
  token_jws: string;
  cedar_policies_json: string;
  status: ConnectionStatus;
  created_at: number;
  expires_at: number | null;
  last_message_at: number | null;
  metadata_json: string | null;
}

interface RevocationRow {
  type: RevocationType;
  id: string;
  revoked_at: number;
  reason: string | null;
}

export interface RegistryOptions {
  /** Clock injection for tests. Returns epoch ms. */
  now?: () => number;
}

export interface Registry {
  createConnection(input: CreateConnectionInput): Promise<ConnectionRecord>;
  getConnection(id: string): Promise<ConnectionRecord | null>;
  listConnections(filter?: ConnectionFilter): Promise<ConnectionRecord[]>;
  updateStatus(id: string, status: ConnectionStatus): Promise<void>;
  revokeConnection(id: string, reason: string): Promise<void>;
  touchLastMessage(id: string, at?: number): Promise<void>;
  recordSpend(id: string, cents: number, at?: number): Promise<void>;
  getSpendWindow(id: string, windowSec: number, at?: number): Promise<number>;
  listRevocations(type?: RevocationType): Promise<Revocation[]>;
  isRevoked(type: RevocationType, id: string): Promise<boolean>;
  recordRevocation(r: Omit<Revocation, 'revoked_at'> & { revoked_at?: number }): Promise<void>;
  close(): void;
}

/**
 * Open (or create) the agent-local connection registry. The file is a
 * single-writer SQLite database; `better-sqlite3` is synchronous, so
 * await'd methods simply wrap the sync calls for a uniform API.
 *
 * Caller owns the filesystem path. Use `:memory:` for tests.
 */
export function openRegistry(path: string, opts: RegistryOptions = {}): Registry {
  const now = opts.now ?? (() => Date.now());
  const db: BetterSqlite3Database = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(REGISTRY_SCHEMA_SQL);

  const insertConn = db.prepare(`
    INSERT INTO connections (
      connection_id, label, self_did, peer_did, purpose, token_jws,
      cedar_policies_json, status, created_at, expires_at, last_message_at, metadata_json
    ) VALUES (
      @connection_id, @label, @self_did, @peer_did, @purpose, @token_jws,
      @cedar_policies_json, @status, @created_at, @expires_at, @last_message_at, @metadata_json
    )
  `);

  const selectConn = db.prepare('SELECT * FROM connections WHERE connection_id = ?');
  const selectConnAll = db.prepare('SELECT * FROM connections ORDER BY created_at DESC');
  const selectByPeer = db.prepare(
    'SELECT * FROM connections WHERE peer_did = ? ORDER BY created_at DESC',
  );
  const selectByStatus = db.prepare(
    'SELECT * FROM connections WHERE status = ? ORDER BY created_at DESC',
  );
  const selectByPeerStatus = db.prepare(
    'SELECT * FROM connections WHERE peer_did = ? AND status = ? ORDER BY created_at DESC',
  );
  const updateStatusStmt = db.prepare('UPDATE connections SET status = ? WHERE connection_id = ?');
  const touchStmt = db.prepare(
    'UPDATE connections SET last_message_at = ? WHERE connection_id = ?',
  );

  const upsertSpend = db.prepare(
    `INSERT INTO connection_spend (connection_id, window_start, amount_usd_cents)
     VALUES (?, ?, ?)
     ON CONFLICT (connection_id, window_start) DO UPDATE
     SET amount_usd_cents = amount_usd_cents + excluded.amount_usd_cents`,
  );
  const sumSpend = db.prepare(
    `SELECT COALESCE(SUM(amount_usd_cents), 0) AS total
     FROM connection_spend
     WHERE connection_id = ? AND window_start >= ?`,
  );

  const insertRevoke = db.prepare(
    `INSERT INTO revocations (type, id, revoked_at, reason)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (type, id) DO UPDATE
     SET revoked_at = excluded.revoked_at, reason = excluded.reason`,
  );
  const selectRevokeOne = db.prepare('SELECT * FROM revocations WHERE type = ? AND id = ?');
  const selectRevokeAll = db.prepare('SELECT * FROM revocations ORDER BY revoked_at DESC');
  const selectRevokeByType = db.prepare(
    'SELECT * FROM revocations WHERE type = ? ORDER BY revoked_at DESC',
  );

  function rowToRecord(row: ConnectionRow): ConnectionRecord {
    const token = ConnectionTokenSchema.parse(JSON.parse(row.token_jws));
    const policies = JSON.parse(row.cedar_policies_json) as string[];
    const metadata =
      row.metadata_json === null ? null : (JSON.parse(row.metadata_json) as Record<string, unknown>);
    return {
      connection_id: row.connection_id,
      label: row.label,
      self_did: row.self_did,
      peer_did: row.peer_did,
      purpose: row.purpose,
      token_jws: row.token_jws,
      token,
      cedar_policies: policies,
      status: row.status,
      created_at: row.created_at,
      expires_at: row.expires_at,
      last_message_at: row.last_message_at,
      metadata,
    };
  }

  function tokenExpiryMs(token: ConnectionToken): number | null {
    const ms = Date.parse(token.expires);
    return Number.isFinite(ms) ? ms : null;
  }

  return {
    async createConnection(input) {
      const { token } = input;
      const peer_did = token.audience === input.self_did ? token.subject : token.audience;
      const expires_at = tokenExpiryMs(token);
      const row = {
        connection_id: token.connection_id,
        label: input.label ?? null,
        self_did: input.self_did,
        peer_did,
        purpose: token.purpose,
        token_jws: input.token_jws,
        cedar_policies_json: JSON.stringify(token.cedar_policies),
        status: 'active' as ConnectionStatus,
        created_at: now(),
        expires_at,
        last_message_at: null,
        metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      };
      try {
        insertConn.run(row);
      } catch (err) {
        if (err instanceof Error && /UNIQUE/i.test(err.message)) {
          throw new RegistryError_('conflict', `connection ${token.connection_id} already exists`, err);
        }
        throwStorage(err);
      }
      const persisted = selectConn.get(token.connection_id) as ConnectionRow | undefined;
      if (!persisted) throw new RegistryError_('storage_failure', 'insert readback failed');
      return rowToRecord(persisted);
    },

    async getConnection(id) {
      const row = selectConn.get(id) as ConnectionRow | undefined;
      return row ? rowToRecord(row) : null;
    },

    async listConnections(filter = {}) {
      let rows: ConnectionRow[];
      if (filter.peer_did && filter.status) {
        rows = selectByPeerStatus.all(filter.peer_did, filter.status) as ConnectionRow[];
      } else if (filter.peer_did) {
        rows = selectByPeer.all(filter.peer_did) as ConnectionRow[];
      } else if (filter.status) {
        rows = selectByStatus.all(filter.status) as ConnectionRow[];
      } else {
        rows = selectConnAll.all() as ConnectionRow[];
      }
      if (!filter.includeExpired) {
        const t = now();
        rows = rows.filter((r) => r.expires_at === null || r.expires_at > t);
      }
      return rows.map(rowToRecord);
    },

    async updateStatus(id, status) {
      const res = updateStatusStmt.run(status, id);
      if (res.changes === 0) {
        throw new RegistryError_('not_found', `connection ${id} not found`);
      }
    },

    async revokeConnection(id, reason) {
      const txn = db.transaction(() => {
        const res = updateStatusStmt.run('revoked', id);
        if (res.changes === 0) {
          throw new RegistryError_('not_found', `connection ${id} not found`);
        }
        insertRevoke.run('connection', id, now(), reason);
      });
      txn();
    },

    async touchLastMessage(id, at) {
      const res = touchStmt.run(at ?? now(), id);
      if (res.changes === 0) {
        throw new RegistryError_('not_found', `connection ${id} not found`);
      }
    },

    async recordSpend(id, cents, at) {
      if (cents < 0) {
        throw new RegistryError_('invalid_input', 'spend amount must be ≥ 0');
      }
      const conn = selectConn.get(id) as ConnectionRow | undefined;
      if (!conn) throw new RegistryError_('not_found', `connection ${id} not found`);
      const windowStart = Math.floor((at ?? now()) / 1000);
      upsertSpend.run(id, windowStart, cents);
    },

    async getSpendWindow(id, windowSec, at) {
      const nowSec = Math.floor((at ?? now()) / 1000);
      const since = nowSec - windowSec;
      const row = sumSpend.get(id, since) as { total: number | null } | undefined;
      return row?.total ?? 0;
    },

    async listRevocations(type) {
      const rows = (
        type ? selectRevokeByType.all(type) : selectRevokeAll.all()
      ) as RevocationRow[];
      return rows.map((r) => ({
        type: r.type,
        id: r.id,
        revoked_at: r.revoked_at,
        reason: r.reason,
      }));
    },

    async isRevoked(type, id) {
      return selectRevokeOne.get(type, id) !== undefined;
    },

    async recordRevocation(r) {
      insertRevoke.run(r.type, r.id, r.revoked_at ?? now(), r.reason ?? null);
    },

    close() {
      db.close();
    },
  };
}

function throwStorage(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  throw new RegistryError_('storage_failure', message, err);
}

// Re-export so downstream code can narrow error codes.
export type { RegistryErrorCode };
