/**
 * Shared test harness for cloud-runtime unit tests.
 *
 * Builds a fresh PGlite db, seeds a tenant + agent, produces a fake peer
 * identity + resolver, and returns a signed-envelope helper.
 */

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
  type TenantDb,
} from '@kybernesis/arp-cloud-db';
import {
  ed25519RawToMultibase,
  signEnvelope,
} from '@kybernesis/arp-transport';
import type { DidCommMessage } from '@kybernesis/arp-transport';
import type { ConnectionToken, DidDocument } from '@kybernesis/arp-spec';
import { createPdp, type Pdp } from '@kybernesis/arp-pdp';
import { createPostgresAudit, type PostgresAudit } from '../src/audit.js';
import { createSilentLogger } from '../src/logger.js';
import { createInMemoryMetrics } from '../src/metrics.js';
import { createSessionRegistry, type SessionRegistry } from '../src/sessions.js';
import type { PeerResolver } from '../src/dispatch.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CEDAR_SCHEMA_PATH = resolve(
  HERE,
  '..',
  '..',
  'spec',
  'src',
  'cedar-schema.json',
);

export interface TestHarness {
  db: CloudDbClient;
  closeDb: () => Promise<void>;
  tenantDb: TenantDb;
  tenantId: string;
  agentDid: string;
  agentPrivate: Uint8Array;
  agentPublic: Uint8Array;
  peerDid: string;
  peerPrivate: Uint8Array;
  peerPublic: Uint8Array;
  resolver: PeerResolver;
  audit: PostgresAudit;
  pdp: Pdp;
  sessions: SessionRegistry;
  metrics: ReturnType<typeof createInMemoryMetrics>;
  logger: ReturnType<typeof createSilentLogger>;
  signFromPeer: (msg: DidCommMessage) => Promise<string>;
  createActiveConnection: (connectionId: string, cedarPolicies?: string[]) => Promise<void>;
}

const BASIC_PERMIT_POLICY = 'permit(principal, action, resource);';

export async function createTestHarness(params?: {
  agentDid?: string;
  peerDid?: string;
  tenantPrincipal?: string;
}): Promise<TestHarness> {
  const agentDid = params?.agentDid ?? 'did:web:samantha.agent';
  const peerDid = params?.peerDid ?? 'did:web:ghost.agent';
  const principalDid = params?.tenantPrincipal ?? 'did:web:ian.self.xyz';

  const { db, close: closeDb } = await createPgliteDb();

  const tenantRows = await db
    .insert(tenants)
    .values({ principalDid })
    .returning({ id: tenants.id });
  const tenantId = tenantRows[0]?.id;
  if (!tenantId) throw new Error('failed to seed tenant');

  const tenantDb = withTenant(db, toTenantId(tenantId));

  const agentPrivate = ed25519.utils.randomPrivateKey();
  const agentPublic = await ed25519.getPublicKeyAsync(agentPrivate);
  const peerPrivate = ed25519.utils.randomPrivateKey();
  const peerPublic = await ed25519.getPublicKeyAsync(peerPrivate);

  await tenantDb.createAgent({
    did: agentDid,
    principalDid,
    agentName: 'Samantha',
    agentDescription: 'test',
    publicKeyMultibase: ed25519RawToMultibase(agentPublic),
    handoffJson: {},
    wellKnownDid: {},
    wellKnownAgentCard: {},
    wellKnownArp: {},
    scopeCatalogVersion: 'v1',
    tlsFingerprint: 'cloud',
  });

  const resolver: PeerResolver = {
    async resolveDid(did) {
      if (did === peerDid) return makeDidDoc(peerDid, peerPublic);
      if (did === agentDid) return makeDidDoc(agentDid, agentPublic);
      return null;
    },
  };

  const logger = createSilentLogger();
  const metrics = createInMemoryMetrics();
  const sessions = createSessionRegistry();
  const audit = createPostgresAudit({ tenantDb, logger });
  const cedarSchemaJson = readFileSync(CEDAR_SCHEMA_PATH, 'utf8');
  const pdp = createPdp(cedarSchemaJson);

  async function signFromPeer(msg: DidCommMessage): Promise<string> {
    const env = await signEnvelope({
      message: { ...msg, from: peerDid, to: [agentDid] },
      signerDid: peerDid,
      privateKey: peerPrivate,
    });
    return env.compact;
  }

  async function createActiveConnection(
    connectionId: string,
    cedarPolicies: string[] = [BASIC_PERMIT_POLICY],
  ): Promise<void> {
    const token: ConnectionToken = {
      connection_id: connectionId,
      issuer: principalDid,
      subject: agentDid,
      audience: peerDid,
      purpose: 'test',
      cedar_policies: cedarPolicies,
      obligations: [],
      scope_catalog_version: 'v1',
      expires: new Date(Date.now() + 86400_000).toISOString(),
      sigs: { issuer: 'stub-sig-issuer', audience: 'stub-sig-audience' },
    };
    await tenantDb.createConnection({
      connectionId,
      agentDid,
      peerDid,
      label: null,
      purpose: 'test',
      tokenJws: JSON.stringify(token),
      tokenJson: token as unknown as Record<string, unknown>,
      cedarPolicies,
      obligations: [],
      scopeCatalogVersion: 'v1',
      metadata: null,
      expiresAt: null,
    });
  }

  return {
    db,
    closeDb,
    tenantDb,
    tenantId,
    agentDid,
    agentPrivate,
    agentPublic,
    peerDid,
    peerPrivate,
    peerPublic,
    resolver,
    audit,
    pdp,
    sessions,
    metrics,
    logger,
    signFromPeer,
    createActiveConnection,
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
    principal: {
      did,
      representationVC: `https://${host}/.well-known/representation.jwt`,
    },
  };
}
