/**
 * Cloud db singleton.
 *
 * Driver selection at boot:
 *   - If `DATABASE_URL` is set (production on Vercel + Neon) → Neon HTTP driver.
 *     No filesystem reads, no socket state — fits the serverless invocation model.
 *   - Otherwise → PGlite in-memory (local dev + tests).
 *
 * The handle is memoized for the lifetime of the Next.js server process.
 */

import { createNeonDb, createPgliteDb, type CloudDbClient } from '@kybernesis/arp-cloud-db';

let singleton: { db: CloudDbClient; close: () => Promise<void> } | null = null;
let inflight: Promise<{ db: CloudDbClient; close: () => Promise<void> }> | null = null;

export async function getDb(): Promise<CloudDbClient> {
  if (singleton) return singleton.db;
  if (!inflight) {
    inflight = (async () => {
      const connectionString = process.env['DATABASE_URL'];
      if (connectionString) {
        const built = createNeonDb({ connectionString });
        singleton = { db: built.db as unknown as CloudDbClient, close: built.close };
        return singleton;
      }
      const built = await createPgliteDb({
        ...(process.env['PGLITE_DATA_DIR'] ? { dataDir: process.env['PGLITE_DATA_DIR'] } : {}),
      });
      singleton = { db: built.db as unknown as CloudDbClient, close: built.close };
      return singleton;
    })();
  }
  const s = await inflight;
  return s.db;
}

export async function resetDbForTests(): Promise<void> {
  if (singleton) {
    await singleton.close();
    singleton = null;
  }
  inflight = null;
}
