/** AgentID S3 / L3: link routes over PGlite with a real nostr signature. */

import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schnorr } from '@noble/curves/secp256k1';
import { createPgliteDb, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient, TenantDb } from '@kybernesis/arp-cloud-db';
import { mintIdentity } from '../lib/key-custody';

process.env['ARP_CLOUD_SESSION_SECRET'] = process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
let tenantId = '';
const PRINCIPAL = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

vi.mock('@/lib/db', async () => ({
  getDb: async () => { if (!currentDb) throw new Error('no db'); return currentDb.db; },
  resetDbForTests: async () => undefined,
}));
vi.mock('@/lib/session', async () => ({
  getSession: async () => ({ principalDid: PRINCIPAL, tenantId }),
  SESSION_COOKIE: 'arp_cloud_session',
}));

const { GET: LIST, POST: CREATE } = await import('../app/api/names/[sld]/links/route');
const { POST: VERIFY } = await import('../app/api/names/[sld]/links/[id]/verify/route');
const { DELETE: REMOVE } = await import('../app/api/names/[sld]/links/[id]/route');

const p = (sld: string, id?: string) => ({ params: Promise.resolve(id ? { sld, id } : { sld }) }) as never;
const json = (body: unknown) => new Request('http://t.local/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function signNostr(priv: Uint8Array, content: string) {
  const pubkey = Buffer.from(schnorr.getPublicKey(priv)).toString('hex');
  const created_at = 1_700_000_000; const kind = 27235; const tags: string[][] = [];
  const id = createHash('sha256').update(JSON.stringify([0, pubkey, created_at, kind, tags, content])).digest('hex');
  return { id, pubkey, created_at, kind, tags, content, sig: Buffer.from(schnorr.sign(id, priv)).toString('hex') };
}

describe('link routes', () => {
  let tdb: TenantDb;
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    const rows = await currentDb.db.insert(tenants).values({ principalDid: PRINCIPAL }).returning({ id: tenants.id });
    tenantId = rows[0]!.id;
    tdb = withTenant(currentDb.db, toTenantId(tenantId));
    await mintIdentity({ tenantDb: tdb, domain: 'atlas.agent', principalDid: PRINCIPAL, agentName: 'Atlas', custody: 'cloud', runtimeKind: 'none', wellKnownOrigin: 'https://atlas.agent.arp.run', mirrorOrigin: 'https://atlas.agent.arp.run', sealKey: Uint8Array.from(Buffer.from('a'.repeat(64), 'hex')) });
  });
  afterEach(async () => { if (currentDb) await currentDb.close(); currentDb = null; });

  it('adds a nostr link, verifies it with a signed event, reflects it in the DID doc, then revokes', async () => {
    const priv = schnorr.utils.randomPrivateKey();
    const hex = Buffer.from(schnorr.getPublicKey(priv)).toString('hex');
    const created = await CREATE(json({ kind: 'nostr', value: hex, label: 'Buzz' }), p('atlas'));
    expect(created.status).toBe(201);
    const { link } = await created.json();
    expect(link.status).toBe('pending');
    expect(link.display.startsWith('npub1')).toBe(true);
    expect(link.challenge_string).toBe(`agentid-link:did:web:atlas.agent:${link.challenge}`);

    const bad = await VERIFY(json({ proof: signNostr(priv, 'wrong') }), p('atlas', link.id));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('proof_mismatch');

    const ok = await VERIFY(json({ proof: signNostr(priv, link.challenge_string) }), p('atlas', link.id));
    expect(ok.status).toBe(200);
    expect((await ok.json()).link.status).toBe('verified');
    const agent = await tdb.getAgent('did:web:atlas.agent');
    expect((agent!.wellKnownDid as { alsoKnownAs: string[] }).alsoKnownAs).toContain(`nostr:${link.display}`);

    const listed = await (await LIST(new Request('http://t.local/x'), p('atlas'))).json();
    expect(listed.links).toHaveLength(1);
    expect(listed.links[0].challenge).toBeNull();

    const removed = await REMOVE(new Request('http://t.local/x', { method: 'DELETE' }), p('atlas', link.id));
    expect(removed.status).toBe(200);
    expect((await (await LIST(new Request('http://t.local/x'), p('atlas'))).json()).links).toEqual([]);
    const after = await tdb.getAgent('did:web:atlas.agent');
    expect((after!.wellKnownDid as { alsoKnownAs?: string[] }).alsoKnownAs ?? []).not.toContain(`nostr:${link.display}`);
  });

  it('rejects bad values, unknown names, and other tenants’ links', async () => {
    const bad = await CREATE(json({ kind: 'web', value: 'ftp://x' }), p('atlas'));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('invalid_value');
    const unknown = await CREATE(json({ kind: 'web', value: 'https://x.example' }), p('nobody'));
    expect(unknown.status).toBe(404);
    const other = await REMOVE(new Request('http://t.local/x', { method: 'DELETE' }), p('atlas', '00000000-0000-0000-0000-000000000000'));
    expect(other.status).toBe(404);
  });
});
