import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import {
  createInMemoryKeyStore,
  ed25519RawToMultibase,
  type TransportResolver,
} from '@kybernesis/arp-transport';
import type { ConnectionToken } from '@kybernesis/arp-spec';
import type { Resolver } from '@kybernesis/arp-resolver';
import { createRuntime, type Runtime, type RuntimeOptions } from '../src/runtime.js';

const SCHEMA = readFileSync(
  resolve(__dirname, '..', '..', 'spec', 'src', 'cedar-schema.json'),
  'utf8',
);

const dirs: string[] = [];
const runtimes: Runtime[] = [];

afterEach(async () => {
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
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'arp-runtime-'));
  dirs.push(d);
  return d;
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

async function mintAgent(did: string, port: number, overrides?: Partial<RuntimeOptions>) {
  const dir = tempDir();
  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  const runtime = await createRuntime({
    config: {
      did,
      principalDid: 'did:web:ian.example.agent',
      publicKeyMultibase: ed25519RawToMultibase(pub),
      agentName: did.split(':')[2] ?? 'agent',
      agentDescription: 'test agent',
      wellKnownUrls: {
        didcomm: `http://127.0.0.1:${port}/didcomm`,
        agentCard: `http://127.0.0.1:${port}/.well-known/agent-card.json`,
        arpJson: `http://127.0.0.1:${port}/.well-known/arp.json`,
      },
      representationVcUrl: `http://127.0.0.1:${port}/.well-known/representation.jwt`,
      scopeCatalogVersion: 'v1',
      tlsFingerprint: 'a'.repeat(64),
    },
    keyStore: createInMemoryKeyStore(did, priv),
    resolver: STUB_RESOLVER,
    cedarSchemaJson: SCHEMA,
    registryPath: join(dir, 'registry.sqlite'),
    auditDir: join(dir, 'audit'),
    mailboxPath: join(dir, 'mailbox.sqlite'),
    ...overrides,
  });
  runtimes.push(runtime);
  return { runtime, priv, pub };
}

describe('createRuntime — well-known + health', () => {
  it('serves did.json, agent-card.json, arp.json, /health, and 501s on /pair', async () => {
    const { runtime } = await mintAgent('did:web:samantha.agent', 0);
    const { port } = await runtime.start(0);
    const base = `http://127.0.0.1:${port}`;

    const health = (await (await fetch(`${base}/health`)).json()) as {
      ok: boolean;
      did: string;
    };
    expect(health.ok).toBe(true);
    expect(health.did).toBe('did:web:samantha.agent');

    const didDoc = (await (await fetch(`${base}/.well-known/did.json`)).json()) as {
      id: string;
    };
    expect(didDoc.id).toBe('did:web:samantha.agent');

    const card = (await (await fetch(`${base}/.well-known/agent-card.json`)).json()) as {
      did: string;
    };
    expect(card.did).toBe('did:web:samantha.agent');

    const arp = (await (await fetch(`${base}/.well-known/arp.json`)).json()) as {
      version: string;
    };
    expect(arp.version).toBe('0.1');

    const pair = await fetch(`${base}/pair`, { method: 'POST' });
    expect(pair.status).toBe(501);
  });
});

