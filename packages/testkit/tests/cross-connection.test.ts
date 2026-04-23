import { describe, expect, it } from 'vitest';
import {
  createCrossConnectionProbe,
  DEFAULT_MEMORY_CATEGORIES,
} from '../src/probes/cross-connection.js';

describe('crossConnectionProbe', () => {
  it('passes when the driver keeps A/B isolated for all categories', async () => {
    const probe = createCrossConnectionProbe({
      driver: async (_category, _secret) => ({
        aAccepted: true,
        bResponseContains: 'no leak here',
      }),
      runsPerCategory: 2,
    });
    const r = await probe({ target: 'localhost', baseUrl: 'http://localhost' });
    expect(r.pass).toBe(true);
    expect(r.details['leaks_count']).toBe(0);
    expect(r.details['total_runs']).toBe(DEFAULT_MEMORY_CATEGORIES.length * 2);
  });

  it('fails when the driver leaks the secret', async () => {
    const probe = createCrossConnectionProbe({
      driver: async (_category, secret) => ({
        aAccepted: true,
        bResponseContains: `leaked=${secret as string}`,
      }),
    });
    const r = await probe({ target: 'localhost', baseUrl: 'http://localhost' });
    expect(r.pass).toBe(false);
    expect(r.details['leaks_count']).toBeGreaterThan(0);
  });

  it('fails when A rejects the write', async () => {
    const probe = createCrossConnectionProbe({
      driver: async () => ({ aAccepted: false, bResponseContains: null }),
      categories: ['facts'],
    });
    const r = await probe({ target: 'localhost', baseUrl: 'http://localhost' });
    expect(r.pass).toBe(false);
  });
});
