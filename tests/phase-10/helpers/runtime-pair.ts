/**
 * Sidecar-side runtime fixture for the Phase-10 acceptance tests.
 *
 * Boots two `createRuntime(...)` instances in-process, wires an in-memory
 * fetch + transport resolver so messages exchanged via `transport.send`
 * actually reach the peer's `/didcomm` endpoint, and exposes helpers to
 * pre-seed Connection Tokens + drive request-reply traffic.
 *
 * Mirrors the in-tree pattern from `packages/runtime/tests/runtime.test.ts`
 * but lifted into a reusable helper so the seven Phase-10 tests can share
 * it without copy-paste.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import {
  createInMemoryKeyStore,
  ed25519RawToMultibase,
  type TransportResolver,
} from '@kybernesis/arp-transport';
import type { Resolver } from '@kybernesis/arp-resolver';
import {
  createRuntime,
  type Runtime,
  type RuntimeOptions,
} from '@kybernesis/arp-runtime';

const SCHEMA = readFileSync(
  resolve(__dirname, '..', '..', '..', 'packages', 'spec', 'src', 'cedar-schema.json'),
  'utf8',
);

const STUB_RESOLVER: Resolver = {
  async resolveHns() {
    return { a: [], aaaa: [], txt: {} };
  },
  async resolveDidWeb() {
    return { ok: false, error: { code: 'unsupported_method', message: 'stub' } };
  },
  clearCache() {},
};

export interface SidecarHandle {
  did: string;
  runtime: Runtime;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  publicKeyMultibase: string;
  port: number;
  baseUrl: string;
  /** Drains both sides until both inboxes report quiescence twice in a row. */
  drainAll(): Promise<void>;
}

export interface InFlightEnvelope {
  /** Receiving DID — derived from the dispatched URL. */
  toDid: string;
  /** Decoded DIDComm message payload. */
  payload: {
    id: string;
    type: string;
    from?: string;
    to?: string[];
    body?: Record<string, unknown>;
    thid?: string;
  };
}

export interface SidecarPair {
  alice: SidecarHandle;
  bob: SidecarHandle;
  /** Every envelope dispatched between the two sidecars, in order. */
  envelopeLog: InFlightEnvelope[];
  /** Cleanup — closes both runtimes + tmp dirs. Idempotent. */
  cleanup(): Promise<void>;
}

interface SharedBus {
  keys: Record<string, Uint8Array>;
  endpoints: Record<string, URL>;
  urlToDid: Record<string, string>;
  receivers: Record<string, (body: string) => Promise<{ ok: boolean; error?: unknown }>>;
}

function decodePayload(envelope: string): InFlightEnvelope['payload'] | null {
  try {
    const parts = envelope.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1]!, 'base64url').toString('utf8');
    return JSON.parse(payloadJson) as InFlightEnvelope['payload'];
  } catch {
    return null;
  }
}

function makeSharedFetch(bus: SharedBus, log: InFlightEnvelope[]): typeof fetch {
  return async (input, _init) => {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const did = bus.urlToDid[urlStr];
    if (!did) return new Response('unknown endpoint', { status: 404 });
    const init = _init ?? {};
    const body = typeof init.body === 'string' ? init.body : '';
    const decoded = decodePayload(body);
    if (decoded) {
      log.push({ toDid: did, payload: decoded });
    }
    const r = await bus.receivers[did]!(body);
    return new Response(r.ok ? JSON.stringify({ ok: true }) : JSON.stringify(r.error), {
      status: r.ok ? 200 : 400,
    });
  };
}

function makeSharedResolver(bus: SharedBus): TransportResolver {
  return {
    async resolveEd25519PublicKey(did) {
      const k = bus.keys[did];
      if (!k) throw new Error(`no key for ${did}`);
      return k;
    },
    async resolveDidCommEndpoint(did) {
      const url = bus.endpoints[did];
      if (!url) throw new Error(`no endpoint for ${did}`);
      return url;
    },
  };
}

export interface MintSidecarOptions extends Partial<RuntimeOptions> {
  /** Custom dispatch handler (for message-roundtrip / policy-deny tests). */
  dispatch?: RuntimeOptions['dispatch'];
}

/**
 * Boot two runtimes wired together. Returns handles for both sides plus a
 * cleanup function. Each runtime listens on a fresh tmp dir so registry,
 * audit, mailbox, and (optionally) auth.sqlite stay isolated.
 */
