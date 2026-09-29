/**
 * Neon HTTP adapter. Used in production on Vercel Functions where each
 * invocation is short-lived and the filesystem is read-only — the HTTP
 * driver needs no local socket state and no migration filesystem reads.
 *
 * Same schema + same drizzle queries as the PGlite adapter so callers
 * never branch on driver implementation.
 */

import { neon, neonConfig } from '@neondatabase/serverless';
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
/**
 * Codes that mean the TCP/TLS connection was never established, so the query
 * was never sent and a retry cannot execute it twice. Anything after the
 * request went out (ECONNRESET, socket errors, HTTP errors) is NOT retried.
 */
const CONNECT_FAILURE_CODES = new Set(['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT']);

export function isConnectFailure(err: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (e: unknown): boolean => {
    if (!e || typeof e !== 'object' || seen.has(e)) return false;
    seen.add(e);
    const o = e as { code?: unknown; errors?: unknown; cause?: unknown };
    if (typeof o.code === 'string' && CONNECT_FAILURE_CODES.has(o.code)) return true;
    if (Array.isArray(o.errors) && o.errors.length > 0 && o.errors.every((x) => walk(x))) return true;
    return walk(o.cause);
  };
  return walk(err);
}

/**
 * fetch with a short retry on connect-phase failures only. The Railway
 * gateway saw intermittent ETIMEDOUT connecting to Neon (2026-09-21 for
 * hours, 2026-09-29 sporadically); one retry turns those into a slow query
 * instead of a 500. Backoff 300 ms, 900 ms.
 */
export function retryingFetch(
  fetchImpl: typeof fetch = globalThis.fetch,
  opts: { attempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): typeof fetch {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 300;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fetchImpl(input, init);
      } catch (err) {
        if (attempt >= attempts || !isConnectFailure(err)) throw err;
        await sleep(base * 3 ** (attempt - 1));
      }
    }
  }) as typeof fetch;
}

export function createNeonDb(
  opts: NeonOptions,
): { db: CloudDbClient; close: () => Promise<void> } {
  neonConfig.fetchFunction = retryingFetch();
  const sql = neon(opts.connectionString);
  const db = drizzle(sql, { schema });
  return {
    db: db as unknown as CloudDbClient,
    async close() {
      // nothing to tear down — HTTP sessions are per-query
    },
  };
}
