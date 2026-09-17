import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPgliteDb, toTenantId, withTenant, tenants, agents } from '../src/index.js';
import type { CloudDbClient } from '../src/db.js';

describe('agent_credentials + push columns (AgentID S4)', () => {
  let db: CloudDbClient;
  let close: (() => Promise<void>) | null = null;
  let t1: string;
  let t2: string;
  beforeEach(async () => {
    const built = await createPgliteDb();
    db = built.db; close = built.close;
    t1 = (await db.insert(tenants).values({ principalDid: 'did:key:z1' }).returning({ id: tenants.id }))[0]!.id;
    t2 = (await db.insert(tenants).values({ principalDid: 'did:key:z2' }).returning({ id: tenants.id }))[0]!.id;
  });
  afterEach(async () => { if (close) await close(); close = null; });

  it('creates, lists, and revokes credentials per tenant; hash is unique', async () => {
    const a = withTenant(db, toTenantId(t1));
    const b = withTenant(db, toTenantId(t2));
    const c = await a.createAgentCredential({ agentDid: 'did:web:atlas.agent', tokenHash: 'h1', label: 'eve' });
    expect(c.revokedAt).toBeNull();
    await expect(a.createAgentCredential({ agentDid: 'did:web:atlas.agent', tokenHash: 'h1' })).rejects.toThrow();
    expect((await a.listAgentCredentials('did:web:atlas.agent')).length).toBe(1);
    expect((await b.listAgentCredentials('did:web:atlas.agent')).length).toBe(0);
    expect(await b.revokeAgentCredentials('did:web:atlas.agent')).toBe(0);
    expect(await a.revokeAgentCredentials('did:web:atlas.agent')).toBe(1);
    expect((await a.listAgentCredentials('did:web:atlas.agent')).length).toBe(0);
  });

  it('stores push target on the agent and enforces push_kind values', async () => {
    const a = withTenant(db, toTenantId(t1));
    await a.createAgent({ did: 'did:web:atlas.agent', principalDid: 'did:key:z1', agentName: 'Atlas', agentDescription: '', publicKeyMultibase: 'z6Mk', handoffJson: {}, wellKnownDid: {}, wellKnownAgentCard: {}, wellKnownArp: {}, scopeCatalogVersion: 'v1', tlsFingerprint: 'cloud-hosted', keyCustody: 'cloud', runtimeKind: 'none' });
    await a.updateAgent('did:web:atlas.agent', { runtimeKind: 'push', pushUrl: 'https://atlas.vercel.app', pushKind: 'eve' });
    const row = await a.getAgent('did:web:atlas.agent');
    expect(row?.runtimeKind).toBe('push');
    expect(row?.pushUrl).toBe('https://atlas.vercel.app');
    expect(row?.pushKind).toBe('eve');
    await expect(db.update(agents).set({ pushKind: 'carrier-pigeon' as unknown as 'eve' })).rejects.toThrow();
  });
});
