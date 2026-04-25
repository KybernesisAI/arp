import Database, { type Database as BetterSqlite3Database } from 'better-sqlite3';

/**
 * Sidecar-local SQLite store for Phase-10-10d auth state:
 *   - WebAuthn credentials + per-purpose challenges (passkey sign-in)
 *   - Identity-rotation state (HKDF v1 → v2 with 90-day grace)
 *
 * Lives in its own SQLite file so the connection registry stays focused on
 * its Phase-2 concerns. Cleanup of expired challenges is opportunistic on
 * each persist call — no cron needed.
 */

export type WebauthnPurpose = 'register' | 'auth';
const CHALLENGE_TTL_MS = 60_000;

export interface UserCredentialRow {
  id: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  nickname: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface IdentityRotationState {
  /** Current principal DID (post-rotation if a rotation has occurred). */
  principalDid: string;
  /** Current principal public key, multibase. */
  principalPublicKeyMultibase: string;
  /** Previous principal DID, set during the 90-day grace window. */
  previousPrincipalDid: string | null;
  /** Previous principal public key during grace, multibase. */
  previousPrincipalPublicKeyMultibase: string | null;
  /**
   * Epoch ms when the previous DID becomes ineligible for verification.
   * Null when no rotation has happened.
   */
  previousDeprecatedAtMs: number | null;
}

export interface AuthStore {
  /* WebAuthn challenges */
  persistChallenge(challenge: string, purpose: WebauthnPurpose): void;
  consumeChallenge(challenge: string, purpose: WebauthnPurpose): boolean;

  /* WebAuthn credentials */
  insertCredential(input: {
    credentialId: string;
    publicKey: Uint8Array;
    counter: number;
    transports: string[];
    nickname: string | null;
  }): UserCredentialRow;
  listCredentials(): UserCredentialRow[];
  findCredentialByCredentialId(credentialId: string): UserCredentialRow | null;
  bumpCredentialCounter(credentialId: string, counter: number): void;
  renameCredential(id: string, nickname: string | null): UserCredentialRow | null;
  deleteCredential(id: string): boolean;
  countCredentials(): number;

  /* Identity rotation */
  getIdentityRotation(): IdentityRotationState | null;
  initializeIdentityRotation(state: {
    principalDid: string;
    principalPublicKeyMultibase: string;
  }): void;
  recordRotation(state: {
    principalDid: string;
    principalPublicKeyMultibase: string;
    previousPrincipalDid: string;
    previousPrincipalPublicKeyMultibase: string;
    nowMs: number;
    graceMs: number;
  }): void;
  /**
   * Clear `previous_*` columns when the grace window has passed. Returns
   * true if a row was cleared (graceful — null when no rotation).
   */
  expireRotationGraceIfDue(nowMs: number): boolean;

  close(): void;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS user_credentials (
    id              TEXT PRIMARY KEY,
    credential_id   TEXT NOT NULL UNIQUE,
    public_key      BLOB NOT NULL,
    counter         INTEGER NOT NULL DEFAULT 0,
    transports_json TEXT NOT NULL DEFAULT '[]',
    nickname        TEXT,
    created_at      INTEGER NOT NULL,
    last_used_at    INTEGER
  );

  CREATE TABLE IF NOT EXISTS webauthn_challenges (
    challenge   TEXT NOT NULL,
    purpose     TEXT NOT NULL,
    expires_at  INTEGER NOT NULL,
    consumed_at INTEGER,
    PRIMARY KEY (challenge, purpose)
  );

