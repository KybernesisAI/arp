import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

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
  },
});
