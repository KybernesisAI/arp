/**
 * AgentID S2 / T4: HTTP surface for name search + checkout. Session, DB,
 * registry client and payments are mocked; the response bodies must stay
 * supplier-neutral.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, tenants } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';

process.env['ARP_CLOUD_SESSION_SECRET'] = process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
let currentTenantId = '';
const PRINCIPAL = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

vi.mock('@/lib/db', async () => ({
  getDb: async () => {
    if (!currentDb) throw new Error('test db not initialised');
    return currentDb.db;
  },
  resetDbForTests: async () => {
    if (currentDb) {
      await currentDb.close();
      currentDb = null;
    }
  },
}));

vi.mock('@/lib/session', async () => ({
  getSession: async () => ({ principalDid: PRINCIPAL, tenantId: currentTenantId }),
  SESSION_COOKIE: 'arp_cloud_session',
}));

const searchMock = vi.fn();
const stripeCreate = vi.fn(async () => ({ id: 'cs_route_1', url: 'https://checkout.stripe.test/cs_route_1' }));

vi.mock('@/lib/registrar-server', async () => ({
  registrarEnv: () => ({ AGENTID_NAME_PRICE_CENTS: 2900, AGENTID_NAME_MAX_YEARS: 3, AGENTID_MIRROR_SUFFIX: '.agent.arp.run' }),
  headlessFromEnv: () => ({
    searchAgentName: searchMock,
  }),
  fulfilNameCheckoutFromWebhook: async () => undefined,
}));

vi.mock('@/lib/billing', async () => ({
  getBillingContext: () => ({
    stripe: { checkout: { sessions: { create: stripeCreate } }, refunds: { create: vi.fn() } },
    webhookSecret: null,
    proPerAgentPriceId: null,
  }),
}));

const { GET: SEARCH } = await import('../app/api/registrar/search/route');
const { POST: CHECKOUT } = await import('../app/api/registrar/checkout/route');
const { GET: LIST } = await import('../app/api/registrar/registrations/route');

function available(sld: string, ok = true, reason = '') {
  return { sld, domain: `${sld}.agent`, available: ok, reason, retail: { humanGems: 50, agentGems: 1, agentUsd: 0.52 }, launchPhase: 'public', landgrabMultiplier: 1, raw: {} };
}

describe('registrar routes', () => {
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    const rows = await currentDb.db.insert(tenants).values({ principalDid: PRINCIPAL }).returning({ id: tenants.id });
    currentTenantId = rows[0]!.id;
    searchMock.mockReset();
    stripeCreate.mockClear();
  });
  afterEach(async () => {
    if (currentDb) {
      await currentDb.close();
      currentDb = null;
    }
  });

  it('GET /api/registrar/search returns availability + our price, supplier-neutral', async () => {
    searchMock.mockResolvedValueOnce(available('atlas'));
    const res = await SEARCH(new Request('http://test.local/api/registrar/search?q=Atlas.agent'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      sld: 'atlas', domain: 'atlas.agent', available: true, reason: '', price_cents_per_year: 2900, max_years: 3,
    });
    expect(JSON.stringify(body)).not.toMatch(/gem|headless|0\.52/i);
  });

  it('GET /api/registrar/search rejects empty + reserved queries without calling upstream', async () => {
    const empty = await SEARCH(new Request('http://test.local/api/registrar/search?q='));
    expect(empty.status).toBe(400);
    const reserved = await SEARCH(new Request('http://test.local/api/registrar/search?q=registry'));
    expect(reserved.status).toBe(400);
    expect((await reserved.json()).error).toBe('reserved');
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('POST /api/registrar/checkout opens a registration and returns the checkout URL', async () => {
    searchMock.mockResolvedValueOnce(available('atlas'));
    const res = await CHECKOUT(
      new Request('http://test.local/api/registrar/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sld: 'atlas', years: 2 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://checkout.stripe.test/cs_route_1');
    expect(body.domain).toBe('atlas.agent');
    expect(stripeCreate).toHaveBeenCalledTimes(1);

    const list = await LIST();
    const rows = (await list.json()).registrations as Array<{ domain: string; status: string; price_cents: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ domain: 'atlas.agent', status: 'pending_payment', price_cents: 5800 });
  });

  it('POST /api/registrar/checkout surfaces name_taken as 409 with a neutral message', async () => {
    searchMock.mockResolvedValueOnce(available('atlas', false, 'Registered on 2026-04-23'));
    const res = await CHECKOUT(
      new Request('http://test.local/api/registrar/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sld: 'atlas' }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('name_taken');
    expect(JSON.stringify(body)).not.toMatch(/headless/i);
    expect(stripeCreate).not.toHaveBeenCalled();
  });
});
