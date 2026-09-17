/** AgentID S4 / P6: attach + detach a runtime (verification fetch stubbed). */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient, TenantDb } from '@kybernesis/arp-cloud-db';
import { mintIdentity } from '../lib/key-custody';

process.env['ARP_CLOUD_SESSION_SECRET'] = process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';
let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
let tenantId = '';
const PRINCIPAL = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
vi.mock('@/lib/db', async () => ({ getDb: async () => { if (!currentDb) throw new Error('no db'); return currentDb.db; }, resetDbForTests: async () => undefined }));
vi.mock('@/lib/session', async () => ({ getSession: async () => ({ principalDid: PRINCIPAL, tenantId }), SESSION_COOKIE: 'arp_cloud_session' }));

const { POST, DELETE } = await import('../app/api/agents/[did]/runtime/route');
const AGENT = 'did:web:atlas.agent';
const p = { params: Promise.resolve({ did: AGENT }) };
const json = (b: unknown) => new Request('http://t.local/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

describe('POST/DELETE /api/agents/[did]/runtime', () => {
  let tdb: TenantDb;
  const realFetch = globalThis.fetch;
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    tenantId = (await currentDb.db.insert(tenants).values({ principalDid: PRINCIPAL }).returning({ id: tenants.id }))[0]!.id;
    tdb = withTenant(currentDb.db, toTenantId(tenantId));
    await mintIdentity({ tenantDb: tdb, domain: 'atlas.agent', principalDid: PRINCIPAL, agentName: 'Atlas', custody: 'cloud', runtimeKind: 'none', wellKnownOrigin: 'https://atlas.agent.arp.run', mirrorOrigin: 'https://atlas.agent.arp.run', sealKey: Uint8Array.from(Buffer.from('a'.repeat(64), 'hex')) });
  });
  afterEach(async () => { globalThis.fetch = realFetch; if (currentDb) await currentDb.close(); currentDb = null; });

  it('fails with the expected challenge when the runtime does not serve the doc, then attaches once it does', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    const first = await POST(json({ url: 'https://atlas.vercel.app/eve/v1/arp', kind: 'eve' }), p);
    expect(first.status).toBe(400);
    const b1 = (await first.json()) as { error: string; expected: { did: string; challenge: string }; verification_url: string };
    expect(b1.error).toBe('proof_mismatch');
    expect(b1.expected.did).toBe(AGENT);
    expect(b1.verification_url).toBe('https://atlas.vercel.app/eve/v1/arp/.well-known/agentid-verification');

    globalThis.fetch = (async (input: RequestInfo | URL) =>
      String(input).endsWith('/.well-known/agentid-verification')
        ? new Response(JSON.stringify({ did: AGENT, challenge: b1.expected.challenge }), { status: 200 })
        : new Response('', { status: 404 })) as unknown as typeof fetch;
    const second = await POST(json({ url: 'https://atlas.vercel.app/eve/v1/arp', kind: 'eve' }), p);
    expect(second.status).toBe(200);
    const b2 = (await second.json()) as { credential: string; push_url: string; env: Record<string, string> };
    expect(b2.push_url).toBe('https://atlas.vercel.app');
    expect(b2.credential.length).toBeGreaterThan(30);
    expect(b2.env['ARP_AGENT_DID']).toBe(AGENT);
    expect(b2.env['AGENTID_CHALLENGE']).toBe(b1.expected.challenge);

    const agent = await tdb.getAgent(AGENT);
    expect(agent?.runtimeKind).toBe('push');
    expect(agent?.pushKind).toBe('eve');
    expect((await tdb.listAgentCredentials(AGENT)).length).toBe(1);
    const doc = agent!.wellKnownDid as { service: Array<{ type: string; serviceEndpoint: string }> };
    expect(doc.service.find((s) => s.type === 'AgentRuntime')?.serviceEndpoint).toBe('https://atlas.vercel.app/eve/v1/arp');

    // Re-attach rotates the credential (old revoked).
    const third = await POST(json({ url: 'https://atlas.vercel.app/eve/v1/arp', kind: 'eve' }), p);
    expect(third.status).toBe(200);
    expect((await tdb.listAgentCredentials(AGENT)).length).toBe(1);

    const gone = await DELETE(new Request('http://t.local/x', { method: 'DELETE' }), p);
    expect(gone.status).toBe(200);
    const after = await tdb.getAgent(AGENT);
    expect(after?.runtimeKind).toBe('none');
    expect(after?.pushUrl).toBeNull();
    expect((await tdb.listAgentCredentials(AGENT)).length).toBe(0);
    expect((await tdb.listLinks(AGENT)).filter((l) => l.kind === 'runtime')).toEqual([]);
  });

  it('refuses exported-custody identities and bad URLs', async () => {
    await tdb.updateAgent(AGENT, { keyCustody: 'exported', privateKeyEnc: null });
    const res = await POST(json({ url: 'https://x.example/eve/v1/arp' }), p);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('key_exported');
    await tdb.updateAgent(AGENT, { keyCustody: 'cloud', privateKeyEnc: 'v1:a:b:c' });
    const bad = await POST(json({ url: 'not a url' }), p);
    expect(bad.status).toBe(400);
  });
});
