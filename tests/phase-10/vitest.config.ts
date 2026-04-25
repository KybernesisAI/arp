import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Phase 10 acceptance tests — programmatic end-to-end coverage of the
 * product surface. Every test runs offline (PGlite for the cloud-app side,
 * in-memory transport fixtures for the sidecar side, injected fetch for
 * cross-instance traffic). Slice 10e closes Phase 10.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '../../apps/cloud'),
    },
  },
  test: {
    include: ['**/*.test.ts'],
    globals: false,
    testTimeout: 60000,
    hookTimeout: 30000,
  },
});
