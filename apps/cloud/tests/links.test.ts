/**
 * AgentID S3 / L2: link value normalization, per-kind proof verification,
 * and DID-document rebuild from verified links.
 */

import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schnorr } from '@noble/curves/secp256k1';
import { SignJWT, exportJWK, generateKeyPair, importJWK, jwtVerify } from 'jose';
import { createPgliteDb, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient, TenantDb } from '@kybernesis/arp-cloud-db';
import { DidDocumentSchema } from '@kybernesis/arp-spec';
import { mintIdentity } from '../lib/key-custody';
import {
  LinkError,
  alsoKnownAsFor,
  challengeString,
  makeChallenge,
  normalizeLinkValue,
  normalizeNostrPubkey,
  npubFromHex,
  rebuildWellKnown,
  verifyFetchedLinkProof,
  verifyKybernesisLinkProof,
  verifyNostrLinkProof,
  type NostrEvent,
} from '../lib/links';

const AGENT = 'did:web:atlas.agent';

function signNostr(priv: Uint8Array, content: string, kind = 27235): NostrEvent {
  const pubkey = Buffer.from(schnorr.getPublicKey(priv)).toString('hex');
  const created_at = Math.floor(Date.now() / 1000);
  const tags: string[][] = [['u', 'https://agent.arp.run']];
  const id = createHash('sha256').update(JSON.stringify([0, pubkey, created_at, kind, tags, content])).digest('hex');
  const sig = Buffer.from(schnorr.sign(id, priv)).toString('hex');
  return { id, pubkey, created_at, kind, tags, content, sig };
}

describe('value normalization', () => {
  it('accepts npub and hex for nostr and round-trips', () => {
    const priv = schnorr.utils.randomPrivateKey();
    const hex = Buffer.from(schnorr.getPublicKey(priv)).toString('hex');
    const npub = npubFromHex(hex);
    expect(npub.startsWith('npub1')).toBe(true);
    expect(normalizeNostrPubkey(npub)).toBe(hex);
    expect(normalizeNostrPubkey(hex.toUpperCase())).toBe(hex);
    expect(() => normalizeNostrPubkey('npub1notreal')).toThrow(LinkError);
    expect(() => normalizeNostrPubkey('nope')).toThrow(/npub/);
  });
  it('validates kybernesis handles and https URLs', () => {
    expect(normalizeLinkValue('kybernesis', ' agent:kybernesis/samantha ')).toBe('agent:kybernesis/samantha');
    expect(() => normalizeLinkValue('kybernesis', 'samantha')).toThrow(LinkError);
    expect(normalizeLinkValue('web', 'https://Example.com/path?x=1#h')).toBe('https://example.com');
    expect(normalizeLinkValue('runtime', 'https://atlas.vercel.app/eve/v1/')).toBe('https://atlas.vercel.app/eve/v1');
    expect(() => normalizeLinkValue('web', 'http://example.com')).toThrow(/https/);
    expect(() => normalizeLinkValue('web', 'not a url')).toThrow(LinkError);
  });
  it('mints distinct challenges and builds the challenge string', () => {
    expect(makeChallenge()).not.toBe(makeChallenge());
    expect(challengeString(AGENT, 'abc')).toBe('agentid-link:did:web:atlas.agent:abc');
  });
});

describe('nostr proof', () => {
  const priv = schnorr.utils.randomPrivateKey();
  const hex = Buffer.from(schnorr.getPublicKey(priv)).toString('hex');
  const link = { agentDid: AGENT, value: hex, challenge: 'c-1' };

  it('accepts a correctly signed event with the challenge as content (object or JSON string)', () => {
    const ev = signNostr(priv, challengeString(AGENT, 'c-1'));
    expect(verifyNostrLinkProof(link, ev).pubkey).toBe(hex);
    expect(verifyNostrLinkProof(link, JSON.stringify(ev)).id).toBe(ev.id);
  });
  it('rejects wrong key, wrong content, tampered id/sig, and garbage', () => {
    const other = schnorr.utils.randomPrivateKey();
    expect(() => verifyNostrLinkProof(link, signNostr(other, challengeString(AGENT, 'c-1')))).toThrow(/different key/);
    expect(() => verifyNostrLinkProof(link, signNostr(priv, challengeString(AGENT, 'c-2')))).toThrow(/challenge/);
    const ev = signNostr(priv, challengeString(AGENT, 'c-1'));
    expect(() => verifyNostrLinkProof(link, { ...ev, content: ev.content + ' ' })).toThrow(/could not be verified/);
    expect(() => verifyNostrLinkProof(link, { ...ev, sig: 'ab'.repeat(64) })).toThrow(/could not be verified/);
    expect(() => verifyNostrLinkProof(link, 'not json')).toThrow(LinkError);
    expect(() => verifyNostrLinkProof(link, null)).toThrow(/Paste/);
  });
});

