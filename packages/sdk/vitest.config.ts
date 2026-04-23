import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
    hookTimeout: 20_000,
    testTimeout: 20_000,
  },
});
