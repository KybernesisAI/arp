/**
 * Multi-tenant seed helper for the phase-7 acceptance suite.
 *
 * Provisions N tenants, each with one agent + one active connection
 * against a shared fake-peer identity. Returns everything the tests
 * need to fire cross-tenant requests.
 */

import * as ed25519 from '@noble/ed25519';
import {
  createPgliteDb,
  tenants,
  toTenantId,
  withTenant,
  type CloudDbClient,
  type TenantId,
} from '@kybernesis/arp-cloud-db';
import {
  ed25519RawToMultibase,
  signEnvelope,
} from '@kybernesis/arp-transport';
import type { DidDocument, ConnectionToken } from '@kybernesis/arp-spec';
import type { PeerResolver } from '@kybernesis/arp-cloud-runtime';

export interface TenantFixture {
  tenantId: TenantId;
  tenantIdRaw: string;
  principalDid: string;
  agentDid: string;
  agentHost: string;
  agentPrivate: Uint8Array;
  agentPublic: Uint8Array;
  connectionId: string;
  peerDid: string;
  peerPrivate: Uint8Array;
  peerPublic: Uint8Array;
}

export interface MultiTenantHarness {
  db: CloudDbClient;
  closeDb: () => Promise<void>;
  tenants: TenantFixture[];
  resolver: PeerResolver;
  signEnvelopeAsPeer: (tenantIdx: number, msgId: string, body?: Record<string, unknown>) => Promise<string>;
}

const BASIC_PERMIT = 'permit(principal, action, resource);';

export async function createMultiTenantHarness(count: number): Promise<MultiTenantHarness> {
  const { db, close: closeDb } = await createPgliteDb();
  const fixtures: TenantFixture[] = [];

  for (let i = 0; i < count; i++) {
    const idx = i + 1;
    const principalDid = `did:web:owner${idx}.example.agent`;
    const agentHost = `agent${idx}.agent`;
    const agentDid = `did:web:${agentHost}`;
    const peerDid = `did:web:peer${idx}.agent`;

    const [agentPriv, peerPriv] = [
      ed25519.utils.randomPrivateKey(),
      ed25519.utils.randomPrivateKey(),
    ];
    const agentPub = await ed25519.getPublicKeyAsync(agentPriv);
    const peerPub = await ed25519.getPublicKeyAsync(peerPriv);

    const rows = await db.insert(tenants).values({ principalDid }).returning({ id: tenants.id });
    const row = rows[0];
    if (!row) throw new Error('failed to seed tenant');
    const tenantId = toTenantId(row.id);
    const tenantDb = withTenant(db, tenantId);

    const agentWellKnown = makeDidDoc(agentDid, agentPub);
    await tenantDb.createAgent({
      did: agentDid,
      principalDid,
      agentName: `Agent${idx}`,
      agentDescription: 'phase-7 acceptance fixture',
      publicKeyMultibase: ed25519RawToMultibase(agentPub),
      handoffJson: {},
      wellKnownDid: agentWellKnown as unknown as Record<string, unknown>,
      wellKnownAgentCard: { did: agentDid, name: `Agent${idx}` } as unknown as Record<string, unknown>,
      wellKnownArp: { agentOrigin: `https://${agentHost}` } as unknown as Record<string, unknown>,
      scopeCatalogVersion: 'v1',
      tlsFingerprint: 'cloud',
    });

    const connectionId = `conn_t${idx}001`;
    const token: ConnectionToken = {
      connection_id: connectionId,
      issuer: principalDid,
      subject: agentDid,
      audience: peerDid,
      purpose: `tenant-${idx}-purpose`,
      cedar_policies: [BASIC_PERMIT],
      obligations: [],
      scope_catalog_version: 'v1',
      expires: new Date(Date.now() + 3600_000).toISOString(),
      sigs: { issuer: 'sig-i', audience: 'sig-a' },
    };
    await tenantDb.createConnection({
      connectionId,
      agentDid,
      peerDid,
      label: `t${idx}`,
      purpose: token.purpose,
      tokenJws: JSON.stringify(token),
      tokenJson: token as unknown as Record<string, unknown>,
      cedarPolicies: [BASIC_PERMIT],
      obligations: [],
      scopeCatalogVersion: 'v1',
      metadata: null,
      expiresAt: null,
    });

    fixtures.push({
      tenantId,
      tenantIdRaw: row.id,
      principalDid,
      agentDid,
      agentHost,
      agentPrivate: agentPriv,
      agentPublic: agentPub,
      connectionId,
      peerDid,
      peerPrivate: peerPriv,
      peerPublic: peerPub,
    });
  }

  const resolver: PeerResolver = {
    async resolveDid(did) {
      for (const f of fixtures) {
        if (did === f.peerDid) return makeDidDoc(f.peerDid, f.peerPublic);
        if (did === f.agentDid) return makeDidDoc(f.agentDid, f.agentPublic);
      }
      return null;
    },
  };

  async function signEnvelopeAsPeer(
    tenantIdx: number,
    msgId: string,
    body: Record<string, unknown> = {},
  ): Promise<string> {
    const f = fixtures[tenantIdx];
    if (!f) throw new Error(`no fixture for idx ${tenantIdx}`);
    const env = await signEnvelope({
      message: {
        id: msgId,
        type: 'https://didcomm.org/arp/1.0/request',
        from: f.peerDid,
        to: [f.agentDid],
        body: { connection_id: f.connectionId, action: 'ping', ...body },
      },
      signerDid: f.peerDid,
      privateKey: f.peerPrivate,
    });
    return env.compact;
  }

  return {
    db: db as unknown as CloudDbClient,
    closeDb,
    tenants: fixtures,
    resolver,
    signEnvelopeAsPeer,
  };
}

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
