/**
 * Shared helper for phase-6 adapter conformance tests.
 *
 * Builds an ArpAgent backed by the SDK with an in-memory transport
 * resolver (so the agent's HTTP server can bind to 127.0.0.1 without
 * reaching DNS) and a single seeded connection. Returns everything a
 * conformance test needs to run the testkit probes and assert outbound
 * adapter behaviour.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import * as ed25519 from '@noble/ed25519';
import { ArpAgent, type HandoffBundle } from '@kybernesis/arp-sdk';
import {
  ed25519RawToMultibase,
  type TransportResolver,
} from '@kybernesis/arp-transport';

const req = createRequire(import.meta.url);

export interface BuiltAgent {
  agent: ArpAgent;
  port: number;
  baseUrl: string;
  connectionId: string;
  peerDid: string;
  handoff: HandoffBundle;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  publicKeyMultibase: string;
  cleanup: () => Promise<void>;
}

let nextPort = 18700;

export async function buildExampleAgent(opts: {
  slug: string;
  obligations?: Array<{ type: string; params: Record<string, unknown> }>;
  allowAll?: boolean;
  connectionId?: string;
}): Promise<BuiltAgent> {
  const port = nextPort++;
  const did = `did:web:phase6-${opts.slug}.agent`;
  const peerDid = `did:web:phase6-${opts.slug}-peer.agent`;
  const principalDid = `did:web:phase6-${opts.slug}-owner.example.agent`;

  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  const publicKeyMultibase = ed25519RawToMultibase(publicKey);
  const peerPrivate = ed25519.utils.randomPrivateKey();
  const peerPublic = await ed25519.getPublicKeyAsync(peerPrivate);

  const dataDir = mkdtempSync(join(tmpdir(), `arp-phase6-${opts.slug}-`));

  const origin = `http://127.0.0.1:${port}`;
  const handoff: HandoffBundle = {
    agent_did: did,
    principal_did: principalDid,
    public_key_multibase: publicKeyMultibase,
    well_known_urls: {
      did: `${origin}/.well-known/did.json`,
      agent_card: `${origin}/.well-known/agent-card.json`,
      arp: `${origin}/.well-known/arp.json`,
    },
    dns_records_published: ['A'],
    cert_expires_at: '2030-01-01T00:00:00.000Z',
    bootstrap_token: 'phase6-stub',
  };

  const transportResolver: TransportResolver = {
    async resolveEd25519PublicKey(targetDid) {
      if (targetDid === did) return publicKey;
      if (targetDid === peerDid) return peerPublic;
      throw new Error(`no key for ${targetDid}`);
    },
    async resolveDidCommEndpoint(targetDid) {
      if (targetDid === did) return new URL(`${origin}/didcomm`);
      if (targetDid === peerDid) return new URL(`http://127.0.0.1:1/didcomm`);
      throw new Error(`no endpoint for ${targetDid}`);
    },
  };

  const agent = await ArpAgent.fromHandoff(handoff, {
    dataDir,
    privateKey,
    transportResolver,
    adminToken: 'phase6-admin',
    agentName: `Phase6 ${opts.slug}`,
    agentDescription: `Phase-6 conformance fixture for ${opts.slug}`,
    onIncoming: async (task) => ({
      body: { tool: task.action, echo: task.body, fixture: 'phase6' },
    }),
  });

  const { port: boundPort } = await agent.start({ port });

  const connectionId =
    opts.connectionId ?? `conn_${opts.slug.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}`;
  const policy = opts.allowAll === false
    ? `@id("p_deny")\nforbid(principal, action, resource);`
    : `@id("p_allow_all")\npermit(principal, action, resource);`;
  const token = {
    connection_id: connectionId,
    issuer: principalDid,
    subject: did,
    audience: peerDid,
    purpose: `phase6 ${opts.slug}`,
    cedar_policies: [policy],
    obligations: opts.obligations ?? [],
    scope_catalog_version: 'v1',
    expires: '2030-01-01T00:00:00.000Z',
    sigs: { issuer: 'x', audience: 'y' },
  };
  await agent.connections.add(token, JSON.stringify(token));

  return {
    agent,
    port: boundPort,
    baseUrl: `http://127.0.0.1:${boundPort}`,
    connectionId,
    peerDid,
    handoff,
    privateKey,
    publicKey,
    publicKeyMultibase,
    async cleanup() {
      try {
        await agent.stop({ graceMs: 500 });
      } catch {
        /* ignore */
      }
      try {
        rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

/** Read the cedar schema the SDK ships with. Useful for integration tests. */
export function cedarSchemaJson(): string {
  const path = req.resolve('@kybernesis/arp-spec/cedar-schema.json');
  return readFileSync(path, 'utf8');
}
