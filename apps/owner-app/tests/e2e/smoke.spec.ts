import { test, expect } from '@playwright/test';
import { startMockRuntime } from './helpers/mock-runtime.js';

const MOCK_PORT = Number(process.env.PLAYWRIGHT_RUNTIME_PORT ?? 3031);
const ADMIN_TOKEN = process.env.ARP_ADMIN_TOKEN ?? 'e2e-admin';

let mock: Awaited<ReturnType<typeof startMockRuntime>> | null = null;

test.beforeAll(async () => {
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
    issuer: 'did:web:ian.example.agent',
    scope_catalog_version: 'v1',
    token: {
      connection_id: 'conn_seeded',
      issuer: 'did:web:ian.example.agent',
      subject: 'did:web:samantha.agent',
      audience: 'did:web:ghost.agent',
      purpose: 'project:alpha',
      cedar_policies: ['permit (principal, action, resource);'],
      obligations: [],
      scope_catalog_version: 'v1',
      expires: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      sigs: {
        'did:web:ian.example.agent': 'stub',
        'did:web:nick.example.agent': 'stub',
      },
    },
    token_jws: '{}',
    metadata: null,
  });
});

test.afterAll(async () => {
  await mock?.stop();
});

test.beforeEach(async ({ context }) => {
  // Ensure each test starts with a fresh, key-less browser so the onboarding
  // flow triggers — localStorage is per-context.
  await context.clearCookies();
});

test('first-visit onboarding: generate → save recovery → sign in', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);

  // No DID input. No signature textarea.
  await expect(page.locator('[data-testid="challenge-btn"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="signature-input"]')).toHaveCount(0);

  // Click "Get started" → browser generates a did:key.
  await page.getByTestId('get-started-btn').click();
  const principalDid = (await page.getByTestId('principal-did').textContent())?.trim() ?? '';
  expect(principalDid).toMatch(/^did:key:z/);

  // Reveal + acknowledge the recovery phrase.
  await page.getByTestId('reveal-phrase-btn').click();
  const phrase = (await page.getByTestId('recovery-phrase').textContent())?.trim() ?? '';
  expect(phrase.split(/\s+/).length).toBe(12);

  // The "Sign in" button is disabled until the user checks the ack box.
  await expect(page.getByTestId('sign-in-btn')).toBeDisabled();
  await page.getByTestId('phrase-ack').check();
  await expect(page.getByTestId('sign-in-btn')).toBeEnabled();

  // One click, no pasting.
  await page.getByTestId('sign-in-btn').click();

  await expect(page).toHaveURL('/');
  await expect(page.getByText('Address book')).toBeVisible();
  await expect(page.getByText('Ghost')).toBeVisible();
});

test('returning visit: single-click sign in', async ({ page }) => {
  // First visit: onboard + sign in to seed localStorage with a key.
  await page.goto('/login');
  await page.getByTestId('get-started-btn').click();
  await page.getByTestId('reveal-phrase-btn').click();
  await page.getByTestId('phrase-ack').check();
  await page.getByTestId('sign-in-btn').click();
  await expect(page).toHaveURL('/');

  // Clear the session cookie only; keep localStorage → forces login flow
  // but leaves the principal key in place.
  await page.context().clearCookies();
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);

  // Returning-user UI: Sign in button is visible immediately, no onboarding.
  await expect(page.getByTestId('get-started-btn')).toHaveCount(0);
  await page.getByTestId('sign-in-btn').click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Address book')).toBeVisible();
});

test('connection detail → audit round-trip', async ({ page }) => {
  // Onboard + sign in.
  await page.goto('/');
  if (page.url().includes('/login')) {
    await page.getByTestId('get-started-btn').click();
    await page.getByTestId('reveal-phrase-btn').click();
    await page.getByTestId('phrase-ack').check();
    await page.getByTestId('sign-in-btn').click();
    await page.waitForURL('/');
  }

  await page.getByRole('link', { name: 'Open' }).first().click();
  await expect(page).toHaveURL(/\/connections\/conn_seeded$/);
  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(page.getByTestId('audit-verification')).toHaveText(/verified/);
});
