/**
 * Concrete database client + bootstrapping.
 *
 * Two drivers supported:
 *   - Real Postgres via `node-postgres` (production, local docker)
 *   - PGlite (WASM, in-memory) for tests + local dev without a running db
 *
 * Both drivers return the same drizzle `CloudDbClient` shape so callers never
 * branch on driver.
 */

import type { PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema.js';

export type CloudDbClient =
  | PgliteDatabase<typeof schema>;

export { schema };
