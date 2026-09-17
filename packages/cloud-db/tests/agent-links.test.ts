import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPgliteDb, toTenantId, withTenant, tenants } from '../src/index.js';
import type { CloudDbClient } from '../src/db.js';

async function seedTenant(client: CloudDbClient, principalDid: string): Promise<string> {
  const rows = await client.insert(tenants).values({ principalDid }).returning({ id: tenants.id });
  return rows[0]!.id;
}

describe('agent_links (AgentID S3)', () => {
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

  it('creates pending links, verifies, revokes, and filters revoked by default', async () => {
    const tdb = withTenant(db, toTenantId(t1));
    const link = await tdb.createLink({ agentDid: 'did:web:atlas.agent', kind: 'nostr', value: 'ab'.repeat(32), label: 'Buzz', challenge: 'c1' });
    expect(link.status).toBe('pending');
    expect(link.challenge).toBe('c1');
    const verified = await tdb.updateLink(link.id, { status: 'verified', proofJson: { ok: true }, verifiedAt: new Date() });
    expect(verified?.status).toBe('verified');
    expect(verified?.proofJson).toEqual({ ok: true });
    await tdb.updateLink(link.id, { status: 'revoked', revokedAt: new Date() });
    expect(await tdb.listLinks('did:web:atlas.agent')).toEqual([]);
    expect((await tdb.listLinks('did:web:atlas.agent', { includeRevoked: true })).length).toBe(1);
  });

  it('enforces one row per (agent, kind, value) and the kind/status check constraints', async () => {
    const tdb = withTenant(db, toTenantId(t1));
    await tdb.createLink({ agentDid: 'did:web:atlas.agent', kind: 'web', value: 'https://example.com', challenge: 'c' });
    await expect(
      tdb.createLink({ agentDid: 'did:web:atlas.agent', kind: 'web', value: 'https://example.com', challenge: 'c2' }),
    ).rejects.toThrow();
    await expect(
      tdb.createLink({ agentDid: 'did:web:atlas.agent', kind: 'carrier-pigeon' as unknown as 'web', value: 'x', challenge: 'c' }),
    ).rejects.toThrow();
  });

  it('never leaks links across tenants', async () => {
    const a = withTenant(db, toTenantId(t1));
    const b = withTenant(db, toTenantId(t2));
    const link = await a.createLink({ agentDid: 'did:web:atlas.agent', kind: 'runtime', value: 'https://atlas.example', challenge: 'c' });
    expect(await b.getLink(link.id)).toBeNull();
    expect(await b.listLinks('did:web:atlas.agent')).toEqual([]);
    expect(await b.updateLink(link.id, { status: 'verified' })).toBeNull();
    expect(await b.deleteLink(link.id)).toBe(false);
    expect(await a.deleteLink(link.id)).toBe(true);
  });
});
