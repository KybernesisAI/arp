import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Owner-app unit tests (vitest) live under `tests/unit` — we own the e2e
 * suite separately via Playwright under `tests/e2e`. Without the explicit
 * exclude, vitest would find the `.next/` build output's copies of the
 * Playwright spec files and try to run them as unit tests.
 *
 * The `@` alias mirrors the Next.js / TS path map so route handlers tested
 * here can keep using `@/lib/session` etc.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**', 'tests/e2e/**'],
    globals: false,
  },
});
