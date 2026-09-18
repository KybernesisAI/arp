/**
 * AgentID S6a: zero-code connect, gateway half.
 *
 * A fake runtime implements what @kybernesis/identity does: POST /connect
 * verifies the token against the gateway JWKS, redeems it at
 * /agent-api/bootstrap, stores the result, and then serves
 * /.well-known/agentid-verification from that store.
 */

import { createCipheriv, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createServer as createNet } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify } from 'jose';
import { createPgliteDb, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { startGateway } from '../src/index.js';

const CEDAR_SCHEMA_PATH = resolve(__dirname, '..', '..', '..', 'packages', 'spec', 'src', 'cedar-schema.json');
const SEAL = Uint8Array.from(Buffer.from('e'.repeat(64), 'hex'));
const ATLAS = 'did:web:atlas.agent';

function seal(raw: Uint8Array): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', SEAL, iv);
  const ct = Buffer.concat([c.update(raw), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}
async function freePort(): Promise<number> {
  return new Promise((r) => { const s = createNet(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); });
}
async function listen(server: Server): Promise<number> {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return (server.address() as { port: number }).port;
}

/** Minimal runtime: identity store in memory, same contract as @kybernesis/identity. */
function fakeRuntime(opts: { arpReady: boolean; storeWritable?: boolean }) {
  const store: { did?: string; issuer?: string; credential?: string; challenge?: string } = {};
  const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/eve/v1/arp/connect') {
      if (!opts.arpReady) { res.writeHead(404).end(); return; }
      let body = '';
      for await (const ch of req) body += ch;
      const { token, issuer } = JSON.parse(body) as { token: string; issuer: string };
      const jwks = createLocalJWKSet((await (await fetch(`${issuer}/.well-known/jwks.json`)).json()) as { keys: never[] });
      const { payload } = await jwtVerify(token, jwks, { issuer });
      if (payload['kind'] !== 'arp-connect') { res.writeHead(400).end(JSON.stringify({ error: 'bad_token' })); return; }
      if (store.issuer && store.issuer !== issuer) { res.writeHead(409).end(JSON.stringify({ error: 'bound_to_another_issuer' })); return; }
      if (opts.storeWritable === false) { res.writeHead(503).end(JSON.stringify({ error: 'store_unwritable', store: 'none' })); return; }
      const boot = await fetch(`${issuer}/agent-api/bootstrap`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      const cfg = (await boot.json()) as { did: string; issuer: string; credential: string; challenge: string; error?: string };
      if (!boot.ok) { res.writeHead(502).end(JSON.stringify({ ok: false, error: cfg.error })); return; }
      Object.assign(store, cfg);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, did: cfg.did, store: 'file' }));
      return;
    }
    if (req.method === 'GET' && req.url === '/eve/v1/arp/.well-known/agentid-verification') {
      if (!store.did) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ did: store.did, challenge: store.challenge }));
      return;
    }
    res.writeHead(404).end();
  });
  return { server, store };
}

