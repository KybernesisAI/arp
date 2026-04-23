import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3030';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm exec next dev --port 3030 --hostname 127.0.0.1',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
    env: {
      ARP_RUNTIME_URL:
        process.env.PLAYWRIGHT_RUNTIME_URL ?? 'http://127.0.0.1:3031',
      ARP_ADMIN_TOKEN: process.env.ARP_ADMIN_TOKEN ?? 'e2e-admin',
      ARP_AGENT_DID: 'did:web:samantha.agent',
      ARP_PRINCIPAL_DID: 'did:web:ian.self.xyz',
      ARP_SESSION_SECRET: 'e2e-session-secret-000000000000000',
      ARP_OWNER_APP_BASE_URL: BASE_URL,
      ARP_PRINCIPAL_KEYS_PATH: 'tests/e2e/principals.json',
      ARP_SCOPE_CATALOG_DIR: '../../packages/scope-catalog/scopes',
      NODE_ENV: 'development',
    },
  },
});
