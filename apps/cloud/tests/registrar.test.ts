/**
 * AgentID S2 / T4 + T5: name search → checkout → fulfilment lifecycle, over a
 * real PGlite tenant DB with stubbed registry + payments collaborators.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient, TenantDb } from '@kybernesis/arp-cloud-db';
import { DidDocumentSchema } from '@kybernesis/arp-spec';
import { HeadlessError, type HeadlessClient } from '../lib/headless';
import {
  NAME_CHECKOUT_KIND,
  RegistrarError,
  fulfilNameCheckout,
  searchName,
  startNameCheckout,
  type RegistrarEnv,
} from '../lib/registrar';

const ENV: RegistrarEnv = {
  AGENTID_NAME_PRICE_CENTS: 2900,
  AGENTID_NAME_MAX_YEARS: 3,
  AGENTID_MIRROR_SUFFIX: '.agent.arp.run',
};
const SEAL_KEY = Uint8Array.from(Buffer.from('c'.repeat(64), 'hex'));
const PRINCIPAL = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

function stubHeadless(overrides: Partial<HeadlessClient> = {}): HeadlessClient {
  return {
    searchAgentName: vi.fn(async (sld: string) => ({
      sld,
      domain: `${sld}.agent`,
      available: true,
      reason: '',
      retail: { humanGems: 50, agentGems: 1, agentUsd: 0.52 },
      launchPhase: 'public',
      landgrabMultiplier: 1,
      raw: { domain: `${sld}.agent`, tld: 'agent', available: true, reason: '' },
    })),
    quote: vi.fn(async () => ({})),
    registerDomain: vi.fn(async ({ sld }: { sld: string }) => ({
      domain: `${sld}.agent`,
      headlessDomainId: '4242',
      headlessOrderId: '9001',
      status: 'active',
      expiryAt: new Date('2027-09-17T00:00:00Z'),
      graceEndsAt: new Date('2027-10-27T00:00:00Z'),
      ownerId: '77',
      raw: { domain: `${sld}.agent` },
    })),
    lookup: vi.fn(async () => null),
    myDomains: vi.fn(async () => []),
    getAgentPricing: vi.fn(async () => null),
    subscribeWebhook: vi.fn(async () => ({})),
    ...overrides,
  } as unknown as HeadlessClient;
}

function stubStripe() {
  const sessions = { create: vi.fn(async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' })) };
  const refunds = { create: vi.fn(async () => ({ id: 're_1' })) };
  return { checkout: { sessions }, refunds };
}

describe('registrar lifecycle', () => {
  let db: CloudDbClient;
  let close: (() => Promise<void>) | null = null;
  let tdb: TenantDb;
  let tenantId: string;

  beforeEach(async () => {
    const built = await createPgliteDb();
    db = built.db as unknown as CloudDbClient;
    close = built.close;
    const rows = await db.insert(tenants).values({ principalDid: PRINCIPAL }).returning({ id: tenants.id });
    tenantId = rows[0]!.id;
    tdb = withTenant(db, toTenantId(tenantId));
  });
  afterEach(async () => {
    if (close) await close();
    close = null;
  });

  it('searchName returns availability with OUR price, never the upstream price', async () => {
    const r = await searchName({ query: 'Atlas.agent', headless: stubHeadless(), env: ENV });
    expect(r).toEqual({
      sld: 'atlas',
      domain: 'atlas.agent',
      available: true,
      reason: '',
      priceCentsPerYear: 2900,
      maxYears: 3,
    });
    expect(JSON.stringify(r)).not.toMatch(/gem|headless|0\.52/i);
  });

  it('searchName maps upstream failures to neutral registry errors', async () => {
    const down = stubHeadless({
      searchAgentName: vi.fn(async () => {
        throw new HeadlessError('upstream', 'headless 500 on /search', 500);
      }),
    });
    let err: RegistrarError | null = null;
    try {
      await searchName({ query: 'atlas', headless: down, env: ENV });
    } catch (e) {
      err = e as RegistrarError;
    }
    expect(err?.code).toBe('registry_unavailable');
    expect(err?.status).toBe(503);
    expect(err?.message).not.toMatch(/headless/i);
  });

  it('startNameCheckout opens a pending registration and a one-time Stripe session', async () => {
    const stripe = stubStripe();
    const { url, registration } = await startNameCheckout({
      tenantDb: tdb,
      tenantId,
      principalDid: PRINCIPAL,
      sld: 'atlas',
      years: 2,
      headless: stubHeadless(),
      stripe,
      env: ENV,
      successUrl: 'https://cloud.test/ok',
      cancelUrl: 'https://cloud.test/cancel',
    });
    expect(url).toBe('https://checkout.stripe.test/cs_test_1');
    expect(registration.status).toBe('pending_payment');
    expect(registration.priceCents).toBe(5800);
    expect(registration.stripeCheckoutSessionId).toBe('cs_test_1');

    const params = stripe.checkout.sessions.create.mock.calls[0]![0] as {
      mode: string;
      metadata: Record<string, string>;
      line_items: Array<{ price_data: { unit_amount: number; product_data: { name: string } } }>;
    };
    expect(params.mode).toBe('payment');
    expect(params.metadata['kind']).toBe(NAME_CHECKOUT_KIND);
    expect(params.metadata['registration_id']).toBe(registration.id);
    expect(params.line_items[0]!.price_data.unit_amount).toBe(5800);
    expect(params.line_items[0]!.price_data.product_data.name).toBe('atlas.agent');
  });

  it('startNameCheckout rejects taken names, bad years, and missing payments', async () => {
    const taken = stubHeadless({
      searchAgentName: vi.fn(async (sld: string) => ({
        sld, domain: `${sld}.agent`, available: false, reason: 'Registered on 2026-04-23',
        retail: { humanGems: 50, agentGems: 1, agentUsd: 0.52 }, launchPhase: 'public', landgrabMultiplier: 1,
        raw: { domain: `${sld}.agent`, tld: 'agent', available: false, reason: 'Registered on 2026-04-23' },
      })),
    });
    const base = {
      tenantDb: tdb, tenantId, principalDid: PRINCIPAL, sld: 'atlas', years: 1,
      env: ENV, successUrl: 'https://cloud.test/ok', cancelUrl: 'https://cloud.test/cancel',
    };
    await expect(startNameCheckout({ ...base, headless: taken, stripe: stubStripe() })).rejects.toMatchObject({
      code: 'name_taken', status: 409,
    });
    await expect(startNameCheckout({ ...base, headless: stubHeadless(), stripe: stubStripe(), years: 4 })).rejects.toMatchObject({
      code: 'bad_years',
    });
    await expect(startNameCheckout({ ...base, headless: stubHeadless(), stripe: null })).rejects.toMatchObject({
      code: 'payments_not_configured', status: 503,
    });
    expect((await tdb.listRegistrations()).length).toBe(0);
  });

  it('fulfils a paid checkout: registers upstream, mints a cloud-custody identity on the mirror', async () => {
    const stripe = stubStripe();
    const headless = stubHeadless();
    const { registration } = await startNameCheckout({
      tenantDb: tdb, tenantId, principalDid: PRINCIPAL, sld: 'atlas', years: 1,
      headless, stripe, env: ENV, successUrl: 'https://x/ok', cancelUrl: 'https://x/cancel',
    });

    const outcome = await fulfilNameCheckout({
      tenantDb: tdb,
      session: {
        id: 'cs_test_1',
        payment_intent: 'pi_test_1',
        metadata: { kind: NAME_CHECKOUT_KIND, registration_id: registration.id, tenant_id: tenantId, principal_did: PRINCIPAL },
      },
      headless, stripe, sealKey: SEAL_KEY, env: ENV,
      now: () => new Date('2026-09-17T12:00:00Z'),
    });
    expect(outcome.outcome).toBe('registered');
    if (outcome.outcome !== 'registered') return;
    expect(outcome.agentDid).toBe('did:web:atlas.agent');
    expect(outcome.registration.status).toBe('registered');
    expect(outcome.registration.headlessDomainId).toBe('4242');
    expect(outcome.registration.expiryAt?.toISOString()).toBe('2027-09-17T00:00:00.000Z');
    expect(outcome.registration.stripePaymentIntentId).toBe('pi_test_1');
    expect((headless.registerDomain as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toEqual({ sld: 'atlas', years: 1 });

    const agent = await tdb.getAgent('did:web:atlas.agent');
    expect(agent?.keyCustody).toBe('cloud');
    expect(agent?.runtimeKind).toBe('none');
    expect(agent?.domainRegistrationId).toBe(registration.id);
    const doc = DidDocumentSchema.parse(agent!.wellKnownDid);
    expect(doc.service?.[0]?.serviceEndpoint).toBe('https://atlas.agent.arp.run/didcomm');
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it('is idempotent on webhook replay', async () => {
    const stripe = stubStripe();
    const headless = stubHeadless();
    const { registration } = await startNameCheckout({
      tenantDb: tdb, tenantId, principalDid: PRINCIPAL, sld: 'atlas', years: 1,
      headless, stripe, env: ENV, successUrl: 'https://x/ok', cancelUrl: 'https://x/cancel',
    });
    const session = {
      id: 'cs_test_1', payment_intent: 'pi_test_1',
      metadata: { kind: NAME_CHECKOUT_KIND, registration_id: registration.id, tenant_id: tenantId, principal_did: PRINCIPAL },
    };
    const first = await fulfilNameCheckout({ tenantDb: tdb, session, headless, stripe, sealKey: SEAL_KEY, env: ENV });
    const second = await fulfilNameCheckout({ tenantDb: tdb, session, headless, stripe, sealKey: SEAL_KEY, env: ENV });
    expect(first.outcome).toBe('registered');
    expect(second.outcome).toBe('skipped');
    expect((second as { reason: string }).reason).toBe('already_registered');
    expect((headless.registerDomain as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect((await tdb.listAgents()).length).toBe(1);
  });

  it('fails closed + refunds when the registry rejects, with a customer-safe message', async () => {
    const stripe = stubStripe();
    const headless = stubHeadless({
      registerDomain: vi.fn(async () => {
        throw new HeadlessError('name_taken', 'headless says atlas.agent is no longer available', 409);
      }),
    });
    const { registration } = await startNameCheckout({
      tenantDb: tdb, tenantId, principalDid: PRINCIPAL, sld: 'atlas', years: 1,
      headless, stripe, env: ENV, successUrl: 'https://x/ok', cancelUrl: 'https://x/cancel',
    });
    const outcome = await fulfilNameCheckout({
      tenantDb: tdb,
      session: { id: 'cs_test_1', payment_intent: { id: 'pi_test_1' }, metadata: { kind: NAME_CHECKOUT_KIND, registration_id: registration.id, tenant_id: tenantId } },
      headless, stripe, sealKey: SEAL_KEY, env: ENV,
    });
    expect(outcome.outcome).toBe('failed');
    if (outcome.outcome !== 'failed') return;
    expect(outcome.refunded).toBe(true);
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_test_1', reason: 'requested_by_customer' });
    expect(outcome.registration.status).toBe('failed');
    expect(outcome.registration.error).toBe('Registration could not be completed. Your payment has been refunded.');
    expect(outcome.registration.error).not.toMatch(/headless/i);
    expect(outcome.detail).toMatch(/name_taken/);
    expect(await tdb.getAgent('did:web:atlas.agent')).toBeNull();
  });

  it('skips sessions that are not name checkouts or reference unknown registrations', async () => {
    const r1 = await fulfilNameCheckout({
      tenantDb: tdb, session: { id: 'cs_x', metadata: { kind: 'something_else' } },
      headless: stubHeadless(), stripe: stubStripe(), sealKey: SEAL_KEY, env: ENV,
    });
    expect(r1.outcome).toBe('skipped');
    const r2 = await fulfilNameCheckout({
      tenantDb: tdb,
      session: { id: 'cs_y', metadata: { kind: NAME_CHECKOUT_KIND, registration_id: '00000000-0000-0000-0000-000000000000' } },
      headless: stubHeadless(), stripe: stubStripe(), sealKey: SEAL_KEY, env: ENV,
    });
    expect(r2.outcome).toBe('skipped');
    expect((r2 as { reason: string }).reason).toBe('unknown_registration');
  });
});
