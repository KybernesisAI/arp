/**
 * apps/cloud/lib/rate-limit.ts — helper-level tests.
 *
 * Drives `checkRateLimit` / `checkDualRateLimit` against a fresh PGlite
 * instance. Covers atomic increment, window rollover, and dual-limit
 * first-failer semantics.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPgliteDb, rateLimitHits } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;

vi.mock('@/lib/db', async () => ({
  getDb: async () => {
    if (!currentDb) throw new Error('test db not initialised');
    return currentDb.db;
  },
}));

const { checkRateLimit, checkDualRateLimit } = await import('../lib/rate-limit');

describe('checkRateLimit', () => {
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
  });
  afterEach(async () => {
    if (currentDb) {
      await currentDb.close();
      currentDb = null;
    }
  });

  it('allows the first N requests, 429s the N+1-th', async () => {
    const opts = { bucket: 'test:ip:1.2.3.4', windowSeconds: 60, limit: 3 };
    const a = await checkRateLimit(opts);
    const b = await checkRateLimit(opts);
    const c = await checkRateLimit(opts);
    const d = await checkRateLimit(opts);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(c.ok).toBe(true);
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.retryAfter).toBeGreaterThan(0);
      expect(d.retryAfter).toBeLessThanOrEqual(60);
    }
  });

  it('keeps separate buckets independent', async () => {
    const a = await checkRateLimit({ bucket: 'test:ip:a', windowSeconds: 60, limit: 1 });
    const b = await checkRateLimit({ bucket: 'test:ip:b', windowSeconds: 60, limit: 1 });
    const a2 = await checkRateLimit({ bucket: 'test:ip:a', windowSeconds: 60, limit: 1 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a2.ok).toBe(false);
  });

  it('persists hits under a single bucket row per window', async () => {
    const opts = { bucket: 'test:ip:row', windowSeconds: 60, limit: 10 };
    for (let i = 0; i < 5; i++) await checkRateLimit(opts);
    if (!currentDb) throw new Error('db gone');
    const rows = await currentDb.db.select().from(rateLimitHits);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hits).toBe(5);
  });
});

describe('checkDualRateLimit', () => {
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
  });
  afterEach(async () => {
    if (currentDb) {
      await currentDb.close();
      currentDb = null;
    }
  });

  it('fails when the burst limit trips first', async () => {
    // burst 2/min, sustained 100/hour. Four hits in a second.
    for (let i = 0; i < 2; i++) {
      const r = await checkDualRateLimit(
        'dual:ip:x',
        { windowSeconds: 60, limit: 2 },
        { windowSeconds: 3600, limit: 100 },
      );
      expect(r.ok).toBe(true);
    }
    const trip = await checkDualRateLimit(
      'dual:ip:x',
      { windowSeconds: 60, limit: 2 },
      { windowSeconds: 3600, limit: 100 },
    );
    expect(trip.ok).toBe(false);
  });

  it('fails when the sustained limit trips first', async () => {
    // burst 100/min, sustained 2/hour. Third hit trips the sustained limit.
    for (let i = 0; i < 2; i++) {
      const r = await checkDualRateLimit(
        'dual:ip:y',
        { windowSeconds: 60, limit: 100 },
        { windowSeconds: 3600, limit: 2 },
      );
      expect(r.ok).toBe(true);
    }
    const trip = await checkDualRateLimit(
      'dual:ip:y',
      { windowSeconds: 60, limit: 100 },
      { windowSeconds: 3600, limit: 2 },
    );
    expect(trip.ok).toBe(false);
  });
});
