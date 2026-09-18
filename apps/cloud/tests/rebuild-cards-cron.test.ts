/**
 * AgentID S5 / A6: the rebuild-cards cron re-derives and re-signs every
 * hosted identity's A2A card; `?only=missing` backfills identities minted
 * before the card existed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agents, createPgliteDb, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient, TenantDb } from '@kybernesis/arp-cloud-db';
import { A2aAgentCardSchema } from '@kybernesis/arp-spec';
import { ed25519ToJwk, multibaseEd25519ToRaw, verifyAgentCardSignature } from '@kybernesis/arp-transport';
import { eq } from 'drizzle-orm';
import { mintIdentity } from '../lib/key-custody';

process.env['CRON_SECRET'] = 'cron-test-secret';
let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
vi.mock('@/lib/db', async () => ({ getDb: async () => { if (!currentDb) throw new Error('no db'); return currentDb.db; }, resetDbForTests: async () => undefined }));

const { GET } = await import('../app/api/cron/rebuild-cards/route');
const AGENT = 'did:web:atlas.agent';
const SEAL = Uint8Array.from(Buffer.from('a'.repeat(64), 'hex'));

describe('GET /api/cron/rebuild-cards', () => {
  let tdb: TenantDb;
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    const rows = await currentDb.db.insert(tenants).values({ principalDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' }).returning({ id: tenants.id });
    tdb = withTenant(currentDb.db, toTenantId(rows[0]!.id));
    process.env['ARP_CLOUD_KEY_ENCRYPTION_KEY'] = Buffer.from(SEAL).toString('hex');
    await mintIdentity({
      tenantDb: tdb, domain: 'atlas.agent', principalDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK', agentName: 'Atlas', custody: 'cloud', runtimeKind: 'none',
      wellKnownOrigin: 'https://atlas.agent.arp.run', mirrorOrigin: 'https://atlas.agent.arp.run', sealKey: SEAL,
    });
  });
  afterEach(async () => { await currentDb?.close(); currentDb = null; });

  it('rejects without the cron secret', async () => {
    const res = await GET(new Request('http://x/api/cron/rebuild-cards'));
    expect(res.status).toBe(401);
  });

  it('backfills a missing A2A card and signs it with the identity key', async () => {
    // Simulate a pre-S5 row: no A2A card.
    await currentDb!.db.update(agents).set({ wellKnownA2aCard: null }).where(eq(agents.did, AGENT));
    expect((await tdb.getAgent(AGENT))?.wellKnownA2aCard).toBeNull();

    const res = await GET(new Request('http://x/api/cron/rebuild-cards?only=missing', { headers: { authorization: 'Bearer cron-test-secret' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, checked: 1, rebuilt: 1, signed: 1, failed: [] });

    const row = await tdb.getAgent(AGENT);
    const card = A2aAgentCardSchema.parse(row?.wellKnownA2aCard);
    expect(card.supportedInterfaces[0]?.url).toBe('https://atlas.agent.arp.run/a2a');
    const jwks = { keys: [ed25519ToJwk(multibaseEd25519ToRaw(row!.publicKeyMultibase), `${AGENT}#key-1`)] };
    expect(await verifyAgentCardSignature(card as Record<string, unknown>, jwks)).toMatchObject({ ok: true });

    // Second run with only=missing touches nothing.
    const again = await GET(new Request('http://x/api/cron/rebuild-cards?only=missing', { headers: { authorization: 'Bearer cron-test-secret' } }));
    expect(await again.json()).toMatchObject({ ok: true, checked: 1, rebuilt: 0 });
    // Full run rebuilds everything.
    const full = await GET(new Request('http://x/api/cron/rebuild-cards', { headers: { authorization: 'Bearer cron-test-secret' } }));
    expect(await full.json()).toMatchObject({ ok: true, checked: 1, rebuilt: 1, signed: 1 });
  });
});
