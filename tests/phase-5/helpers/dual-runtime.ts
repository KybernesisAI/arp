/**
 * Shared test harness for Phase-5 acceptance tests.
 *
 * Spins up two ARP runtimes (Samantha + Ghost) in-process, bridged by a
 * test transport that mirrors the Phase-4 pairing-demo setup:
 *   - in-memory resolver maps every DID to a canned DID document
 *   - transport fetch dispatches to the other runtime's `receiveEnvelope`
 *   - admin token is shared for both sides
 *
 * Used by: bundle-coverage, cross-connection-isolation, revocation-races,
 * testkit-integration.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ed25519 from '@noble/ed25519';

const HELPERS_DIR = dirname(fileURLToPath(import.meta.url));
import { createRuntime, type Runtime } from '@kybernesis/arp-runtime';
import {
  createInMemoryKeyStore,
  ed25519RawToMultibase,
  type TransportResolver,
} from '@kybernesis/arp-transport';
import type { DidDocument } from '@kybernesis/arp-spec';
import type { Resolver } from '@kybernesis/arp-resolver';
import type { DidResolver } from '@kybernesis/arp-pairing';
import type { DispatchHandler } from '@kybernesis/arp-runtime';
import { createSamanthaDispatch, createFixtureKb as samanthaKb } from '@kybernesis/arp-samantha-reference';
import { createGhostDispatch, createFixtureKb as ghostKb } from '@kybernesis/arp-ghost-reference';

export const CEDAR_SCHEMA_PATH = resolve(
  HELPERS_DIR,
  '..',
  '..',
  '..',
  'packages',
  'spec',
  'src',
  'cedar-schema.json',
);

export const SCOPES_DIR = resolve(
  HELPERS_DIR,
  '..',
  '..',
  '..',
  'packages',
  'scope-catalog',
  'scopes',
);

export interface AgentIdentity {
  agentDid: string;
  principalDid: string;
  /** Principal private key. */
  principalPrivateKey: Uint8Array;
  principalPublicKey: Uint8Array;
  /** Agent (runtime) private key. */
  agentPrivateKey: Uint8Array;
  agentPublicKey: Uint8Array;
}

export interface DualRuntime {
  samantha: Runtime;
  ghost: Runtime;
  samanthaPort: number;
  ghostPort: number;
  ianPrincipal: AgentIdentity;
  nickPrincipal: AgentIdentity;
  /** In-memory resolver usable from the pairing verifier. */
  pairingResolver: DidResolver;
  adminToken: string;
  /** Drain both transports until fully quiescent. */
  fullyDrain: () => Promise<void>;
  /** Tear down runtimes + temp dirs. */
  close: () => Promise<void>;
}

const TEMP_DIRS: string[] = [];

async function mintIdentity(
  agentDid: string,
  principalDid: string,
): Promise<AgentIdentity> {
  const agentPrivateKey = ed25519.utils.randomPrivateKey();
  const agentPublicKey = await ed25519.getPublicKeyAsync(agentPrivateKey);
  const principalPrivateKey = ed25519.utils.randomPrivateKey();
  const principalPublicKey = await ed25519.getPublicKeyAsync(principalPrivateKey);
  return {
    agentDid,
    principalDid,
    principalPrivateKey,
    principalPublicKey,
    agentPrivateKey,
    agentPublicKey,
  };
}

function didDoc(params: {
  did: string;
  controller: string;
  publicKey: Uint8Array;
  principalDid: string;
}): DidDocument {
  const keyId = `${params.did}#key-1`;
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: params.did,
    controller: params.controller,
    verificationMethod: [
      {
        id: keyId,
        type: 'Ed25519VerificationKey2020',
        controller: params.did,
        publicKeyMultibase: ed25519RawToMultibase(params.publicKey),
      },
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
    keyAgreement: [keyId],
    service: [
      {
        id: `${params.did}#didcomm`,
        type: 'DIDCommMessaging',
        serviceEndpoint: `https://${params.did.replace('did:web:', '')}/didcomm`,
        accept: ['didcomm/v2'],
      },
    ],
    principal: {
      did: params.principalDid,
      representationVC: `https://${params.did.replace('did:web:', '')}/.well-known/representation.jwt`,
    },
  };
}

