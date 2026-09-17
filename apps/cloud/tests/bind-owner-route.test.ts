/**
 * AgentID S2 / T6: self-hosted owner binding. A real Ed25519 signature over
 * a representation JWT is required; claims must bind this tenant's principal
 * (or cloud alias) to this tenant's name.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { createPgliteDb, registrarBindings, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { base64urlEncode, ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { eq } from 'drizzle-orm';

process.env['ARP_CLOUD_SESSION_SECRET'] = process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'test-session-secret-abcdefghij';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
let tenantId = '';
const PRINCIPAL = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

vi.mock('@/lib/db', async () => ({
  getDb: async () => {
    if (!currentDb) throw new Error('no db');
    return currentDb.db;
  },
  resetDbForTests: async () => undefined,
}));
vi.mock('@/lib/session', async () => ({
  getSession: async () => ({ principalDid: PRINCIPAL, tenantId }),
  SESSION_COOKIE: 'arp_cloud_session',
}));

const { POST } = await import('../app/api/registrar/bind-owner/route');

async function signJwt(priv: Uint8Array, claims: Record<string, unknown>): Promise<string> {
  const enc = (o: unknown) => base64urlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const h = enc({ alg: 'EdDSA', typ: 'JWT' });
  const p = enc(claims);
  const sig = await ed25519.signAsync(new TextEncoder().encode(`${h}.${p}`), priv);
  return `${h}.${p}.${base64urlEncode(sig)}`;
}

function req(body: unknown): Request {
  return new Request('http://test.local/api/registrar/bind-owner', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/registrar/bind-owner', () => {
  let priv: Uint8Array;
  let pubMb: string;

  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    const rows = await currentDb.db.insert(tenants).values({ principalDid: PRINCIPAL }).returning({ id: tenants.id });
    tenantId = rows[0]!.id;
    priv = ed25519.utils.randomPrivateKey();
    pubMb = ed25519RawToMultibase(await ed25519.getPublicKeyAsync(priv));
    // A registered (paid) name on this tenant.
    const tdb = withTenant(currentDb.db, toTenantId(tenantId));
    const reg = await tdb.createRegistration({ sld: 'atlas', years: 1, priceCents: 2900 });
    await tdb.updateRegistration(reg.id, { status: 'registered' });
  });
  afterEach(async () => {
    if (currentDb) await currentDb.close();
    currentDb = null;
  });

  it('binds the owner with a valid signature + claims and activates the registration', async () => {
    const jwt = await signJwt(priv, { iss: `did:web:cloud.arp.run:u:${tenantId}`, sub: 'did:web:atlas.agent', iat: 1, exp: 2 });
    const res = await POST(req({ domain: 'atlas.agent', owner_label: 'ian', public_key_multibase: pubMb, signed_representation_jwt: jwt }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, domain: 'atlas.agent', owner_label: 'ian', status: 'active' });

    const rows = await currentDb!.db.select().from(registrarBindings).where(eq(registrarBindings.domain, 'atlas.agent'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ registrar: 'agentid', ownerLabel: 'ian', tenantId, representationJwt: jwt });
    const tdb = withTenant(currentDb!.db, toTenantId(tenantId));
    expect((await tdb.getRegistrationByDomain('atlas.agent'))?.status).toBe('active');
  });

  it('is idempotent on (domain, owner_label): a re-bind overwrites the JWT', async () => {
    const iss = `did:web:cloud.arp.run:u:${tenantId}`;
    const a = await signJwt(priv, { iss, sub: 'did:web:atlas.agent', iat: 1 });
    const b = await signJwt(priv, { iss, sub: 'did:web:atlas.agent', iat: 2 });
    await POST(req({ domain: 'atlas.agent', public_key_multibase: pubMb, signed_representation_jwt: a }));
    const res = await POST(req({ domain: 'atlas.agent', public_key_multibase: pubMb, signed_representation_jwt: b }));
    expect(res.status).toBe(200);
    const rows = await currentDb!.db.select().from(registrarBindings).where(eq(registrarBindings.domain, 'atlas.agent'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.representationJwt).toBe(b);
    expect(rows[0]?.ownerLabel).toBe('owner');
  });

  it('rejects a bad signature, mismatched claims, and names not on the account', async () => {
    const iss = `did:web:cloud.arp.run:u:${tenantId}`;
    const other = ed25519.utils.randomPrivateKey();
    const forged = await signJwt(other, { iss, sub: 'did:web:atlas.agent' });
    const bad = await POST(req({ domain: 'atlas.agent', public_key_multibase: pubMb, signed_representation_jwt: forged }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('bad_signature');

    const wrongSub = await signJwt(priv, { iss, sub: 'did:web:nova.agent' });
    const mismatch = await POST(req({ domain: 'atlas.agent', public_key_multibase: pubMb, signed_representation_jwt: wrongSub }));
    expect(mismatch.status).toBe(400);
    expect((await mismatch.json()).error).toBe('jwt_claims_mismatch');

    const foreignIss = await signJwt(priv, { iss: 'did:web:cloud.arp.run:u:00000000-0000-0000-0000-000000000000', sub: 'did:web:atlas.agent' });
    const foreign = await POST(req({ domain: 'atlas.agent', public_key_multibase: pubMb, signed_representation_jwt: foreignIss }));
    expect(foreign.status).toBe(400);

    const notMine = await signJwt(priv, { iss, sub: 'did:web:nova.agent' });
    const res = await POST(req({ domain: 'nova.agent', public_key_multibase: pubMb, signed_representation_jwt: notMine }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_your_name');
    expect(JSON.stringify(await (await POST(req({ domain: 'nova.agent', public_key_multibase: pubMb, signed_representation_jwt: notMine }))).json())).not.toMatch(/headless/i);
  });
});
