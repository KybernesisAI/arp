/**
 * PGlite (WASM Postgres) adapter. Used for tests and local dev when a real
 * Postgres isn't booted. Same schema + same queries as production.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export interface PgliteOptions {
  dataDir?: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, '..', 'migrations');

export async function createPgliteDb(
  opts: PgliteOptions = {},
): Promise<{ db: PgliteDatabase<typeof schema>; client: PGlite; close: () => Promise<void> }> {
  const client = opts.dataDir ? new PGlite(opts.dataDir) : new PGlite();
  // Wait until it's ready.
  await client.waitReady;
  const migration = readFileSync(join(MIGRATIONS_DIR, '0001_init.sql'), 'utf8');
  await client.exec(migration);
  const db = drizzle(client, { schema }) as unknown as PgliteDatabase<typeof schema>;
  return {
    db,
    client,
    async close() {
      await client.close();
    },
  };
}