describe('kybernesis proof', () => {
  const link = { agentDid: AGENT, value: 'agent:kybernesis/atlas', challenge: 'c-9' };

  async function issue(claims: Record<string, unknown>, iss = 'https://agent.kybernesis.ai') {
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const jws = await new SignJWT(claims).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuer(iss).setIssuedAt().setExpirationTime('10m').sign(privateKey);
    const jwk = await exportJWK(publicKey);
    const verifyImpl = async (token: string) => {
      const key = await importJWK(jwk, 'ES256');
      const { payload } = await jwtVerify(token, key);
      return payload as Record<string, unknown>;
    };
    return { jws, verifyImpl, privateKey };
  }

  it('accepts a statement from an allowed issuer with matching sub/did/challenge', async () => {
    const { jws, verifyImpl } = await issue({ sub: link.value, did: AGENT, challenge: 'c-9' });
    const claims = await verifyKybernesisLinkProof(link, jws, { verifyImpl });
    expect(claims['sub']).toBe(link.value);
  });
  it('rejects unknown issuers, mismatched claims, bad signatures, and non-JWS input', async () => {
    const { jws } = await issue({ sub: link.value, did: AGENT, challenge: 'c-9' }, 'https://evil.example');
    await expect(verifyKybernesisLinkProof(link, jws, { verifyImpl: async () => ({}) })).rejects.toMatchObject({ code: 'issuer_not_allowed' });
    const wrong = await issue({ sub: 'agent:kybernesis/other', did: AGENT, challenge: 'c-9' });
    await expect(verifyKybernesisLinkProof(link, wrong.jws, { verifyImpl: wrong.verifyImpl })).rejects.toMatchObject({ code: 'proof_mismatch' });
    const good = await issue({ sub: link.value, did: AGENT, challenge: 'c-9' });
    const other = await issue({ sub: link.value, did: AGENT, challenge: 'c-9' });
    await expect(verifyKybernesisLinkProof(link, good.jws, { verifyImpl: other.verifyImpl })).rejects.toMatchObject({ code: 'proof_invalid' });
    await expect(verifyKybernesisLinkProof(link, 'nope', {})).rejects.toMatchObject({ code: 'proof_missing' });
  });
});

describe('runtime / web proof', () => {
  const runtime = { agentDid: AGENT, value: 'https://atlas.example/eve/v1', challenge: 'c-3', kind: 'runtime' as const };
  const web = { agentDid: AGENT, value: 'https://atlas.example', challenge: 'c-3', kind: 'web' as const };
  const fetchWith = (routes: Record<string, { status: number; body: string }>) =>
    (async (input: RequestInfo | URL) => {
      const url = String(input);
      const r = routes[url] ?? { status: 404, body: '' };
      return new Response(r.body, { status: r.status });
    }) as unknown as typeof fetch;

  it('accepts the verification document at the well-known path', async () => {
    const f = fetchWith({ 'https://atlas.example/eve/v1/.well-known/agentid-verification': { status: 200, body: JSON.stringify({ did: AGENT, challenge: 'c-3' }) } });
    const r = await verifyFetchedLinkProof(runtime, f);
    expect(r['source']).toContain('agentid-verification');
  });
  it('falls back to the meta tag for web origins and rejects mismatches / unreachable', async () => {
    const f = fetchWith({ 'https://atlas.example/': { status: 200, body: `<html><head><meta name="agentid" content="${AGENT}:c-3"></head></html>` } });
    expect((await verifyFetchedLinkProof(web, f))['meta']).toBe(`${AGENT}:c-3`);
    const wrong = fetchWith({ 'https://atlas.example/.well-known/agentid-verification': { status: 200, body: JSON.stringify({ did: AGENT, challenge: 'other' }) } });
    await expect(verifyFetchedLinkProof(web, wrong)).rejects.toMatchObject({ code: 'proof_mismatch' });
    const down = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    await expect(verifyFetchedLinkProof(runtime, down)).rejects.toMatchObject({ code: 'unreachable' });
  });
});