export async function bootSidecarPair(opts: {
  aliceDid: string;
  bobDid: string;
  alicePrincipalDid?: string;
  bobPrincipalDid?: string;
  /** Forwarded into BOTH runtimes if set. */
  withWebauthn?: boolean;
  aliceDispatch?: RuntimeOptions['dispatch'];
  bobDispatch?: RuntimeOptions['dispatch'];
}): Promise<SidecarPair> {
  const dirs: string[] = [];
  const runtimes: Runtime[] = [];
  const bus: SharedBus = {
    keys: {},
    endpoints: {},
    urlToDid: {},
    receivers: {},
  };
  const envelopeLog: InFlightEnvelope[] = [];
  const sharedFetch = makeSharedFetch(bus, envelopeLog);
  const sharedResolver = makeSharedResolver(bus);

  async function mint(
    did: string,
    principalDid: string,
    dispatch?: RuntimeOptions['dispatch'],
  ): Promise<SidecarHandle> {
    const dir = mkdtempSync(join(tmpdir(), 'arp-phase10-'));
    dirs.push(dir);
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const pubMb = ed25519RawToMultibase(pub);
    const endpoint = new URL(
      `http://127.0.0.1/phase10/${encodeURIComponent(did)}/didcomm`,
    );
    bus.endpoints[did] = endpoint;
    bus.urlToDid[endpoint.toString()] = did;
    bus.keys[did] = pub;

    const runtimeOpts: RuntimeOptions = {
      config: {
        did,
        principalDid,
        publicKeyMultibase: pubMb,
        agentName: did.split(':').slice(-1)[0] ?? 'agent',
        agentDescription: 'phase-10 acceptance fixture',
        wellKnownUrls: {
          didcomm: endpoint.toString(),
          agentCard: `http://127.0.0.1/phase10/${encodeURIComponent(did)}/agent-card.json`,
          arpJson: `http://127.0.0.1/phase10/${encodeURIComponent(did)}/arp.json`,
        },
        representationVcUrl: `http://127.0.0.1/phase10/${encodeURIComponent(did)}/representation.jwt`,
        scopeCatalogVersion: 'v1',
        tlsFingerprint: 'a'.repeat(64),
      },
      keyStore: createInMemoryKeyStore(did, priv),
      resolver: STUB_RESOLVER,
      transportResolver: sharedResolver,
      transportFetch: sharedFetch,
      cedarSchemaJson: SCHEMA,
      registryPath: join(dir, 'registry.sqlite'),
      auditDir: join(dir, 'audit'),
      mailboxPath: join(dir, 'mailbox.sqlite'),
      adminToken: 's3cret-phase10',
      ...(dispatch ? { dispatch } : {}),
      ...(opts.withWebauthn
        ? {
            webauthn: {
              storePath: join(dir, 'auth.sqlite'),
              rpId: 'localhost',
              rpName: 'phase-10 test',
              origins: ['http://localhost:7878'],
            },
          }
        : {}),
    };

    const runtime = await createRuntime(runtimeOpts);
    runtimes.push(runtime);
    bus.receivers[did] = (body) => runtime.transport.receiveEnvelope(body);
    const { port } = await runtime.start(0);

    return {
      did,
      runtime,
      publicKey: pub,
      privateKey: priv,
      publicKeyMultibase: pubMb,
      port,
      baseUrl: `http://127.0.0.1:${port}`,
      drainAll: async () => {
        // Loop until both sides report two consecutive quiet drains.
        let quiet = 0;
        while (quiet < 2) {
          const a = await alice.runtime.transport.drainInbox();
          const b = await bob.runtime.transport.drainInbox();
          if (a === 0 && b === 0) quiet++;
          else quiet = 0;
        }
      },
    };
  }

  const alice = await mint(
    opts.aliceDid,
    opts.alicePrincipalDid ?? 'did:web:alice-owner.example.agent',
    opts.aliceDispatch,
  );
  const bob = await mint(
    opts.bobDid,
    opts.bobPrincipalDid ?? 'did:web:bob-owner.example.agent',
    opts.bobDispatch,
  );

  return {
    alice,
    bob,
    envelopeLog,
    cleanup: async () => {
      while (runtimes.length) {
        const r = runtimes.pop();
        try {
          await r?.stop();
        } catch {
          /* ignore */
        }
      }
      while (dirs.length) {
        const d = dirs.pop();
        if (d) rmSync(d, { recursive: true, force: true });
      }
    },
  };
}
