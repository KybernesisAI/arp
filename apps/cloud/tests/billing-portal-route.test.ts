/**
 * POST /api/billing/portal — slice 10c.
 *
 * Scenarios:
 *   1. 401 without a session
 *   2. 404 no_tenant when the principal has no tenant row
 *   3. 400 no_stripe_customer when the tenant has no stripeCustomerId yet
 *   4. 503 stripe_not_configured when STRIPE_SECRET_KEY is unset
 *   5. Happy path (with STRIPE_SECRET_KEY) returns { url } from a mocked
 *      Stripe client without touching the real API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPgliteDb,
  tenants,
  type CloudDbClient,
} from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';
import { installCookieMock, installHeadersMock } from './helpers/cookies';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';
process.env['ARP_CLOUD_HOST'] =
  process.env['ARP_CLOUD_HOST'] ?? 'cloud.arp.run';

installCookieMock();
installHeadersMock();

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
let sessionOverride: { principalDid: string; tenantId: string | null } | null = null;

vi.mock('@/lib/db', async () => ({
  getDb: async () => {
    if (!currentDb) throw new Error('test db not initialised');
    return currentDb.db;
  },
}));

vi.mock('@/lib/session', async () => ({
  getSession: async () => {
    if (!sessionOverride) return null;
    return {
      ...sessionOverride,
      nonce: 'test-nonce',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
    };
  },
}));

const stripeCreateMock = vi.fn();

vi.mock('../lib/billing', async (orig) => {
  const actual = (await orig()) as typeof import('../lib/billing');
  return {
    ...actual,
    getBillingContext: () => {
      const secret = process.env['STRIPE_SECRET_KEY'];
      return {
        stripe: secret
          ? ({
              billingPortal: {
                sessions: { create: stripeCreateMock },
              },
            } as unknown as import('stripe').default)
          : null,
        webhookSecret: null,
        priceIds: { pro: null, team: null },
      };
    },
    // Keep real createPortalSession so it calls the mocked stripe.
  };
});

const { POST } = await import('../app/api/billing/portal/route');

async function makeRequest(): Promise<Response> {
  return POST();
}

async function seedTenant(overrides: Partial<typeof tenants.$inferInsert> = {}): Promise<string> {
  if (!currentDb) throw new Error('db gone');
  const rows = await currentDb.db
    .insert(tenants)
    .values({
      principalDid: 'did:web:ian.example.agent',
      plan: 'free',
      status: 'active',
      ...overrides,
    })
    .returning({ id: tenants.id });
  const row = rows[0];
  if (!row) throw new Error('tenant insert returned no row');
  return row.id;
}

describe('POST /api/billing/portal', () => {
  beforeEach(async () => {
    stripeCreateMock.mockReset();
    currentDb = await createPgliteDb();
    sessionOverride = null;
    delete process.env['STRIPE_SECRET_KEY'];
  });

  afterEach(async () => {
    await currentDb?.close();
    currentDb = null;
  });

  it('returns 401 without a session', async () => {
    sessionOverride = null;
    const res = await makeRequest();
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  it('returns 404 no_tenant when the principal has no tenant', async () => {
    sessionOverride = { principalDid: 'did:web:ghost.example.agent', tenantId: null };
    const res = await makeRequest();
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('no_tenant');
  });

  it('returns 400 no_stripe_customer when the tenant has no stripeCustomerId', async () => {
    const tenantId = await seedTenant();
    sessionOverride = { principalDid: 'did:web:ian.example.agent', tenantId };
    const res = await makeRequest();
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('no_stripe_customer');
  });

  it('returns 503 stripe_not_configured when STRIPE_SECRET_KEY is unset', async () => {
    const tenantId = await seedTenant({
      stripeCustomerId: 'cus_test_123',
      plan: 'pro',
    });
    sessionOverride = { principalDid: 'did:web:ian.example.agent', tenantId };
    const res = await makeRequest();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('stripe_not_configured');
  });

  it('returns { url } on happy path and calls Stripe with the right args', async () => {
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_123';
    stripeCreateMock.mockResolvedValue({ url: 'https://billing.stripe.com/session/abc' });
    const tenantId = await seedTenant({
      stripeCustomerId: 'cus_test_456',
      plan: 'team',
    });
    sessionOverride = { principalDid: 'did:web:ian.example.agent', tenantId };
    const res = await makeRequest();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe('https://billing.stripe.com/session/abc');
    expect(stripeCreateMock).toHaveBeenCalledTimes(1);
    const call = stripeCreateMock.mock.calls[0]![0] as {
      customer: string;
      return_url: string;
    };
    expect(call.customer).toBe('cus_test_456');
    expect(call.return_url).toBe('https://cloud.arp.run/billing');
    // Tenant row unchanged — the portal URL is NOT cached into the DB.
    const refreshed = await currentDb!.db
      .select({ id: tenants.id, cust: tenants.stripeCustomerId })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    expect(refreshed[0]?.cust).toBe('cus_test_456');
  });
});