const STUB_RESOLVER: Resolver = {
  async resolveHns() {
    return { a: [], aaaa: [], txt: {} };
  },
  async resolveDidWeb() {
    return { ok: false, error: { code: 'unsupported_method', message: 'stub' } };
  },
  clearCache() {},
};

export interface DualRuntimeOptions {
  samanthaPort?: number;
  ghostPort?: number;
  adminToken?: string;
  /**
   * Override the dispatch handlers. Defaults to the shipped Samantha/Ghost
   * dispatchers with empty KBs. Tests that need custom per-connection
   * behaviour override here.
   */
  samanthaDispatch?: DispatchHandler;
  ghostDispatch?: DispatchHandler;
}

export async function createDualRuntime(opts: DualRuntimeOptions = {}): Promise<DualRuntime> {
  const samanthaPort = opts.samanthaPort ?? 5501;
  const ghostPort = opts.ghostPort ?? 5502;
  const adminToken = opts.adminToken ?? 'phase5-admin-token';

  const SCHEMA = readFileSync(CEDAR_SCHEMA_PATH, 'utf8');

  const [ian, nick, samanthaId, ghostId] = await Promise.all([
    mintIdentity('did:web:ian.example.agent', 'did:web:ian.example.agent'),
    mintIdentity('did:web:nick.example.agent', 'did:web:nick.example.agent'),
    mintIdentity('did:web:samantha.agent', 'did:web:ian.example.agent'),
    mintIdentity('did:web:ghost.agent', 'did:web:nick.example.agent'),
  ]);

  const docs: Record<string, DidDocument> = {
    'did:web:ian.example.agent': didDoc({
      did: 'did:web:ian.example.agent',
      controller: 'did:web:ian.example.agent',
      publicKey: ian.principalPublicKey,
      principalDid: 'did:web:ian.example.agent',
    }),
    'did:web:nick.example.agent': didDoc({
      did: 'did:web:nick.example.agent',
      controller: 'did:web:nick.example.agent',
      publicKey: nick.principalPublicKey,
      principalDid: 'did:web:nick.example.agent',
    }),
    'did:web:samantha.agent': didDoc({
      did: 'did:web:samantha.agent',
      controller: 'did:web:ian.example.agent',
      publicKey: samanthaId.agentPublicKey,
      principalDid: 'did:web:ian.example.agent',
    }),
    'did:web:ghost.agent': didDoc({
      did: 'did:web:ghost.agent',
      controller: 'did:web:nick.example.agent',
      publicKey: ghostId.agentPublicKey,
      principalDid: 'did:web:nick.example.agent',
    }),
  };

  const pairingResolver: DidResolver = {
    async resolve(did) {
      const doc = docs[did];
      if (!doc) return { ok: false, reason: `unknown DID ${did}` };
      return { ok: true, value: doc };
    },
  };

  const sharedKeys: Record<string, Uint8Array> = {
    'did:web:samantha.agent': samanthaId.agentPublicKey,
    'did:web:ghost.agent': ghostId.agentPublicKey,
  };
  const sharedEndpoints: Record<string, URL> = {
    'did:web:samantha.agent': new URL(`http://127.0.0.1:${samanthaPort}/didcomm`),
    'did:web:ghost.agent': new URL(`http://127.0.0.1:${ghostPort}/didcomm`),
  };
  const sharedReceivers: Record<
    string,
    (body: string) => Promise<{ ok: boolean; error?: unknown }>
  > = {};

  const transportResolver: TransportResolver = {
    async resolveEd25519PublicKey(did) {
      const k = sharedKeys[did];
      if (!k) throw new Error(`no key for ${did}`);
      return k;
    },
    async resolveDidCommEndpoint(did) {
      const url = sharedEndpoints[did];
      if (!url) throw new Error(`no endpoint for ${did}`);
      return url;
    },
  };

  const transportFetch: typeof fetch = async (input, init) => {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const entry = Object.entries(sharedEndpoints).find(([, u]) => u.toString() === urlStr);
    if (!entry) return new Response('unknown endpoint', { status: 404 });
    const [did] = entry;
    const body = typeof init?.body === 'string' ? init.body : '';
    const recv = sharedReceivers[did];
    if (!recv) return new Response('receiver not ready', { status: 503 });
    const r = await recv(body);
    return new Response(r.ok ? JSON.stringify({ ok: true }) : JSON.stringify(r.error), {
      status: r.ok ? 200 : 400,
    });
  };

  async function buildAgent(
    id: AgentIdentity,
    port: number,
    dispatch: DispatchHandler,
  ): Promise<Runtime> {
    const dir = mkdtempSync(join(tmpdir(), `arp-phase5-${id.agentDid.split(':')[2]}-`));
    TEMP_DIRS.push(dir);
    const runtime = await createRuntime({
      config: {
        did: id.agentDid,
        principalDid: id.principalDid,
        publicKeyMultibase: ed25519RawToMultibase(id.agentPublicKey),
        agentName: id.agentDid.split(':')[2] ?? 'agent',
        agentDescription: `phase-5 fixture ${id.agentDid}`,
        wellKnownUrls: {
          didcomm: `http://127.0.0.1:${port}/didcomm`,
          agentCard: `http://127.0.0.1:${port}/.well-known/agent-card.json`,
          arpJson: `http://127.0.0.1:${port}/.well-known/arp.json`,
        },
        representationVcUrl: `http://127.0.0.1:${port}/.well-known/representation.jwt`,
        scopeCatalogVersion: 'v1',
        tlsFingerprint: 'a'.repeat(64),
      },
      keyStore: createInMemoryKeyStore(id.agentDid, id.agentPrivateKey),
      resolver: STUB_RESOLVER,
      transportResolver,
      transportFetch,
      cedarSchemaJson: SCHEMA,
      registryPath: join(dir, 'registry.sqlite'),
      auditDir: join(dir, 'audit'),
      mailboxPath: join(dir, 'mailbox.sqlite'),
      adminToken,
      dispatch,
    });
    await runtime.start(port);
    sharedReceivers[id.agentDid] = runtime.transport.receiveEnvelope.bind(runtime.transport);
    return runtime;
  }

  const samanthaDispatch =
    opts.samanthaDispatch ??
    createSamanthaDispatch({
      knowledgeBase: samanthaKb({}),
    });
  const ghostDispatch =
    opts.ghostDispatch ??
    createGhostDispatch({
      knowledgeBase: ghostKb({}),
    });

  const samantha = await buildAgent(samanthaId, samanthaPort, samanthaDispatch);
  const ghost = await buildAgent(ghostId, ghostPort, ghostDispatch);

  async function fullyDrain(): Promise<void> {
    let quiescent = 0;
    while (quiescent < 2) {
      const s = await samantha.transport.drainInbox();
      const g = await ghost.transport.drainInbox();
      if (s === 0 && g === 0) quiescent++;
      else quiescent = 0;
    }
  }

  async function close(): Promise<void> {
    try {
      await samantha.stop({ graceMs: 500 });
    } catch {
      /* ignore */
    }
    try {
      await ghost.stop({ graceMs: 500 });
    } catch {
      /* ignore */
    }
    while (TEMP_DIRS.length) {
      const d = TEMP_DIRS.pop();
      if (d) {
        try {
          rmSync(d, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }
  }

  return {
    samantha,
    ghost,
    samanthaPort,
    ghostPort,
    ianPrincipal: ian,
    nickPrincipal: nick,
    pairingResolver,
    adminToken,
    fullyDrain,
    close,
  };
}

export async function postConnection(
  port: number,
  adminToken: string,
  token: unknown,
): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${port}/admin/connections`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new Error(`POST /admin/connections → ${res.status} ${await res.text()}`);
  }
}

export async function adminPost(
  port: number,
  adminToken: string,
  path: string,
  body: unknown,
): Promise<Response> {
  return await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