describe('zero-code connect (AgentID S6a)', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => { for (const fn of cleanups.reverse()) await fn().catch(() => undefined); cleanups.length = 0; });

  async function setup() {
    const { privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(privateKey)), kid: 'test-push', alg: 'ES256' };
    const { db, close } = await createPgliteDb();
    cleanups.push(close);
    const t1 = (await db.insert(tenants).values({ principalDid: 'did:key:z1' }).returning({ id: tenants.id }))[0]!.id;
    const t2 = (await db.insert(tenants).values({ principalDid: 'did:key:z2' }).returning({ id: tenants.id }))[0]!.id;
    const tdb = withTenant(db as unknown as CloudDbClient, toTenantId(t1));
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    await tdb.createAgent({
      did: ATLAS, principalDid: 'did:key:z1', agentName: 'Atlas', agentDescription: '', publicKeyMultibase: ed25519RawToMultibase(pub), handoffJson: {},
      wellKnownDid: { id: ATLAS }, wellKnownAgentCard: { did: ATLAS }, wellKnownArp: {}, scopeCatalogVersion: 'v1', tlsFingerprint: 'cloud-hosted',
      keyCustody: 'cloud', privateKeyEnc: seal(priv), runtimeKind: 'none',
    });
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const gw = await startGateway(port, { db: db as unknown as CloudDbClient, cedarSchemaJson: readFileSync(CEDAR_SCHEMA_PATH, 'utf8'), pushSigningJwk: JSON.stringify(jwk), pushIssuer: base, sealingKey: SEAL });
    cleanups.push(() => gw.close());
    return { db: db as unknown as CloudDbClient, tdb, t2, base };
  }

  it('connects a runtime in one round trip: token → bootstrap → verification', async () => {
    const { tdb, base } = await setup();
    const rt = fakeRuntime({ arpReady: true });
    const port = await listen(rt.server);
    cleanups.push(async () => void rt.server.close());
    const url = `http://127.0.0.1:${port}/eve/v1/arp`;
    const link = await tdb.createLink({ agentDid: ATLAS, kind: 'runtime', value: url, label: 'eve', challenge: 'chal-1' });
    const ticket = await tdb.createConnectTicket({ agentDid: ATLAS, url, linkId: link.id });

    const res = await fetch(`${base}/internal/connect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket_id: ticket.id }) });
    const out = (await res.json()) as { result: string; store: string | null; message: string };
    expect(res.status).toBe(200);
    expect(out.result).toBe('connected');
    expect(out.store).toBe('file');
    // The runtime got its configuration without any env var.
    expect(rt.store.did).toBe(ATLAS);
    expect(rt.store.challenge).toBe('chal-1');
    expect(rt.store.credential).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    // …and that credential works on the agent API.
    const me = await fetch(`${base}/agent-api/me`, { headers: { authorization: `Bearer ${rt.store.credential}` } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ agent_did: ATLAS, runtime_kind: 'push' });
    const agent = await tdb.getAgent(ATLAS);
    expect(agent).toMatchObject({ runtimeKind: 'push', pushKind: 'eve', pushUrl: `http://127.0.0.1:${port}` });
    expect((await tdb.getLink(link.id))?.status).toBe('verified');
    expect((await tdb.getConnectTicket(ticket.id))?.result).toBe('connected');

    // Replaying the ticket is refused.
    const again = await fetch(`${base}/internal/connect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket_id: ticket.id }) });
    expect(again.status).toBe(409);
  }, 30_000);

  it('refuses a URL already bound to another tenant, an agent without the add-on, and an unreachable one', async () => {
    const { db, tdb, t2, base } = await setup();
    // Another tenant's agent already lives at this origin.
    const rt = fakeRuntime({ arpReady: true });
    const port = await listen(rt.server);
    cleanups.push(async () => void rt.server.close());
    const url = `http://127.0.0.1:${port}/eve/v1/arp`;
    const other = withTenant(db, toTenantId(t2));
    await other.createAgent({
      did: 'did:web:ghost.agent', principalDid: 'did:key:z2', agentName: 'Ghost', agentDescription: '', publicKeyMultibase: 'z6Mk', handoffJson: {},
      wellKnownDid: {}, wellKnownAgentCard: {}, wellKnownArp: {}, scopeCatalogVersion: 'v1', tlsFingerprint: 'cloud-hosted', keyCustody: 'exported', runtimeKind: 'push', pushUrl: `http://127.0.0.1:${port}`, pushKind: 'eve',
    });
    const link = await tdb.createLink({ agentDid: ATLAS, kind: 'runtime', value: url, label: 'eve', challenge: 'chal-2' });
    const t = await tdb.createConnectTicket({ agentDid: ATLAS, url, linkId: link.id });
    const r1 = await fetch(`${base}/internal/connect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket_id: t.id }) });
    expect(r1.status).toBe(409);
    expect(((await r1.json()) as { result: string }).result).toBe('bound_elsewhere');
    expect(rt.store.did).toBeUndefined();

    // No add-on: /connect is a 404.
    const bare = fakeRuntime({ arpReady: false });
    const bport = await listen(bare.server);
    cleanups.push(async () => void bare.server.close());
    const burl = `http://127.0.0.1:${bport}/eve/v1/arp`;
    const l2 = await tdb.createLink({ agentDid: ATLAS, kind: 'runtime', value: burl, label: 'eve', challenge: 'chal-3' });
    const t2b = await tdb.createConnectTicket({ agentDid: ATLAS, url: burl, linkId: l2.id });
    const r2 = await fetch(`${base}/internal/connect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket_id: t2b.id }) });
    expect(((await r2.json()) as { result: string }).result).toBe('not_arp_ready');

    // Nothing listening.
    const dead = `http://127.0.0.1:1/eve/v1/arp`;
    const l3 = await tdb.createLink({ agentDid: ATLAS, kind: 'runtime', value: dead, label: 'eve', challenge: 'chal-4' });
    const t3 = await tdb.createConnectTicket({ agentDid: ATLAS, url: dead, linkId: l3.id });
    const r3 = await fetch(`${base}/internal/connect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket_id: t3.id }) });
    expect(((await r3.json()) as { result: string }).result).toBe('not_reachable');

    // Expired ticket.
    const t4 = await tdb.createConnectTicket({ agentDid: ATLAS, url, linkId: link.id, ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 20));
    const r4 = await fetch(`${base}/internal/connect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket_id: t4.id }) });
    expect(r4.status).toBe(410);
    // Bootstrap with garbage is a 401; a replayed connect token is a 409.
    expect((await fetch(`${base}/agent-api/bootstrap`, { method: 'POST', headers: { authorization: 'Bearer nope' } })).status).toBe(401);
  }, 30_000);
});
