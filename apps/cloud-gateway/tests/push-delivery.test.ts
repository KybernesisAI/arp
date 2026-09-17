/**
 * AgentID S4: push delivery end to end.
 *
 * ghost (push/generic) → POST /agent-api/send → gateway signs with ghost's
 * cloud-held key → dispatch on atlas (push/eve) → gateway POSTs to a fake Eve
 * runtime that verifies the push JWS against /.well-known/jwks.json → reply →
 * gateway signs a /response with atlas's key → dispatch on ghost → the pending
 * send resolves with the reply. No WebSocket anywhere.
 */

import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify } from 'jose';
import { createPgliteDb, agentCredentials, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import type { ConnectionToken, DidDocument } from '@kybernesis/arp-spec';
import { startGateway } from '../src/index.js';

const CEDAR_SCHEMA_PATH = resolve(__dirname, '..', '..', '..', 'packages', 'spec', 'src', 'cedar-schema.json');
const SEAL = Uint8Array.from(Buffer.from('e'.repeat(64), 'hex'));

function seal(raw: Uint8Array): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', SEAL, iv);
  const ct = Buffer.concat([c.update(raw), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}

function didDoc(did: string, pub: Uint8Array): DidDocument {
  const keyId = `${did}#key-1`;
  const host = did.replace('did:web:', '');
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: did,
    controller: did,
    verificationMethod: [{ id: keyId, type: 'Ed25519VerificationKey2020', controller: did, publicKeyMultibase: ed25519RawToMultibase(pub) }],
    authentication: [keyId],
    assertionMethod: [keyId],
    keyAgreement: [keyId],
    service: [{ id: `${did}#didcomm`, type: 'DIDCommMessaging', serviceEndpoint: `https://${host}/didcomm`, accept: ['didcomm/v2'] }],
    principal: { did, representationVC: `https://${host}/representation.jwt` },
  };
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  return addr.port;
}

describe('push delivery (AgentID S4)', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.reverse()) await fn().catch(() => undefined);
    cleanups.length = 0;
  });

  it('round-trips ghost → atlas (Eve runtime) → ghost through the agent-API with no sockets', async () => {
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(privateKey)), kid: 'test-push', alg: 'ES256' };
    const pubJwk = { ...(await exportJWK(publicKey)), kid: 'test-push', alg: 'ES256' };
    void pubJwk;

    const { db, close } = await createPgliteDb();
    cleanups.push(close);
    const t1 = (await db.insert(tenants).values({ principalDid: 'did:key:z1' }).returning({ id: tenants.id }))[0]!.id;
    const t2 = (await db.insert(tenants).values({ principalDid: 'did:key:z2' }).returning({ id: tenants.id }))[0]!.id;

    const atlasPriv = ed25519.utils.randomPrivateKey();
    const atlasPub = await ed25519.getPublicKeyAsync(atlasPriv);
    const ghostPriv = ed25519.utils.randomPrivateKey();
    const ghostPub = await ed25519.getPublicKeyAsync(ghostPriv);
    const ATLAS = 'did:web:atlas.agent';
    const GHOST = 'did:web:ghost.agent';

    // Fake Eve runtime for atlas: verifies the push JWS against the gateway's JWKS.
    let gatewayBase = '';
    let seenPrompt = '';
    const eve = createServer(async (req, res) => {
      const auth = req.headers.authorization ?? '';
      const token = auth.replace(/^Bearer /, '');
      try {
        const jwksRes = await fetch(`${gatewayBase}/.well-known/jwks.json`);
        const jwks = createLocalJWKSet((await jwksRes.json()) as { keys: never[] });
        const { payload } = await jwtVerify(token, jwks, { audience: ATLAS });
        if (payload['kind'] !== 'arp-push' || payload['peer_did'] !== GHOST) throw new Error('bad claims');
      } catch (e) {
        res.writeHead(401).end(JSON.stringify({ error: (e as Error).message }));
        return;
      }
      if (req.method === 'POST' && req.url === '/eve/v1/session') {
        let body = '';
        for await (const chunk of req) body += chunk;
        seenPrompt = (JSON.parse(body) as { message: string }).message;
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ sessionId: 's1' }));
        return;
      }
      if (req.method === 'GET' && req.url?.startsWith('/eve/v1/session/s1/stream')) {
        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
        res.write(JSON.stringify({ type: 'message.completed', data: { finishReason: 'tool-calls', message: 'thinking…' } }) + '\n');
        res.write(JSON.stringify({ type: 'message.completed', data: { finishReason: 'stop', message: 'pong from atlas' } }) + '\n');
        res.write(JSON.stringify({ type: 'turn.completed', data: {} }) + '\n');
        // Keep the stream open like a long-lived host would; the gateway must stop at the turn boundary.
        setTimeout(() => res.end(), 2000);
        return;
      }
      res.writeHead(404).end();
    });
    const evePort = await listen(eve);
    cleanups.push(async () => void eve.close());

    const seedRow = (tenantId: string, did: string, pub: Uint8Array, priv: Uint8Array, push: { pushUrl: string; pushKind: 'eve' | 'generic' }) =>
      withTenant(db as unknown as CloudDbClient, toTenantId(tenantId)).createAgent({
        did,
        principalDid: 'did:key:zX',
        agentName: did,
        agentDescription: '',
        publicKeyMultibase: ed25519RawToMultibase(pub),
        handoffJson: {},
        wellKnownDid: didDoc(did, pub) as unknown as Record<string, unknown>,
        wellKnownAgentCard: { did },
        wellKnownArp: {},
        scopeCatalogVersion: 'v1',
        tlsFingerprint: 'cloud-hosted',
        keyCustody: 'cloud',
        privateKeyEnc: seal(priv),
        runtimeKind: 'push',
        ...push,
      });
    await seedRow(t1, ATLAS, atlasPub, atlasPriv, { pushUrl: `http://127.0.0.1:${evePort}`, pushKind: 'eve' });
    await seedRow(t2, GHOST, ghostPub, ghostPriv, { pushUrl: 'http://127.0.0.1:1/unused', pushKind: 'generic' });

    const conn = async (tenantId: string, agentDid: string, peerDid: string) => {
      const token: ConnectionToken = {
        connection_id: 'conn_push_1', issuer: 'did:key:zX', subject: agentDid, audience: peerDid, purpose: 'push-test',
        cedar_policies: ['permit(principal, action, resource);'], obligations: [], scope_catalog_version: 'v1',
        expires: new Date(Date.now() + 3600_000).toISOString(), sigs: { issuer: 'sig', audience: 'sig' },
      };
      await withTenant(db as unknown as CloudDbClient, toTenantId(tenantId)).createConnection({
        connectionId: 'conn_push_1', agentDid, peerDid, label: null, purpose: 'push-test', tokenJws: JSON.stringify(token),
        tokenJson: token as unknown as Record<string, unknown>, cedarPolicies: ['permit(principal, action, resource);'],
        obligations: [], scopeCatalogVersion: 'v1', metadata: null, expiresAt: null,
      });
    };
    await conn(t1, ATLAS, GHOST);
    await conn(t2, GHOST, ATLAS);

    const ghostToken = randomBytes(32).toString('base64url');
    await db.insert(agentCredentials).values({ tenantId: t2, agentDid: GHOST, tokenHash: createHash('sha256').update(ghostToken).digest('hex'), label: 'test' });

    const gw = await startGateway(0, {
      db: db as unknown as CloudDbClient,
      cedarSchemaJson: readFileSync(CEDAR_SCHEMA_PATH, 'utf8'),
      pushSigningJwk: JSON.stringify(jwk),
      pushIssuer: 'http://gateway.test',
      sealingKey: SEAL,
    });
    cleanups.push(() => gw.close());
    gatewayBase = `http://127.0.0.1:${gw.port}`;

    const jwks = await fetch(`${gatewayBase}/.well-known/jwks.json`);
    expect(jwks.status).toBe(200);
    expect(((await jwks.json()) as { keys: Array<{ kid: string; d?: string }> }).keys).toMatchObject([{ kid: 'test-push' }]);
    expect(JSON.stringify(await (await fetch(`${gatewayBase}/.well-known/jwks.json`)).json())).not.toContain('"d"');

    const unauth = await fetch(`${gatewayBase}/agent-api/connections`);
    expect(unauth.status).toBe(401);
    const list = await fetch(`${gatewayBase}/agent-api/connections`, { headers: { authorization: `Bearer ${ghostToken}` } });
    expect(list.status).toBe(200);
    expect(((await list.json()) as { connections: Array<{ peer_did: string; peer_name: string }> }).connections).toEqual([
      expect.objectContaining({ peer_did: ATLAS, peer_name: 'atlas' }),
    ]);

    const sent = await fetch(`${gatewayBase}/agent-api/send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ghostToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ peer_did: ATLAS, text: 'ping', wait_ms: 15_000 }),
    });
    const body = (await sent.json()) as { ok: boolean; reply: string | null; timed_out?: boolean };
    expect(sent.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.reply).toBe('pong from atlas');
    expect(seenPrompt).toContain('ping');
    expect(seenPrompt).toContain('ghost');

    const noConn = await fetch(`${gatewayBase}/agent-api/send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ghostToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ peer_did: 'did:web:nobody.agent', text: 'x' }),
    });
    expect(noConn.status).toBe(404);
  }, 30_000);
});
