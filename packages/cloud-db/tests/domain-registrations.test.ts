/**
 * AgentID S2 / T2: domain_registrations lifecycle + tenant isolation, and the
 * new identity-vs-runtime columns on `agents`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPgliteDb, toTenantId, withTenant, tenants, agents } from '../src/index.js';
import type { CloudDbClient } from '../src/db.js';

async function seedTenant(client: CloudDbClient, principalDid: string): Promise<string> {
  const rows = await client.insert(tenants).values({ principalDid }).returning({ id: tenants.id });
  const row = rows[0];
  if (!row) throw new Error('seed insert returned no row');
  return row.id;
}

describe('domain_registrations (AgentID S2)', () => {
  let db: CloudDbClient;
  let close: (() => Promise<void>) | null = null;
  let t1: string;
  let t2: string;

  beforeEach(async () => {
    const built = await createPgliteDb();
    db = built.db;
    close = built.close;
    t1 = await seedTenant(db, 'did:key:z6MkT1');
    t2 = await seedTenant(db, 'did:key:z6MkT2');
  });

  afterEach(async () => {
    if (close) await close();
    close = null;
  });

  it('creates a registration in pending_payment with the derived domain', async () => {
    const tdb = withTenant(db, toTenantId(t1));
    const reg = await tdb.createRegistration({ sld: 'Atlas', years: 2, priceCents: 5800 });
    expect(reg.sld).toBe('atlas');
    expect(reg.domain).toBe('atlas.agent');
    expect(reg.status).toBe('pending_payment');
    expect(reg.years).toBe(2);
    expect(reg.priceCents).toBe(5800);
    expect(reg.currency).toBe('usd');
    expect(reg.tenantId).toBe(t1);
  });

  it('walks the happy-path lifecycle and bumps updated_at', async () => {
    const tdb = withTenant(db, toTenantId(t1));
    const reg = await tdb.createRegistration({ sld: 'atlas', years: 1, priceCents: 2900 });
    const before = reg.updatedAt.getTime();

    await tdb.updateRegistration(reg.id, {
      status: 'registering',
      stripeCheckoutSessionId: 'cs_test_1',
      stripePaymentIntentId: 'pi_test_1',
    });
    const registered = await tdb.updateRegistration(reg.id, {
      status: 'registered',
      headlessDomainId: '4242',
      headlessOrderId: '9001',
      registeredAt: new Date('2026-09-17T00:00:00Z'),
      expiryAt: new Date('2027-09-17T00:00:00Z'),
      graceEndsAt: new Date('2027-10-27T00:00:00Z'),
    });
    expect(registered?.status).toBe('registered');
    expect(registered?.headlessDomainId).toBe('4242');
    await tdb.updateRegistration(reg.id, { status: 'owner_pending', ownerLabel: 'ian' });
    const active = await tdb.updateRegistration(reg.id, { status: 'active' });
    expect(active?.status).toBe('active');
    expect(active?.ownerLabel).toBe('ian');
    expect(active!.updatedAt.getTime()).toBeGreaterThanOrEqual(before);

    const byDomain = await tdb.getRegistrationByDomain('ATLAS.agent');
    expect(byDomain?.id).toBe(reg.id);
  });

  it('rejects statuses outside the lifecycle', async () => {
    const tdb = withTenant(db, toTenantId(t1));
    const reg = await tdb.createRegistration({ sld: 'atlas', years: 1, priceCents: 2900 });
    await expect(
      tdb.updateRegistration(reg.id, { status: 'bogus' as unknown as 'active' }),
    ).rejects.toThrow();
  });

  it('enforces one registration per Stripe checkout session', async () => {
    const tdb = withTenant(db, toTenantId(t1));
    await tdb.createRegistration({ sld: 'atlas', years: 1, priceCents: 2900, stripeCheckoutSessionId: 'cs_dup' });
    await expect(
      tdb.createRegistration({ sld: 'nova', years: 1, priceCents: 2900, stripeCheckoutSessionId: 'cs_dup' }),
    ).rejects.toThrow();
    // NULL session ids are not subject to the unique index.
    await tdb.createRegistration({ sld: 'nova', years: 1, priceCents: 2900 });
    await tdb.createRegistration({ sld: 'mythos', years: 1, priceCents: 2900 });
    expect((await tdb.listRegistrations()).length).toBe(3);
  });

  it('never leaks registrations across tenants', async () => {
    const a = withTenant(db, toTenantId(t1));
    const b = withTenant(db, toTenantId(t2));
    const reg = await a.createRegistration({ sld: 'atlas', years: 1, priceCents: 2900 });

    expect(await b.getRegistration(reg.id)).toBeNull();
    expect(await b.getRegistrationByDomain('atlas.agent')).toBeNull();
    expect(await b.listRegistrations()).toEqual([]);
    expect(await b.updateRegistration(reg.id, { status: 'failed', error: 'nope' })).toBeNull();

    const still = await a.getRegistration(reg.id);
    expect(still?.status).toBe('pending_payment');
    expect(still?.error).toBeNull();
  });
});

describe('agents identity/runtime columns (AgentID S2)', () => {
  let db: CloudDbClient;
  let close: (() => Promise<void>) | null = null;
  let t1: string;

  beforeEach(async () => {
    const built = await createPgliteDb();
    db = built.db;
    close = built.close;
    t1 = await seedTenant(db, 'did:key:z6MkT1');
  });
  afterEach(async () => {
    if (close) await close();
    close = null;
  });

  const baseAgent = {
    did: 'did:web:atlas.agent',
    principalDid: 'did:key:z6MkT1',
    agentName: 'Atlas',
    agentDescription: '',
    publicKeyMultibase: 'z6MkAtlas',
    handoffJson: {},
    wellKnownDid: {},
    wellKnownAgentCard: {},
    wellKnownArp: {},
    scopeCatalogVersion: 'v1',
    tlsFingerprint: 'cloud-hosted',
  };

  it('defaults existing-style rows to exported custody + bridge runtime', async () => {
    const tdb = withTenant(db, toTenantId(t1));
    const row = await tdb.createAgent(baseAgent);
    expect(row.keyCustody).toBe('exported');
    expect(row.privateKeyEnc).toBeNull();
    expect(row.runtimeKind).toBe('bridge');
    expect(row.domainRegistrationId).toBeNull();
  });

  it('stores a cloud-custody identity with no runtime and links the registration', async () => {
    const tdb = withTenant(db, toTenantId(t1));
    const reg = await tdb.createRegistration({ sld: 'atlas', years: 1, priceCents: 2900 });
    const row = await tdb.createAgent({
      ...baseAgent,
      keyCustody: 'cloud',
      privateKeyEnc: 'v1:aXY:dGFn:Y3Q',
      runtimeKind: 'none',
      domainRegistrationId: reg.id,
    });
    expect(row.keyCustody).toBe('cloud');
    expect(row.runtimeKind).toBe('none');
    expect(row.domainRegistrationId).toBe(reg.id);

    // Export flips custody and wipes the sealed seed.
    await tdb.updateAgent(row.did, { keyCustody: 'exported', privateKeyEnc: null });
    const after = await tdb.getAgent(row.did);
    expect(after?.keyCustody).toBe('exported');
    expect(after?.privateKeyEnc).toBeNull();
  });

  it('rejects unknown custody / runtime values at the DB boundary', async () => {
    await expect(
      db.insert(agents).values({
        ...baseAgent,
        tenantId: t1,
        keyCustody: 'someone-else' as unknown as 'cloud',
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(agents).values({
        ...baseAgent,
        did: 'did:web:nova.agent',
        tenantId: t1,
        runtimeKind: 'telepathy' as unknown as 'none',
      }),
    ).rejects.toThrow();
  });
});
