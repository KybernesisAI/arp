/** AgentID S6a: single-use connect tickets, tenant-scoped. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPgliteDb, tenants, toTenantId, withTenant, agentConnectTickets } from '../src/index.js';
import type { CloudDbClient, TenantDb } from '../src/index.js';
import { eq } from 'drizzle-orm';

describe('agent connect tickets', () => {
  let db: CloudDbClient;
  let close: (() => Promise<void>) | null = null;
  let a: TenantDb;
  let b: TenantDb;
  beforeEach(async () => {
    const built = await createPgliteDb();
    db = built.db as unknown as CloudDbClient;
    close = built.close;
    const [t1, t2] = await db.insert(tenants).values([{ principalDid: 'did:key:z1' }, { principalDid: 'did:key:z2' }]).returning({ id: tenants.id });
    a = withTenant(db, toTenantId(t1!.id));
    b = withTenant(db, toTenantId(t2!.id));
  });
  afterEach(async () => { if (close) await close(); close = null; });

  it('creates a ticket with a 5-minute default expiry and reads it back only within its tenant', async () => {
    const before = Date.now();
    const t = await a.createConnectTicket({ agentDid: 'did:web:atlas.agent', url: 'https://atlas.example/eve/v1/arp' });
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(t.usedAt).toBeNull();
    expect(t.expiresAt.getTime() - before).toBeGreaterThan(4 * 60_000);
    expect(t.expiresAt.getTime() - before).toBeLessThanOrEqual(5 * 60_000 + 1000);
    expect((await a.getConnectTicket(t.id))?.url).toBe('https://atlas.example/eve/v1/arp');
    expect(await b.getConnectTicket(t.id)).toBeNull();
  });

  it('is marked used by the gateway with a result', async () => {
    const t = await a.createConnectTicket({ agentDid: 'did:web:atlas.agent', url: 'https://atlas.example/eve/v1/arp', ttlMs: 1000 });
    await db.update(agentConnectTickets).set({ usedAt: new Date(), result: 'connected' }).where(eq(agentConnectTickets.id, t.id));
    const after = await a.getConnectTicket(t.id);
    expect(after?.result).toBe('connected');
    expect(after?.usedAt).not.toBeNull();
  });
});
