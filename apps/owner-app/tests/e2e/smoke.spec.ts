import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { startMockRuntime } from './helpers/mock-runtime.js';
import {
  publicKeyHex,
  signUtf8,
  TEST_PRINCIPAL_DID,
} from './helpers/test-keys.js';

const MOCK_PORT = Number(process.env.PLAYWRIGHT_RUNTIME_PORT ?? 3031);
const ADMIN_TOKEN = process.env.ARP_ADMIN_TOKEN ?? 'e2e-admin';

let mock: Awaited<ReturnType<typeof startMockRuntime>> | null = null;

test.beforeAll(async () => {
  // Write the principals.json the dev server picks up via env var.
  const dir = resolve(process.cwd(), 'tests', 'e2e');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, 'principals.json'),
    JSON.stringify(
      { [TEST_PRINCIPAL_DID]: { publicKeyHex: await publicKeyHex() } },
      null,
      2,
    ),
  );

  mock = await startMockRuntime({ port: MOCK_PORT, adminToken: ADMIN_TOKEN });
  mock.addConnection({
    connection_id: 'conn_seeded',
    label: 'Project Alpha',
    self_did: 'did:web:samantha.agent',
    peer_did: 'did:web:ghost.agent',
    purpose: 'project:alpha',
    status: 'active',
    created_at: Date.now(),
    expires_at: Date.now() + 30 * 86_400_000,
    last_message_at: null,
    cedar_policies: ['permit (principal, action, resource);'],
    obligations: [],
    issuer: 'did:web:ian.self.xyz',
    scope_catalog_version: 'v1',
    token: {
      connection_id: 'conn_seeded',
      issuer: 'did:web:ian.self.xyz',
      subject: 'did:web:samantha.agent',
      audience: 'did:web:ghost.agent',
      purpose: 'project:alpha',
      cedar_policies: ['permit (principal, action, resource);'],
      obligations: [],
      scope_catalog_version: 'v1',
      expires: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      sigs: {
        'did:web:ian.self.xyz': 'stub',
        'did:web:nick.self.xyz': 'stub',
      },
    },
    token_jws: '{}',
    metadata: null,
  });
});

test.afterAll(async () => {
  await mock?.stop();
});

test('redirects unauthenticated users to login, then signs them in', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);

  await page.getByTestId('challenge-btn').click();
  const nonce = await page.getByTestId('challenge-nonce').textContent();
  expect(nonce?.trim().length).toBeGreaterThan(0);

  const signature = await signUtf8(nonce!.trim());
  await page.getByTestId('signature-input').fill(signature);
  await page.getByTestId('verify-btn').click();

  await expect(page).toHaveURL('/');
  await expect(page.getByText('Address book')).toBeVisible();
  await expect(page.getByText('Ghost')).toBeVisible();
});

test('connection detail → audit round-trip', async ({ page }) => {
  // Reuse the session by going through login again (browser state is
  // per-test by default).
  await page.goto('/');
  if (page.url().includes('/login')) {
    await page.getByTestId('challenge-btn').click();
    const nonce = (await page.getByTestId('challenge-nonce').textContent())?.trim() ?? '';
    await page
      .getByTestId('signature-input')
      .fill(await signUtf8(nonce));
    await page.getByTestId('verify-btn').click();
    await page.waitForURL('/');
  }

  await page.getByRole('link', { name: 'Open' }).first().click();
  await expect(page).toHaveURL(/\/connections\/conn_seeded$/);
  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(page.getByTestId('audit-verification')).toHaveText(/verified/);
});
