/**
 * Same-tenant pairing stores ONE connection row (PK tenant_id +
 * connection_id), oriented from the accepting agent. Both agents must still
 * see the connection through the agent API, each with the other as peer.
 */

import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { exportJWK, generateKeyPair } from 'jose';
import { createPgliteDb, agentCredentials, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import type { ConnectionToken } from '@kybernesis/arp-spec';
import { startGateway } from '../src/index.js';

const CEDAR_SCHEMA_PATH = resolve(__dirname, '..', '..', '..', 'packages', 'spec', 'src', 'cedar-schema.json');
const SEAL = Uint8Array.from(Buffer.from('e'.repeat(64), 'hex'));
const KYBER = 'did:web:kyber.agent';
const SID = 'did:web:sid.agent';

function seal(raw: Uint8Array): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', SEAL, iv);
  const ct = Buffer.concat([c.update(raw), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}

describe('agent API with both agents in one tenant', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.reverse()) await fn().catch(() => undefined);
    cleanups.length = 0;
  });

  it('lists the connection for both sides with the other agent as peer', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(privateKey)), kid: 'test-push', alg: 'ES256' };
    const { db, close } = await createPgliteDb();
    cleanups.push(close);
    const t = (await db.insert(tenants).values({ principalDid: 'did:key:z1' }).returning({ id: tenants.id }))[0]!.id;
    const tdb = withTenant(db as unknown as CloudDbClient, toTenantId(t));
    const creds: Record<string, string> = {};
    for (const did of [KYBER, SID]) {
      const priv = ed25519.utils.randomPrivateKey();
      const pub = await ed25519.getPublicKeyAsync(priv);
      await tdb.createAgent({
        did, principalDid: 'did:key:z1', agentName: did, agentDescription: '', publicKeyMultibase: ed25519RawToMultibase(pub), handoffJson: {},
        wellKnownDid: { id: did }, wellKnownAgentCard: { did }, wellKnownArp: {}, scopeCatalogVersion: 'v1', tlsFingerprint: 'cloud-hosted',
        keyCustody: 'cloud', privateKeyEnc: seal(priv), runtimeKind: 'push', pushUrl: 'http://127.0.0.1:1/unused', pushKind: 'generic',
      });
      const token = randomBytes(32).toString('base64url');
      creds[did] = token;
      await db.insert(agentCredentials).values({ tenantId: t, agentDid: did, tokenHash: createHash('sha256').update(token).digest('hex'), label: 'test' });
    }
    // One row, oriented from the accepting agent (sid), exactly as /pair/accept stores it.
    const token: ConnectionToken = {
      connection_id: 'conn_same_1', issuer: 'did:key:z1', subject: KYBER, audience: SID, purpose: 'same-tenant',
      cedar_policies: ['permit(principal, action == Action::"relay_to_principal", resource);'], obligations: [], scope_catalog_version: 'v1',
      expires: new Date(Date.now() + 3600_000).toISOString(), sigs: { issuer: 'sig', audience: 'sig' },
    };
    await tdb.createConnection({
      connectionId: 'conn_same_1', agentDid: SID, peerDid: KYBER, label: null, purpose: 'same-tenant', tokenJws: JSON.stringify(token),
      tokenJson: token as unknown as Record<string, unknown>, cedarPolicies: token.cedar_policies, obligations: [], scopeCatalogVersion: 'v1', metadata: null, expiresAt: null,
    });

    const gw = await startGateway(0, { db: db as unknown as CloudDbClient, cedarSchemaJson: readFileSync(CEDAR_SCHEMA_PATH, 'utf8'), pushSigningJwk: JSON.stringify(jwk), pushIssuer: 'http://gateway.test', sealingKey: SEAL });
    cleanups.push(() => gw.close());
    const base = `http://127.0.0.1:${gw.port}`;

    for (const [did, peer] of [[KYBER, SID], [SID, KYBER]] as const) {
      const res = await fetch(`${base}/agent-api/connections`, { headers: { authorization: `Bearer ${creds[did]}` } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { connections: Array<{ connection_id: string; peer_did: string; peer_name: string }> };
      expect(body.connections).toEqual([expect.objectContaining({ connection_id: 'conn_same_1', peer_did: peer, peer_name: peer.replace('did:web:', '').replace('.agent', '') })]);
    }
    // A send from the non-row side resolves the connection too (the peer's
    // push URL is unreachable here, so the delivery itself is not asserted).
    const sent = await fetch(`${base}/agent-api/send`, {
      method: 'POST', headers: { authorization: `Bearer ${creds[KYBER]}`, 'content-type': 'application/json' },
      body: JSON.stringify({ peer_did: SID, text: 'hi', wait_ms: 1_000 }),
    });
    expect(sent.status).not.toBe(404);
    // An action outside the granted scope is a DENIAL to the caller (403),
    // not a reply that timed out — the PDP result is { ok: true, decision: 'deny' }.
    const denied = await fetch(`${base}/agent-api/send`, {
      method: 'POST', headers: { authorization: `Bearer ${creds[KYBER]}`, 'content-type': 'application/json' },
      body: JSON.stringify({ peer_did: SID, text: 'read the calendar', action: 'calendar.events.read', wait_ms: 1_000 }),
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ ok: false, error: 'denied' });
  }, 30_000);
});