  CREATE TABLE IF NOT EXISTS identity_rotation (
    id                                       INTEGER PRIMARY KEY CHECK (id = 1),
    principal_did                            TEXT NOT NULL,
    principal_public_key_multibase           TEXT NOT NULL,
    previous_principal_did                   TEXT,
    previous_principal_public_key_multibase  TEXT,
    previous_deprecated_at_ms                INTEGER
  );
`;

export interface AuthStoreOptions {
  now?: () => number;
}

/**
 * Open (or create) the sidecar's auth store. Caller owns the filesystem
 * path. Use `:memory:` for tests.
 */
export function openAuthStore(
  path: string,
  opts: AuthStoreOptions = {},
): AuthStore {
  const now = opts.now ?? (() => Date.now());
  const db: BetterSqlite3Database = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  const insertChallenge = db.prepare(
    `INSERT OR REPLACE INTO webauthn_challenges (challenge, purpose, expires_at)
     VALUES (@challenge, @purpose, @expires_at)`,
  );
  const consumeChallengeStmt = db.prepare(
    `UPDATE webauthn_challenges
       SET consumed_at = @now
       WHERE challenge = @challenge
         AND purpose = @purpose
         AND consumed_at IS NULL
         AND expires_at > @now`,
  );
  const sweepExpiredChallenges = db.prepare(
    `DELETE FROM webauthn_challenges
       WHERE expires_at < @cutoff`,
  );

  const insertCredentialStmt = db.prepare(
    `INSERT INTO user_credentials (
       id, credential_id, public_key, counter, transports_json, nickname, created_at, last_used_at
     ) VALUES (
       @id, @credential_id, @public_key, @counter, @transports_json, @nickname, @created_at, NULL
     )`,
  );
  const selectAllCredentials = db.prepare(
    `SELECT * FROM user_credentials ORDER BY created_at ASC`,
  );
  const selectCredentialByExternalId = db.prepare(
    `SELECT * FROM user_credentials WHERE credential_id = ?`,
  );
  const bumpCounterStmt = db.prepare(
    `UPDATE user_credentials SET counter = @counter, last_used_at = @now
       WHERE credential_id = @credential_id`,
  );
  const renameCredentialStmt = db.prepare(
    `UPDATE user_credentials SET nickname = @nickname WHERE id = @id RETURNING *`,
  );
  const deleteCredentialStmt = db.prepare(
    `DELETE FROM user_credentials WHERE id = @id`,
  );
  const countCredentialsStmt = db.prepare(
    `SELECT COUNT(*) AS n FROM user_credentials`,
  );

  const selectRotation = db.prepare(`SELECT * FROM identity_rotation WHERE id = 1`);
  const upsertRotation = db.prepare(
    `INSERT INTO identity_rotation (
       id, principal_did, principal_public_key_multibase,
       previous_principal_did, previous_principal_public_key_multibase, previous_deprecated_at_ms
     ) VALUES (
       1, @principal_did, @principal_public_key_multibase,
       @previous_principal_did, @previous_principal_public_key_multibase, @previous_deprecated_at_ms
     )
     ON CONFLICT(id) DO UPDATE SET
       principal_did = excluded.principal_did,
       principal_public_key_multibase = excluded.principal_public_key_multibase,
       previous_principal_did = excluded.previous_principal_did,
       previous_principal_public_key_multibase = excluded.previous_principal_public_key_multibase,
       previous_deprecated_at_ms = excluded.previous_deprecated_at_ms`,
  );
  const clearRotationGrace = db.prepare(
    `UPDATE identity_rotation
       SET previous_principal_did = NULL,
           previous_principal_public_key_multibase = NULL,
           previous_deprecated_at_ms = NULL
       WHERE id = 1
         AND previous_deprecated_at_ms IS NOT NULL
         AND previous_deprecated_at_ms <= @now`,
  );

  function rowToCredential(
    row: Record<string, unknown>,
  ): UserCredentialRow {
    return {
      id: row['id'] as string,
      credentialId: row['credential_id'] as string,
      publicKey: row['public_key'] as Uint8Array,
      counter: Number(row['counter'] ?? 0),
      transports: JSON.parse((row['transports_json'] as string) ?? '[]') as string[],
      nickname: (row['nickname'] as string | null) ?? null,
      createdAt: Number(row['created_at']),
      lastUsedAt: row['last_used_at'] == null ? null : Number(row['last_used_at']),
    };
  }

  function rowToRotation(
    row: Record<string, unknown>,
  ): IdentityRotationState {
    return {
      principalDid: row['principal_did'] as string,
      principalPublicKeyMultibase: row['principal_public_key_multibase'] as string,
      previousPrincipalDid: (row['previous_principal_did'] as string | null) ?? null,
      previousPrincipalPublicKeyMultibase:
        (row['previous_principal_public_key_multibase'] as string | null) ?? null,
      previousDeprecatedAtMs:
        row['previous_deprecated_at_ms'] == null
          ? null
          : Number(row['previous_deprecated_at_ms']),
    };
  }

  return {
    persistChallenge(challenge, purpose) {
      const ts = now();
      insertChallenge.run({
        challenge,
        purpose,
        expires_at: ts + CHALLENGE_TTL_MS,
      });
      // Opportunistic sweep — ~1/100 calls clean up expired challenges.
      if (Math.random() < 0.01) {
        sweepExpiredChallenges.run({ cutoff: ts - CHALLENGE_TTL_MS });
      }
    },

    consumeChallenge(challenge, purpose) {
      const result = consumeChallengeStmt.run({
        challenge,
        purpose,
        now: now(),
      });
      return result.changes > 0;
    },

    insertCredential(input) {
      const id = randomId();
      insertCredentialStmt.run({
        id,
        credential_id: input.credentialId,
        public_key: input.publicKey,
        counter: input.counter,
        transports_json: JSON.stringify(input.transports),
        nickname: input.nickname,
        created_at: now(),
      });
      const row = selectCredentialByExternalId.get(input.credentialId);
      if (!row) throw new Error('insertCredential: row not found post-insert');
      return rowToCredential(row as Record<string, unknown>);
    },

    listCredentials() {
      return selectAllCredentials
        .all()
        .map((r) => rowToCredential(r as Record<string, unknown>));
    },

    findCredentialByCredentialId(credentialId) {
      const row = selectCredentialByExternalId.get(credentialId);
      return row ? rowToCredential(row as Record<string, unknown>) : null;
    },

    bumpCredentialCounter(credentialId, counter) {
      bumpCounterStmt.run({ credential_id: credentialId, counter, now: now() });
    },

    renameCredential(id, nickname) {
      const row = renameCredentialStmt.get({ id, nickname });
      return row ? rowToCredential(row as Record<string, unknown>) : null;
    },

    deleteCredential(id) {
      const result = deleteCredentialStmt.run({ id });
      return result.changes > 0;
    },

    countCredentials() {
      const row = countCredentialsStmt.get() as { n: number };
      return row.n;
    },

    getIdentityRotation() {
      const row = selectRotation.get();
      return row ? rowToRotation(row as Record<string, unknown>) : null;
    },

    initializeIdentityRotation(state) {
      const existing = selectRotation.get();
      if (existing) return;
      upsertRotation.run({
        principal_did: state.principalDid,
        principal_public_key_multibase: state.principalPublicKeyMultibase,
        previous_principal_did: null,
        previous_principal_public_key_multibase: null,
        previous_deprecated_at_ms: null,
      });
    },

    recordRotation(state) {
      upsertRotation.run({
        principal_did: state.principalDid,
        principal_public_key_multibase: state.principalPublicKeyMultibase,
        previous_principal_did: state.previousPrincipalDid,
        previous_principal_public_key_multibase: state.previousPrincipalPublicKeyMultibase,
        previous_deprecated_at_ms: state.nowMs + state.graceMs,
      });
    },

    expireRotationGraceIfDue(nowMs) {
      const result = clearRotationGrace.run({ now: nowMs });
      return result.changes > 0;
    },

    close() {
      db.close();
    },
  };
}

function randomId(): string {
  // Crypto-strong UUIDv4 (no external uuid dep).
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without WebCrypto (older Node tests).
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
