import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    globals: false,
    testTimeout: 20000,
  },
});
