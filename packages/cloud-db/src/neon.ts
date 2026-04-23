/**
 * Neon HTTP adapter. Used in production on Vercel Functions where each
 * invocation is short-lived and the filesystem is read-only — the HTTP
 * driver needs no local socket state and no migration filesystem reads.
 *
 * Same schema + same drizzle queries as the PGlite adapter so callers
 * never branch on driver implementation.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import type { CloudDbClient } from './db.js';
import * as schema from './schema.js';

export interface NeonOptions {
  /**
   * Full Postgres connection URL. Typically `process.env.DATABASE_URL`
   * (the Vercel-Neon integration injects the pooled connection string
   * under that key automatically).
   */
  connectionString: string;
}

/**
 * Create a Neon-backed `CloudDbClient`. Returns a drizzle handle + a
 * no-op `close` for parity with the PGlite adapter (HTTP sessions don't
 * hold resources between calls).
 *
 * The return value is typed as `CloudDbClient` (which is PgliteDatabase in
 * the type layer — see `./db.ts` for why). Both drivers implement the same
 * drizzle query API at runtime; the cast is safe.
 */
export function createNeonDb(
  opts: NeonOptions,
): { db: CloudDbClient; close: () => Promise<void> } {
  const sql = neon(opts.connectionString);
  const db = drizzle(sql, { schema });
  return {
    db: db as unknown as CloudDbClient,
    async close() {
      // nothing to tear down — HTTP sessions are per-query
    },
  };
}