describe('createRuntime — PDP pipeline', () => {
  it('audits allow, deny, and revoked paths in order', async () => {
    // Wire two runtimes (Samantha + Ghost) sharing an in-process fetch.
    const { runtime: samantha, priv: samPriv, pub: samPub } = await mintAgentForPipeline(
      'did:web:samantha.agent',
    );
    const { runtime: ghost, priv: ghostPriv, pub: ghostPub } = await mintAgentForPipeline(
      'did:web:ghost.agent',
    );
    await samantha.start(0);
    await ghost.start(0);

    // Fill the shared resolver table now that both servers are bound.
    sharedKeys['did:web:samantha.agent'] = samPub;
    sharedKeys['did:web:ghost.agent'] = ghostPub;

    // Pre-seed both sides with the same Connection Token (allow read on alpha).
    const token: ConnectionToken = {
      connection_id: 'conn_alpha_integ',
      issuer: 'did:web:ian.example.agent',
      subject: 'did:web:samantha.agent',
      audience: 'did:web:ghost.agent',
      purpose: 'project:alpha',
      cedar_policies: [
        `permit (
          principal == Agent::"did:web:ghost.agent",
          action in [Action::"read", Action::"summarize"],
          resource in Project::"alpha"
        );`,
      ],
      obligations: [],
      scope_catalog_version: 'v1',
      expires: '2099-01-01T00:00:00Z',
      sigs: { ian: 'sig-ian', ghost_owner: 'sig-ghost' },
    };
    await samantha.addConnection(token);
    await ghost.addConnection({
      ...token,
      subject: 'did:web:ghost.agent',
      audience: 'did:web:samantha.agent',
    });

    async function fullyDrain() {
      // A single drainInbox may return an in-flight promise that only covers
      // messages visible when it STARTED. Loop until both sides are quiet.
      let quiescent = 0;
      while (quiescent < 2) {
        const s = await samantha.transport.drainInbox();
        const g = await ghost.transport.drainInbox();
        if (s === 0 && g === 0) quiescent++;
        else quiescent = 0;
      }
    }

    // Ghost sends a valid allow request to Samantha. Let the dispatcher reply.
    await ghost.transport.send('did:web:samantha.agent', {
      id: 'msg-allow-1',
      type: 'https://didcomm.org/arp/1.0/request',
      from: 'did:web:ghost.agent',
      to: ['did:web:samantha.agent'],
      body: {
        connection_id: 'conn_alpha_integ',
        action: 'read',
        resource: 'Project:alpha',
      },
    });
    await fullyDrain();

    // Deny: action not in the permit set.
    await ghost.transport.send('did:web:samantha.agent', {
      id: 'msg-deny-1',
      type: 'https://didcomm.org/arp/1.0/request',
      from: 'did:web:ghost.agent',
      to: ['did:web:samantha.agent'],
      body: {
        connection_id: 'conn_alpha_integ',
        action: 'write',
        resource: 'Project:alpha',
      },
    });
    await fullyDrain();

    // Revoke on Samantha; subsequent requests audit with reason=revoked.
    await samantha.revokeConnection('conn_alpha_integ', 'user_requested');
    await ghost.transport.send('did:web:samantha.agent', {
      id: 'msg-revoked-1',
      type: 'https://didcomm.org/arp/1.0/request',
      from: 'did:web:ghost.agent',
      to: ['did:web:samantha.agent'],
      body: {
        connection_id: 'conn_alpha_integ',
        action: 'read',
        resource: 'Project:alpha',
      },
    });
    await fullyDrain();

    const log = samantha.auditFor('conn_alpha_integ');
    const verification = log.verify();
    expect(verification.valid).toBe(true);
    expect(verification.entriesSeen).toBe(3);

    void samPriv;
    void ghostPriv;
  });
});

/* ---- shared pipeline plumbing ---- */

const sharedKeys: Record<string, Uint8Array> = {};
const sharedEndpoints: Record<string, URL> = {};
const sharedUrlToDid: Record<string, string> = {};
const sharedReceivers: Record<string, (body: string) => Promise<{ ok: boolean; error?: unknown }>> =
  {};

const sharedResolver: TransportResolver = {
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

const sharedFetch: typeof fetch = async (input, init) => {
  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const did = sharedUrlToDid[urlStr];
  if (!did) return new Response('unknown endpoint', { status: 404 });
  const body = typeof init?.body === 'string' ? init.body : '';
  const r = await sharedReceivers[did]!(body);
  return new Response(r.ok ? JSON.stringify({ ok: true }) : JSON.stringify(r.error), {
    status: r.ok ? 200 : 400,
  });
};

async function mintAgentForPipeline(did: string) {
  const dir = tempDir();
  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  const endpoint = new URL(
    `http://127.0.0.1/pipeline/${encodeURIComponent(did)}/didcomm`,
  );
  sharedEndpoints[did] = endpoint;
  sharedUrlToDid[endpoint.toString()] = did;
  sharedKeys[did] = pub;

  const runtime = await createRuntime({
    config: {
      did,
      principalDid: 'did:web:ian.example.agent',
      publicKeyMultibase: ed25519RawToMultibase(pub),
      agentName: did.split(':')[2] ?? 'agent',
      agentDescription: 'pipeline test',
      wellKnownUrls: {
        didcomm: endpoint.toString(),
        agentCard: `http://127.0.0.1/pipeline/${encodeURIComponent(did)}/agent-card.json`,
        arpJson: `http://127.0.0.1/pipeline/${encodeURIComponent(did)}/arp.json`,
      },
      representationVcUrl: `http://127.0.0.1/${encodeURIComponent(did)}/representation.jwt`,
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
    dispatch: async ({ message }) => ({
      reply: { echo: message.body },
    }),
  });
  runtimes.push(runtime);
  sharedReceivers[did] = (body) => runtime.transport.receiveEnvelope(body);
  return { runtime, priv, pub };
}
