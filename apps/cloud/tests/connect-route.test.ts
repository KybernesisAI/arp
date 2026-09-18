/** AgentID S6a: one-click connect from the console (gateway exchange mocked). */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient, TenantDb } from '@kybernesis/arp-cloud-db';
import { mintIdentity } from '../lib/key-custody';

process.env['ARP_CLOUD_SESSION_SECRET'] = process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';
process.env['ARP_CLOUD_PUSH_ISSUER'] = 'http://gateway.test';
let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
let tenantId = '';
const PRINCIPAL = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
vi.mock('@/lib/db', async () => ({ getDb: async () => { if (!currentDb) throw new Error('no db'); return currentDb.db; }, resetDbForTests: async () => undefined }));
vi.mock('@/lib/session', async () => ({ getSession: async () => ({ principalDid: PRINCIPAL, tenantId }), SESSION_COOKIE: 'arp_cloud_session' }));

const { POST, runtimeUrlFrom } = await import('../app/api/agents/[did]/connect/route');
const AGENT = 'did:web:atlas.agent';
const post = (body: unknown) => POST(new Request('http://t.local/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ did: AGENT }) });

describe('runtimeUrlFrom', () => {
  it('turns what an owner types into the add-on URL', () => {
    expect(runtimeUrlFrom('my-agent.example.com')).toBe('https://my-agent.example.com/eve/v1/arp');
    expect(runtimeUrlFrom('https://kyber.exe.xyz/')).toBe('https://kyber.exe.xyz/eve/v1/arp');
    expect(runtimeUrlFrom('https://kyber.exe.xyz/eve/v1/arp')).toBe('https://kyber.exe.xyz/eve/v1/arp');
    expect(runtimeUrlFrom('https://host.example/agents/bob?x=1#y')).toBe('https://host.example/agents/bob/eve/v1/arp');
  });
});

describe('POST /api/agents/[did]/connect', () => {
  let tdb: TenantDb;
  const realFetch = globalThis.fetch;
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    tenantId = (await currentDb.db.insert(tenants).values({ principalDid: PRINCIPAL }).returning({ id: tenants.id }))[0]!.id;
    tdb = withTenant(currentDb.db, toTenantId(tenantId));
    process.env['ARP_CLOUD_KEY_ENCRYPTION_KEY'] = 'a'.repeat(64);
    await mintIdentity({ tenantDb: tdb, domain: 'atlas.agent', principalDid: PRINCIPAL, agentName: 'Atlas', custody: 'cloud', runtimeKind: 'none', wellKnownOrigin: 'https://atlas.agent.arp.run', mirrorOrigin: 'https://atlas.agent.arp.run', sealKey: Uint8Array.from(Buffer.from('a'.repeat(64), 'hex')) });
  });
  afterEach(async () => { globalThis.fetch = realFetch; if (currentDb) await currentDb.close(); currentDb = null; });

  it('creates a link + ticket, hands the ticket to the gateway, and reports connected', async () => {
    const seen: { url?: string; ticketId?: string } = {};
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.url = String(input);
      seen.ticketId = (JSON.parse(String(init?.body)) as { ticket_id: string }).ticket_id;
      // The gateway would have verified the runtime by now; emulate its side effects.
      const t = await tdb.getConnectTicket(seen.ticketId);
      await tdb.updateAgent(AGENT, { runtimeKind: 'push', pushUrl: new URL(t!.url).origin, pushKind: 'eve' });
      if (t?.linkId) await tdb.updateLink(t.linkId, { status: 'verified', verifiedAt: new Date() });
      return new Response(JSON.stringify({ result: 'connected', message: 'Connected. Your agent now answers to this name.', store: 'file', did: AGENT, url: t?.url }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const res = await post({ url: 'kyber.exe.xyz' });
    const body = (await res.json()) as { ok: boolean; result: string; push_url: string; url: string };
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, result: 'connected', push_url: 'https://kyber.exe.xyz', url: 'https://kyber.exe.xyz/eve/v1/arp' });
    expect(seen.url).toBe('http://gateway.test/internal/connect');
    const ticket = await tdb.getConnectTicket(seen.ticketId!);
    expect(ticket).toMatchObject({ agentDid: AGENT, url: 'https://kyber.exe.xyz/eve/v1/arp' });
    expect(ticket?.linkId).toBeTruthy();
    // The name's public document now carries the runtime service.
    const doc = (await tdb.getAgent(AGENT))?.wellKnownDid as { service: Array<{ type: string; serviceEndpoint: string }> };
    expect(doc.service.find((s) => s.type === 'AgentRuntime')?.serviceEndpoint).toBe('https://kyber.exe.xyz/eve/v1/arp');
  });

  it('passes the gateway’s owner-grade outcome through, and refuses exported keys and bad addresses', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ result: 'not_arp_ready', message: 'Your agent is online but does not have the agent-network add-on yet.' }), { status: 424, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    const res = await post({ url: 'https://plain.example' });
    expect(res.status).toBe(424);
    expect(await res.json()).toMatchObject({ ok: false, result: 'not_arp_ready' });

    expect((await post({ url: 'not a url at all' })).status).toBe(400);

    await tdb.updateAgent(AGENT, { keyCustody: 'exported', privateKeyEnc: null });
    const exported = await post({ url: 'https://kyber.exe.xyz' });
    expect(exported.status).toBe(409);
    expect(await exported.json()).toMatchObject({ result: 'key_exported' });
  });

  it('answers 503 in plain words when the gateway is unreachable', async () => {
    globalThis.fetch = (async () => { throw new Error('ECONNREFUSED'); }) as typeof fetch;
    const res = await post({ url: 'https://kyber.exe.xyz' });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { message: string }).message).toMatch(/try again/i);
  });
});
