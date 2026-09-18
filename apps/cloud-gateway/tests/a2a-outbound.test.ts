/**
 * AgentID S5 / A4: outbound to a non-ARP A2A agent.
 *
 * ghost (cloud custody) → POST /agent-api/send to a peer that is NOT hosted
 * on this gateway → the gateway fetches the peer's A2A card, calls
 * `message/send` on its JSON-RPC interface with ghost's Connection Token
 * as the bearer, and returns the task's reply. A second call shows a
 * REJECTED task surfacing as a 403 denial.
 */

import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { exportJWK, generateKeyPair } from 'jose';
import { createPgliteDb, agentCredentials, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { ARP_A2A_EXTENSION_URI, type ConnectionToken } from '@kybernesis/arp-spec';
import { startGateway } from '../src/index.js';

const CEDAR_SCHEMA_PATH = resolve(__dirname, '..', '..', '..', 'packages', 'spec', 'src', 'cedar-schema.json');
const SEAL = Uint8Array.from(Buffer.from('e'.repeat(64), 'hex'));
const GHOST = 'did:web:ghost.agent';
const PEER = 'did:web:peer.example';

function seal(raw: Uint8Array): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', SEAL, iv);
  const ct = Buffer.concat([c.update(raw), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}

describe('outbound A2A (AgentID S5 / A4)', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.reverse()) await fn().catch(() => undefined);
    cleanups.length = 0;
  });

  it('agent-API send reaches a stock A2A agent with the Connection Token as bearer', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(privateKey)), kid: 'test-push', alg: 'ES256' };
    const { db, close } = await createPgliteDb();
    cleanups.push(close);
    const t1 = (await db.insert(tenants).values({ principalDid: 'did:key:z1' }).returning({ id: tenants.id }))[0]!.id;
    const ghostPriv = ed25519.utils.randomPrivateKey();
    const ghostPub = await ed25519.getPublicKeyAsync(ghostPriv);

    await withTenant(db as unknown as CloudDbClient, toTenantId(t1)).createAgent({
      did: GHOST,
      principalDid: 'did:key:zX',
      agentName: 'ghost',
      agentDescription: '',
      publicKeyMultibase: ed25519RawToMultibase(ghostPub),
      handoffJson: {},
      wellKnownDid: { id: GHOST },
      wellKnownAgentCard: { did: GHOST },
      wellKnownArp: {},
      scopeCatalogVersion: 'v1',
      tlsFingerprint: 'cloud-hosted',
      keyCustody: 'cloud',
      privateKeyEnc: seal(ghostPriv),
      runtimeKind: 'push',
      pushUrl: 'http://127.0.0.1:1/unused',
      pushKind: 'generic',
    });
    const token: ConnectionToken = {
      connection_id: 'conn_a2a_1', issuer: 'did:key:zX', subject: GHOST, audience: PEER, purpose: 'a2a-test',
      cedar_policies: ['permit(principal, action, resource);'], obligations: [], scope_catalog_version: 'v1',
      expires: new Date(Date.now() + 3600_000).toISOString(), sigs: { issuer: 'sig', audience: 'sig' },
    };
    await withTenant(db as unknown as CloudDbClient, toTenantId(t1)).createConnection({
      connectionId: 'conn_a2a_1', agentDid: GHOST, peerDid: PEER, label: null, purpose: 'a2a-test', tokenJws: JSON.stringify(token),
      tokenJson: token as unknown as Record<string, unknown>, cedarPolicies: token.cedar_policies, obligations: [], scopeCatalogVersion: 'v1', metadata: null, expiresAt: null,
    });
    const ghostToken = randomBytes(32).toString('base64url');
    await db.insert(agentCredentials).values({ tenantId: t1, agentDid: GHOST, tokenHash: createHash('sha256').update(ghostToken).digest('hex'), label: 'test' });

    // A stock A2A v1.0 agent living at https://peer.example (not an ARP identity).
    const seen: { bearer?: string; texts: string[] } = { texts: [] };
    const peer = new Hono();
    peer.get('/.well-known/agent-card.json', (c) =>
      c.json({
        name: 'peer', description: 'stock A2A agent', protocolVersion: '1.0', version: '1.0.0',
        supportedInterfaces: [{ url: 'https://peer.example/a2a', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
        capabilities: { streaming: false, extensions: [{ uri: ARP_A2A_EXTENSION_URI }] },
        defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'],
        skills: [{ id: 'converse', name: 'Converse', description: 'chat', tags: ['chat'] }],
      }),
    );
    peer.post('/a2a', async (c) => {
      const req = (await c.req.json()) as { id: string; method: string; params: { message: { contextId?: string; parts: Array<{ text?: string }> } } };
      seen.bearer = c.req.header('authorization');
      const text = req.params.message.parts[0]?.text ?? '';
      seen.texts.push(text);
      const state = text.includes('forbidden') ? 'TASK_STATE_REJECTED' : 'TASK_STATE_COMPLETED';
      return c.json({
        jsonrpc: '2.0', id: req.id,
        result: {
          id: `task-${seen.texts.length}`, contextId: req.params.message.contextId ?? 'ctx',
          status: { state, message: { messageId: 'r', role: 'ROLE_AGENT', parts: [{ text: state === 'TASK_STATE_COMPLETED' ? `peer says: ${text}` : 'outside scope' }] } },
        },
      });
    });
    const a2aFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.startsWith('https://peer.example/')) return new Response('', { status: 502 });
      return peer.request(url, init);
    };

    const gw = await startGateway(0, {
      db: db as unknown as CloudDbClient,
      cedarSchemaJson: readFileSync(CEDAR_SCHEMA_PATH, 'utf8'),
      pushSigningJwk: JSON.stringify(jwk),
      pushIssuer: 'http://gateway.test',
      sealingKey: SEAL,
      a2aFetch,
    });
    cleanups.push(() => gw.close());
    const base = `http://127.0.0.1:${gw.port}`;

    const ok = await fetch(`${base}/agent-api/send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ghostToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ peer_did: PEER, text: 'hello from ghost', wait_ms: 5_000 }),
    });
    const body = (await ok.json()) as { ok: boolean; reply: string | null; via?: string; a2a_task_id?: string; thid: string };
    expect(ok.status).toBe(200);
    expect(body).toMatchObject({ ok: true, reply: 'peer says: hello from ghost', via: 'a2a', a2a_task_id: 'task-1' });
    // The bearer is ghost's Connection Token for this peer, base64url(JSON).
    expect(seen.bearer?.startsWith('Bearer ')).toBe(true);
    const decoded = JSON.parse(Buffer.from(seen.bearer!.slice(7), 'base64url').toString('utf8')) as ConnectionToken;
    expect(decoded.connection_id).toBe('conn_a2a_1');
    expect(decoded.audience).toBe(PEER);

    const denied = await fetch(`${base}/agent-api/send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ghostToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ peer_did: PEER, text: 'something forbidden', wait_ms: 5_000 }),
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ ok: false, error: 'denied', reason: 'outside scope', a2a_state: 'TASK_STATE_REJECTED' });
  }, 30_000);

  it('reports peer_unreachable when the peer has no card', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(privateKey)), kid: 'test-push', alg: 'ES256' };
    const { db, close } = await createPgliteDb();
    cleanups.push(close);
    const t1 = (await db.insert(tenants).values({ principalDid: 'did:key:z1' }).returning({ id: tenants.id }))[0]!.id;
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    await withTenant(db as unknown as CloudDbClient, toTenantId(t1)).createAgent({
      did: GHOST, principalDid: 'did:key:zX', agentName: 'ghost', agentDescription: '', publicKeyMultibase: ed25519RawToMultibase(pub),
      handoffJson: {}, wellKnownDid: { id: GHOST }, wellKnownAgentCard: { did: GHOST }, wellKnownArp: {}, scopeCatalogVersion: 'v1',
      tlsFingerprint: 'cloud-hosted', keyCustody: 'cloud', privateKeyEnc: seal(priv), runtimeKind: 'push', pushUrl: 'http://127.0.0.1:1/unused', pushKind: 'generic',
    });
    const token: ConnectionToken = {
      connection_id: 'conn_a2a_2', issuer: 'did:key:zX', subject: GHOST, audience: PEER, purpose: 'x', cedar_policies: ['permit(principal, action, resource);'],
      obligations: [], scope_catalog_version: 'v1', expires: new Date(Date.now() + 3600_000).toISOString(), sigs: { issuer: 'sig', audience: 'sig' },
    };
    await withTenant(db as unknown as CloudDbClient, toTenantId(t1)).createConnection({
      connectionId: 'conn_a2a_2', agentDid: GHOST, peerDid: PEER, label: null, purpose: 'x', tokenJws: JSON.stringify(token),
      tokenJson: token as unknown as Record<string, unknown>, cedarPolicies: token.cedar_policies, obligations: [], scopeCatalogVersion: 'v1', metadata: null, expiresAt: null,
    });
    const ghostToken = randomBytes(32).toString('base64url');
    await db.insert(agentCredentials).values({ tenantId: t1, agentDid: GHOST, tokenHash: createHash('sha256').update(ghostToken).digest('hex'), label: 'test' });
    const gw = await startGateway(0, {
      db: db as unknown as CloudDbClient, cedarSchemaJson: readFileSync(CEDAR_SCHEMA_PATH, 'utf8'), pushSigningJwk: JSON.stringify(jwk),
      pushIssuer: 'http://gateway.test', sealingKey: SEAL, a2aFetch: async () => new Response('', { status: 404 }),
    });
    cleanups.push(() => gw.close());
    const res = await fetch(`http://127.0.0.1:${gw.port}/agent-api/send`, {
      method: 'POST', headers: { authorization: `Bearer ${ghostToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ peer_did: PEER, text: 'hi' }),
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, error: 'peer_unreachable' });
  }, 30_000);
});
