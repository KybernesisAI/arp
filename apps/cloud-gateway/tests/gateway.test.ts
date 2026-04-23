/**
 * Smoke test — boot the gateway, provision a tenant + agent, send a
 * signed DIDComm envelope at /didcomm via HTTP, verify the message is
 * received, queued, and served back through /.well-known/* responses.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ed25519 from '@noble/ed25519';
import {
  createPgliteDb,
  tenants,
  toTenantId,
  withTenant,
  type CloudDbClient,
} from '@kybernesis/arp-cloud-db';
import {
  ed25519RawToMultibase,
  signEnvelope,
} from '@kybernesis/arp-transport';
import type { DidDocument, ConnectionToken } from '@kybernesis/arp-spec';
import type { PeerResolver } from '@kybernesis/arp-cloud-runtime';
import { startGateway } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CEDAR_SCHEMA_PATH = resolve(
  HERE,
  '..',
  '..',
  '..',
  'packages',
  'spec',
  'src',
  'cedar-schema.json',
);

function makeDidDoc(did: string, publicKey: Uint8Array): DidDocument {
  const keyId = `${did}#key-1`;
  const host = did.replace('did:web:', '');
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: did,
    controller: did,
    verificationMethod: [
      {
        id: keyId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: ed25519RawToMultibase(publicKey),
      },
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
    keyAgreement: [keyId],
    service: [
      {
        id: `${did}#didcomm`,
        type: 'DIDCommMessaging',
        serviceEndpoint: `https://${host}/didcomm`,
        accept: ['didcomm/v2'],
      },
    ],
    principal: { did, representationVC: `https://${host}/.well-known/representation.jwt` },
  };
}

describe('cloud-gateway smoke', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.reverse()) {
      try {
        await fn();
      } catch {
        /* ignore */
      }
    }
    cleanups.length = 0;
  });

  it('POST /didcomm enqueues an allowed message, /.well-known/did.json routes by Host header', async () => {
    const { db, close } = await createPgliteDb();
    cleanups.push(close);

    const agentDid = 'did:web:atlas.agent';
    const peerDid = 'did:web:ghost.agent';
    const principalDid = 'did:web:ian.self.xyz';

    const agentPriv = ed25519.utils.randomPrivateKey();
    const agentPub = await ed25519.getPublicKeyAsync(agentPriv);
    const peerPriv = ed25519.utils.randomPrivateKey();
    const peerPub = await ed25519.getPublicKeyAsync(peerPriv);

    const tenantRow = (
      await db.insert(tenants).values({ principalDid }).returning({ id: tenants.id })
    )[0];
    if (!tenantRow) throw new Error('no tenant');

    const tenantDb = withTenant(db, toTenantId(tenantRow.id));
    const didDoc = makeDidDoc(agentDid, agentPub);
    await tenantDb.createAgent({
      did: agentDid,
      principalDid,
      agentName: 'Atlas',
      agentDescription: 'test agent',
      publicKeyMultibase: ed25519RawToMultibase(agentPub),
      handoffJson: {},
      wellKnownDid: didDoc as unknown as Record<string, unknown>,
      wellKnownAgentCard: { did: agentDid } as unknown as Record<string, unknown>,
      wellKnownArp: { agentOrigin: `https://${agentDid.replace('did:web:', '')}` } as unknown as Record<string, unknown>,
      scopeCatalogVersion: 'v1',
      tlsFingerprint: 'cloud',
    });
    const token: ConnectionToken = {
      connection_id: 'conn_gw0001',
      issuer: principalDid,
      subject: agentDid,
      audience: peerDid,
      purpose: 'gateway-test',
      cedar_policies: ['permit(principal, action, resource);'],
      obligations: [],
      scope_catalog_version: 'v1',
      expires: new Date(Date.now() + 3600_000).toISOString(),
      sigs: { issuer: 'sig', audience: 'sig' },
    };
    await tenantDb.createConnection({
      connectionId: 'conn_gw0001',
      agentDid,
      peerDid,
      label: null,
      purpose: 'gateway-test',
      tokenJws: JSON.stringify(token),
      tokenJson: token as unknown as Record<string, unknown>,
      cedarPolicies: ['permit(principal, action, resource);'],
      obligations: [],
      scopeCatalogVersion: 'v1',
      metadata: null,
      expiresAt: null,
    });

    const resolver: PeerResolver = {
      async resolveDid(did) {
        if (did === peerDid) return makeDidDoc(peerDid, peerPub);
        if (did === agentDid) return makeDidDoc(agentDid, agentPub);
        return null;
      },
    };

    const cedarSchemaJson = readFileSync(CEDAR_SCHEMA_PATH, 'utf8');
    const gw = await startGateway(0, {
      db: db as unknown as CloudDbClient,
      cedarSchemaJson,
      peerResolver: resolver,
    });
    cleanups.push(() => gw.close());

    // /.well-known/did.json
    const wkRes = await fetch(`http://127.0.0.1:${gw.port}/.well-known/did.json`, {
      headers: { 'x-forwarded-host': 'atlas.agent' },
    });
    expect(wkRes.status).toBe(200);
    const wk = (await wkRes.json()) as { id: string };
    expect(wk.id).toBe(agentDid);

    // POST /didcomm with a signed envelope.
    const env = await signEnvelope({
      message: {
        id: 'msg-gw-1',
        type: 'https://didcomm.org/arp/1.0/request',
        from: peerDid,
        to: [agentDid],
        body: { connection_id: 'conn_gw0001', action: 'ping' },
      },
      signerDid: peerDid,
      privateKey: peerPriv,
    });
    const didcommRes = await fetch(`http://127.0.0.1:${gw.port}/didcomm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/didcomm-signed+json',
        'x-forwarded-host': 'atlas.agent',
      },
      body: env.compact,
    });
    expect(didcommRes.status).toBe(202);
    const body = (await didcommRes.json()) as { ok: boolean; decision: string; queued: boolean };
    expect(body.decision).toBe('allow');
    expect(body.queued).toBe(true);
  });
});
