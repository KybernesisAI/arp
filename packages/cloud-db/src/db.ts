/**
 * Concrete database client + bootstrapping.
 *
 * Two drivers supported at runtime:
 *   - Neon HTTP driver (production on Vercel Functions) — see `./neon.ts`
 *   - PGlite (WASM, in-memory) for tests + local dev without a running db —
 *     see `./pglite.ts`
 *
 * We expose a SINGLE `CloudDbClient` type (PgliteDatabase) rather than a
 * union, because drizzle's method overloads intersect awkwardly when two
 * driver types are unioned — specifically `.returning(cols)` loses its
 * argument overload under a `PgliteDatabase | NeonHttpDatabase` union, which
 * ripples through every update/insert site. Both drivers implement the same
 * drizzle query API at runtime, so treating the Neon handle as a
 * `PgliteDatabase` in the type system is safe; the cast lives in `./neon.ts`.
 *
 * If a future feature needs driver-specific typing, introduce a separate
 * `CloudDbClientNeon` type at that call site rather than re-widening the
 * shared `CloudDbClient`.
 */

import type { PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema.js';

export type CloudDbClient = PgliteDatabase<typeof schema>;

export { schema };
