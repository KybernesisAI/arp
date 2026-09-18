/**
 * AgentID S5 / A3: a stock A2A JSON-RPC client talks to a hosted identity.
 * Bearer = ARP connection token (base64url JSON). ghost calls atlas; atlas
 * is a push/generic runtime (fake HTTP server) so the reply completes the
 * task within the request. No bearer → AUTH_REQUIRED; forbid policy → REJECTED.
 */

import { createCipheriv, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { exportJWK, generateKeyPair } from 'jose';
import { createPgliteDb, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { canonicalBytes, payloadFromToken, signBytes } from '@kybernesis/arp-pairing';
import type { ConnectionToken, DidDocument } from '@kybernesis/arp-spec';
import { startGateway } from '../src/index.js';

const CEDAR_SCHEMA_PATH = resolve(__dirname, '..', '..', '..', 'packages', 'spec', 'src', 'cedar-schema.json');
const SEAL = Uint8Array.from(Buffer.from('f'.repeat(64), 'hex'));
const seal = (raw: Uint8Array) => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', SEAL, iv);
  const ct = Buffer.concat([c.update(raw), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
};
const didDoc = (did: string, pub: Uint8Array): DidDocument => {
  const keyId = `${did}#key-1`;
  const host = did.replace('did:web:', '');
  return {
    '@context': ['https://www.w3.org/ns/did/v1'], id: did, controller: did,
    verificationMethod: [{ id: keyId, type: 'Ed25519VerificationKey2020', controller: did, publicKeyMultibase: ed25519RawToMultibase(pub) }],
    authentication: [keyId], assertionMethod: [keyId], keyAgreement: [keyId],
    service: [{ id: `${did}#didcomm`, type: 'DIDCommMessaging', serviceEndpoint: `https://${host}/didcomm`, accept: ['didcomm/v2'] }],
    principal: { did, representationVC: `https://${host}/representation.jwt` },
  };
};
const listen = async (s: Server) => { await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r())); const a = s.address(); if (!a || typeof a === 'string') throw new Error('port'); return a.port; };

describe('A2A endpoint (AgentID S5)', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => { for (const fn of cleanups.reverse()) await fn().catch(() => undefined); cleanups.length = 0; });

  it('message/send with a connection-token bearer completes; anonymous → AUTH_REQUIRED; forbid → REJECTED', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(privateKey)), kid: 'push', alg: 'ES256' };
    const { db, close } = await createPgliteDb();
    cleanups.push(close);
    const t1 = (await db.insert(tenants).values({ principalDid: 'did:key:z1' }).returning({ id: tenants.id }))[0]!.id;
    const t2 = (await db.insert(tenants).values({ principalDid: 'did:key:z2' }).returning({ id: tenants.id }))[0]!.id;
    const ATLAS = 'did:web:atlas.agent'; const GHOST = 'did:web:ghost.agent';
    const atlasPriv = ed25519.utils.randomPrivateKey(); const atlasPub = await ed25519.getPublicKeyAsync(atlasPriv);
    const ghostPriv = ed25519.utils.randomPrivateKey(); const ghostPub = await ed25519.getPublicKeyAsync(ghostPriv);

    // atlas's runtime: generic HTTP, echoes.
    const rt = createServer(async (req, res) => {
      let body = ''; for await (const ch of req) body += ch;
      const { text } = JSON.parse(body) as { text: string };
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ reply: `atlas heard: ${text}` }));
    });
    const rtPort = await listen(rt); cleanups.push(async () => void rt.close());

    const mk = (tenantId: string, did: string, pub: Uint8Array, priv: Uint8Array, push: { pushUrl: string; pushKind: 'generic' | 'eve' }) =>
      withTenant(db as unknown as CloudDbClient, toTenantId(tenantId)).createAgent({
        did, principalDid: did, agentName: did, agentDescription: '', publicKeyMultibase: ed25519RawToMultibase(pub), handoffJson: {},
        wellKnownDid: didDoc(did, pub) as unknown as Record<string, unknown>, wellKnownAgentCard: { did }, wellKnownArp: {},
        scopeCatalogVersion: 'v1', tlsFingerprint: 'cloud-hosted', keyCustody: 'cloud', privateKeyEnc: seal(priv), runtimeKind: 'push', ...push,
        wellKnownA2aCard: { name: did, protocolVersion: '1.0' },
      });
    await mk(t1, ATLAS, atlasPub, atlasPriv, { pushUrl: `http://127.0.0.1:${rtPort}`, pushKind: 'generic' });
    await mk(t2, GHOST, ghostPub, ghostPriv, { pushUrl: 'http://127.0.0.1:1/unused', pushKind: 'generic' });

    // Connection token ghost(issuer=subject) → atlas(audience), signed by both.
    const makeToken = async (id: string, policies: string[]): Promise<ConnectionToken> => {
      const base = {
        connection_id: id, issuer: GHOST, subject: GHOST, audience: ATLAS, purpose: 'a2a-test',
        cedar_policies: policies, obligations: [], scope_catalog_version: 'v1',
        expires: new Date(Date.now() + 3600_000).toISOString(),
      };
      const bytes = canonicalBytes(payloadFromToken({ ...base, sigs: { issuer: '', audience: '' } } as unknown as ConnectionToken));
      const sigG = await signBytes(bytes, { privateKey: ghostPriv, kid: `${GHOST}#key-1` });
      const sigA = await signBytes(bytes, { privateKey: atlasPriv, kid: `${ATLAS}#key-1` });
      // ConnectionToken.sigs is a map of signer DID → bare base64url signature.
      return { ...base, sigs: { [GHOST]: sigG.value, [ATLAS]: sigA.value } } as unknown as ConnectionToken;
    };
    const conn = async (tenantId: string, agentDid: string, peerDid: string, token: ConnectionToken) =>
      withTenant(db as unknown as CloudDbClient, toTenantId(tenantId)).createConnection({
        connectionId: token.connection_id, agentDid, peerDid, label: null, purpose: 'a2a-test', tokenJws: JSON.stringify(token),
        tokenJson: token as unknown as Record<string, unknown>, cedarPolicies: token.cedar_policies, obligations: [], scopeCatalogVersion: 'v1', metadata: null, expiresAt: null,
      });
    const allow = await makeToken('conn_a2a_allow', ['permit(principal, action, resource);']);
    await conn(t1, ATLAS, GHOST, allow); await conn(t2, GHOST, ATLAS, allow);
    const deny = await makeToken('conn_a2a_deny', ['forbid(principal, action, resource);']);
    await conn(t1, ATLAS, GHOST, deny); await conn(t2, GHOST, ATLAS, deny);

    const gw = await startGateway(0, { db: db as unknown as CloudDbClient, cedarSchemaJson: readFileSync(CEDAR_SCHEMA_PATH, 'utf8'), pushSigningJwk: JSON.stringify(jwk), pushIssuer: 'http://gw.test', sealingKey: SEAL, a2aWaitMs: 8_000 });
    cleanups.push(() => gw.close());
    const base = `http://127.0.0.1:${gw.port}`;
    const rpc = async (params: unknown, bearer?: string, method = 'message/send') => {
      const res = await fetch(`${base}/a2a?target=atlas.agent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'a2a-extensions': 'https://arp.run/ext/arp/v1', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      return { status: res.status, ext: res.headers.get('a2a-extensions'), body: (await res.json()) as { result?: { status: { state: string; message?: { parts: Array<{ text: string }> } }; id: string }; error?: { code: number; message: string } } };
    };
    const msg = (text: string) => ({ message: { messageId: 'm1', role: 'ROLE_USER', parts: [{ text }] } });

    // Anonymous → AUTH_REQUIRED with the pair URL.
    const anon = await rpc(msg('hi'));
    expect(anon.status).toBe(200);
    expect(anon.body.result?.status.state).toBe('TASK_STATE_AUTH_REQUIRED');
    expect(anon.body.result?.status.message?.parts[0]?.text).toContain('cloud.arp.run/pair?peer=did%3Aweb%3Aatlas.agent');
    expect(anon.ext).toBe('https://arp.run/ext/arp/v1');

    // Allowed connection → COMPLETED with the runtime's reply.
    const bearerAllow = Buffer.from(JSON.stringify(allow)).toString('base64url');
    const ok = await rpc(msg('ping from ghost'), bearerAllow);
    expect(ok.body.error).toBeUndefined();
    expect(ok.body.result?.status.state).toBe('TASK_STATE_COMPLETED');
    expect(ok.body.result?.status.message?.parts[0]?.text).toBe('atlas heard: ping from ghost');
    // tasks/get returns the same task.
    const got = await rpc({ id: ok.body.result?.id }, bearerAllow, 'tasks/get');
    expect(got.body.result?.status.state).toBe('TASK_STATE_COMPLETED');

    // Forbid connection → REJECTED (policy denial, audited).
    const bearerDeny = Buffer.from(JSON.stringify(deny)).toString('base64url');
    const rej = await rpc(msg('anything'), bearerDeny);
    expect(rej.body.result?.status.state).toBe('TASK_STATE_REJECTED');

    // Tampered token → rejected at verification.
    const tampered = Buffer.from(JSON.stringify({ ...allow, purpose: 'edited' })).toString('base64url');
    const bad = await rpc(msg('x'), tampered);
    expect(bad.body.error?.code).toBe(-32003);

    // Unknown method.
    const unk = await rpc({}, bearerAllow, 'tasks/list');
    expect(unk.body.error?.code).toBe(-32601);
  }, 30_000);
});
