/**
 * End-to-end reconnect test:
 *
 *   [fake peer] ----(envelope)----> [cloud-runtime HTTP /didcomm]
 *                                          │
 *                                          ▼ (enqueue in messages)
 *                                  [cloud ws server] ---push/ack---
 *                                          │
 *                                          ▼
 *                                  [cloud-client]
 *                                          │
 *                                          ▼ (HTTP POST)
 *                                 [fake local agent HTTP]
 *
 * Scenario: send 100 messages, kill the WebSocket at message 50, restart,
 * verify all 100 eventually delivered to the local agent with no loss.
 *
 * This is simultaneously Task 12 (reconnect regression) and the main
 * integration test for @kybernesis/arp-cloud-client.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { WebSocket as WsWebSocket } from 'ws';
import {
  createPgliteDb,
  tenants,
  toTenantId,
  withTenant,
  type CloudDbClient,
} from '@kybernesis/arp-cloud-db';
import {
  createCloudWsServer,
  createPostgresAudit,
  createSessionRegistry,
  createSilentLogger,
  createInMemoryMetrics,
  dispatchInbound,
  type PeerResolver,
} from '@kybernesis/arp-cloud-runtime';
import { createPdp } from '@kybernesis/arp-pdp';
import {
  ed25519RawToMultibase,
  signEnvelope,
} from '@kybernesis/arp-transport';
import type { DidDocument, ConnectionToken } from '@kybernesis/arp-spec';
import { createCloudClient } from '../src/client.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CEDAR_SCHEMA_PATH = resolve(
  HERE,
  '..',
  '..',
  'spec',
  'src',
  'cedar-schema.json',
);

const BASIC_PERMIT = 'permit(principal, action, resource);';

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

describe('cloud-client reconnect regression', () => {
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

  it('100 messages + kill ws at 50 + reconnect → all delivered exactly once, in order', async () => {
    // -------- db + tenant + agent + connection -------------
    const { db, close: closeDb } = await createPgliteDb();
    cleanups.push(closeDb);

    const agentDid = 'did:web:samantha.agent';
    const peerDid = 'did:web:ghost.agent';
    const principalDid = 'did:web:ian.example.agent';

    const agentPriv = ed25519.utils.randomPrivateKey();
    const agentPub = await ed25519.getPublicKeyAsync(agentPriv);
    const peerPriv = ed25519.utils.randomPrivateKey();
    const peerPub = await ed25519.getPublicKeyAsync(peerPriv);

    const tenantRow = (
      await db.insert(tenants).values({ principalDid }).returning({ id: tenants.id })
    )[0];
    if (!tenantRow) throw new Error('no tenant');
    const tenantDb = withTenant(db, toTenantId(tenantRow.id));
    await tenantDb.createAgent({
      did: agentDid,
      principalDid,
      agentName: 'Samantha',
      agentDescription: '',
      publicKeyMultibase: ed25519RawToMultibase(agentPub),
      handoffJson: {},
      wellKnownDid: {},
      wellKnownAgentCard: {},
      wellKnownArp: {},
      scopeCatalogVersion: 'v1',
      tlsFingerprint: 'cloud',
    });
    const token: ConnectionToken = {
      connection_id: 'conn_reco01',
      issuer: principalDid,
      subject: agentDid,
      audience: peerDid,
      purpose: 'reconnect-test',
      cedar_policies: [BASIC_PERMIT],
      obligations: [],
      scope_catalog_version: 'v1',
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      sigs: { issuer: 'sig', audience: 'sig' },
    };
    await tenantDb.createConnection({
      connectionId: 'conn_reco01',
      agentDid,
      peerDid,
      label: null,
      purpose: 'reconnect-test',
      tokenJws: JSON.stringify(token),
      tokenJson: token as unknown as Record<string, unknown>,
      cedarPolicies: [BASIC_PERMIT],
      obligations: [],
      scopeCatalogVersion: 'v1',
      metadata: null,
      expiresAt: null,
    });

    // -------- cloud runtime plumbing -----------------------
    const logger = createSilentLogger();
    const metrics = createInMemoryMetrics();
    const sessions = createSessionRegistry();
    const pdp = createPdp(readFileSync(CEDAR_SCHEMA_PATH, 'utf8'));
    const resolver: PeerResolver = {
      async resolveDid(did) {
        if (did === peerDid) return makeDidDoc(peerDid, peerPub);
        if (did === agentDid) return makeDidDoc(agentDid, agentPub);
        return null;
      },
    };

    const ws = createCloudWsServer({ db: db as unknown as CloudDbClient, sessions, logger });
    const wsListen = await ws.listen(0);
    cleanups.push(() => ws.close());

    // -------- fake local agent HTTP ------------------------
    const delivered = new Map<string, number>();
    const localServer = createServer((req, res) => {
      if (req.method === 'POST' && req.url?.startsWith('/didcomm')) {
        let body = '';
        req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
        req.on('end', () => {
          const id = req.headers['x-arp-cloud-msg-id'] as string | undefined;
          if (id) delivered.set(id, (delivered.get(id) ?? 0) + 1);
          res.statusCode = 200;
          res.end('ok');
        });
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    const localPort = await new Promise<number>((resolve2) => {
      localServer.listen(0, '127.0.0.1', () => {
        const addr = localServer.address();
        resolve2(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });
    cleanups.push(() => new Promise<void>((r) => localServer.close(() => r())));

    // -------- deliver envelopes via cloud HTTP (in-process) -
    const metricsCtx = {
      tenantDb,
      tenantId: tenantRow.id,
      agentDid,
      audit: createPostgresAudit({ tenantDb, logger }),
      pdp,
      resolver,
      sessions,
      logger,
      metrics,
      now: () => Date.now(),
    };

    async function sendEnvelope(i: number): Promise<void> {
      const env = await signEnvelope({
        message: {
          id: `m${i}`,
          type: 'https://didcomm.org/arp/1.0/request',
          from: peerDid,
          to: [agentDid],
          body: { connection_id: 'conn_reco01', action: 'ping', seq: i },
        },
        signerDid: peerDid,
        privateKey: peerPriv,
      });
      const r = await dispatchInbound(metricsCtx, env.compact);
      expect(r.ok).toBe(true);
    }

    // -------- start client -----------------------------------
    function makeClient(): ReturnType<typeof createCloudClient> {
      return createCloudClient({
        cloudWsUrl: `ws://127.0.0.1:${wsListen.port}/ws`,
        agentDid,
        agentPrivateKey: agentPriv,
        agentApiUrl: `http://127.0.0.1:${localPort}`,
        initialBackoffMs: 50,
        maxBackoffMs: 250,
        webSocketCtor: WsWebSocket as unknown as import('../src/types.js').WebSocketLike,
      });
    }

    const firstClient = makeClient();
    cleanups.push(() => firstClient.stop());

    // Wait for connected.
    await waitUntil(() => sessions.size() === 1, 5000);

    // Send first 50 messages through the cloud HTTP.
    for (let i = 0; i < 50; i++) await sendEnvelope(i);

    await waitUntil(() => delivered.size === 50, 5000);

    // Kill the ws session; the cloud should retain queued status on any
    // in-flight sends from the drain when the second batch arrives.
    await firstClient.stop();
    cleanups.pop(); // remove the stop hook we just ran

    // While disconnected, send the next 50.
    for (let i = 50; i < 100; i++) await sendEnvelope(i);

    // Reconnect with a fresh client.
    const secondClient = makeClient();
    cleanups.push(() => secondClient.stop());

    await waitUntil(() => sessions.size() === 1, 5000);
    await waitUntil(() => delivered.size === 100, 10_000);

    expect(delivered.size).toBe(100);
    // Every message exactly once.
    for (const [, count] of delivered) expect(count).toBe(1);
  }, 30_000);
});

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(20);
  }
  throw new Error(`waitUntil timed out after ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
