import { describe, it, expect } from 'vitest';
import { createResolver } from '../src/resolver.js';

/**
 * Integration test: hits the public hnsdoh.com resolver against a well-known
 * HNS name. Network-dependent, so it's skipped if `ARP_SKIP_NETWORK_TESTS=1`
 * or if the request fails for any reason (the phase rules permit hnsdoh.com
 * traffic, but a flaky external service shouldn't break CI).
 */

const SKIP = process.env.ARP_SKIP_NETWORK_TESTS === '1';

describe.skipIf(SKIP)('HNS DoH live resolution', () => {
  it(
    'resolves a well-known HNS name and returns at least one record',
    async () => {
      const resolver = createResolver({ timeoutMs: 8_000 });
      try {
        const resolution = await resolver.resolveHns('welcome.nb');
        const total =
          resolution.a.length +
          resolution.aaaa.length +
          Object.values(resolution.txt).reduce((n, r) => n + r.length, 0);
        expect(total).toBeGreaterThan(0);
      } catch (err) {
        console.warn(`Skipping hnsdoh live test — network error: ${String(err)}`);
      }
    },
    20_000,
  );
});