describe('rebuildWellKnown', () => {
  let db: CloudDbClient;
  let close: (() => Promise<void>) | null = null;
  let tdb: TenantDb;
  const principalDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
  beforeEach(async () => {
    const built = await createPgliteDb();
    db = built.db as unknown as CloudDbClient;
    close = built.close;
    const rows = await db.insert(tenants).values({ principalDid }).returning({ id: tenants.id });
    tdb = withTenant(db, toTenantId(rows[0]!.id));
    await mintIdentity({
      tenantDb: tdb, domain: 'atlas.agent', principalDid, agentName: 'Atlas', custody: 'cloud', runtimeKind: 'none',
      wellKnownOrigin: 'https://atlas.agent.arp.run', mirrorOrigin: 'https://atlas.agent.arp.run',
      sealKey: Uint8Array.from(Buffer.from('a'.repeat(64), 'hex')),
    });
  });
  afterEach(async () => { if (close) await close(); close = null; });

  it('adds verified links to alsoKnownAs/service, ignores pending + revoked, and keeps the mirror alias', async () => {
    const hex = 'ab'.repeat(32);
    const n = await tdb.createLink({ agentDid: AGENT, kind: 'nostr', value: hex, challenge: 'c' });
    const k = await tdb.createLink({ agentDid: AGENT, kind: 'kybernesis', value: 'agent:kybernesis/atlas', challenge: 'c' });
    const r = await tdb.createLink({ agentDid: AGENT, kind: 'runtime', value: 'https://atlas.vercel.app/eve/v1', challenge: 'c' });
    const w = await tdb.createLink({ agentDid: AGENT, kind: 'web', value: 'https://atlas.example', challenge: 'c' });
    await tdb.updateLink(n.id, { status: 'verified', verifiedAt: new Date() });
    await tdb.updateLink(k.id, { status: 'verified', verifiedAt: new Date() });
    await tdb.updateLink(r.id, { status: 'verified', verifiedAt: new Date() });
    // w stays pending

    const after = await rebuildWellKnown(tdb, AGENT);
    const doc = after!.wellKnownDid as { alsoKnownAs?: string[]; service: Array<{ type: string; serviceEndpoint: string }> };
    expect(doc.alsoKnownAs).toEqual(expect.arrayContaining([`nostr:${npubFromHex(hex)}`, 'kybernesis:agent:kybernesis/atlas']));
    expect(doc.alsoKnownAs).not.toContain('https://atlas.example');
    expect(doc.service.map((s) => s.type)).toEqual(expect.arrayContaining(['DIDCommMessaging', 'AgentCard', 'AgentRuntime', 'KybernesisControlPlane']));
    expect(doc.service.find((s) => s.type === 'AgentRuntime')?.serviceEndpoint).toBe('https://atlas.vercel.app/eve/v1');
    // The FULL document (with the link services) must validate — the pairing
    // accept route parses the stored document with this schema, and stripping
    // the link services here once hid a live "failed schema validation" bug.
    expect(() => DidDocumentSchema.parse(doc)).not.toThrow();

    await tdb.updateLink(n.id, { status: 'revoked', revokedAt: new Date() });
    const again = await rebuildWellKnown(tdb, AGENT);
    const doc2 = again!.wellKnownDid as { alsoKnownAs?: string[] };
    expect(doc2.alsoKnownAs).not.toContain(`nostr:${npubFromHex(hex)}`);
    expect(doc2.alsoKnownAs).toContain('kybernesis:agent:kybernesis/atlas');
    expect(alsoKnownAsFor(w)).toBe('https://atlas.example');
    expect(alsoKnownAsFor(r)).toBeNull();
  });

  it('returns null for an unknown agent', async () => {
    expect(await rebuildWellKnown(tdb, 'did:web:nobody.agent')).toBeNull();
    vi.restoreAllMocks();
  });
});
