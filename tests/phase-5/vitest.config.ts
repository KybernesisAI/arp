import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    globals: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Tests bind localhost ports; serialise file-level so two suites don't
    // both grab ports 5501/5502 in parallel worker threads (EADDRINUSE).
    fileParallelism: false,
  },
});
