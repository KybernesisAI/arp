import Database, { type Database as BetterSqlite3Database } from 'better-sqlite3';

export const MAILBOX_SCHEMA = `
CREATE TABLE IF NOT EXISTS inbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  msg_id TEXT NOT NULL,
  peer_did TEXT NOT NULL,
  envelope_raw TEXT NOT NULL,
  received_at_ms INTEGER NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  UNIQUE(msg_id)
);
CREATE INDEX IF NOT EXISTS idx_inbox_pending ON inbox(delivered, seq);
`;

export interface InboxEntry {
  seq: number;
  msg_id: string;
  peer_did: string;
  envelope_raw: string;
  received_at_ms: number;
  delivered: number;
}

type InboxRow = InboxEntry;

export interface Mailbox {
  enqueue(input: Omit<InboxEntry, 'seq' | 'delivered'>): { inserted: boolean; seq: number | null };
  dequeuePending(limit: number): InboxEntry[];
  markDelivered(seq: number): void;
  sizePending(): number;
  close(): void;
}

export function openMailbox(path: string): Mailbox {
  const db: BetterSqlite3Database = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(MAILBOX_SCHEMA);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO inbox (msg_id, peer_did, envelope_raw, received_at_ms)
     VALUES (?, ?, ?, ?)`,
  );
  const selectPending = db.prepare(
    'SELECT * FROM inbox WHERE delivered = 0 ORDER BY seq ASC LIMIT ?',
  );
  const markDelivered = db.prepare('UPDATE inbox SET delivered = 1 WHERE seq = ?');
  const countPending = db.prepare('SELECT COUNT(*) AS n FROM inbox WHERE delivered = 0');

  return {
    enqueue(input) {
      const r = insert.run(
        input.msg_id,
        input.peer_did,
        input.envelope_raw,
        input.received_at_ms,
      );
      const inserted = r.changes > 0;
      return { inserted, seq: inserted ? Number(r.lastInsertRowid) : null };
    },
    dequeuePending(limit) {
      return selectPending.all(limit) as InboxRow[];
    },
    markDelivered(seq) {
      markDelivered.run(seq);
    },
    sizePending() {
      const row = countPending.get() as { n: number };
      return row.n;
    },
    close() {
      db.close();
    },
  };
}
