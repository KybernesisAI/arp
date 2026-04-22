import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import {
  createInMemoryKeyStore,
  createTransport,
  type DidCommMessage,
  type Transport,
  type TransportResolver,
} from '../src/index.js';

const dirs: string[] = [];
const transports: Transport[] = [];

afterEach(async () => {
  while (transports.length) {
    const t = transports.pop();
    try {
      await t?.close();
    } catch {
      /* ignore */
    }
  }
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function tempPath(name: string): string {
  const d = mkdtempSync(join(tmpdir(), 'arp-transport-'));
  dirs.push(d);
  return join(d, name);
}

interface FakeAgent {
  did: string;
  transport: Transport;
  endpoint: URL;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  received: Array<{ msg: DidCommMessage; meta: unknown }>;
}

async function buildAgent(
  did: string,
  endpointBase: URL,
  peerKeys: Record<string, Uint8Array>,
  peerEndpoints: Record<string, URL>,
): Promise<FakeAgent> {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  peerKeys[did] = publicKey;
  peerEndpoints[did] = new URL(`/didcomm`, endpointBase);

  const resolver: TransportResolver = {
    async resolveEd25519PublicKey(peer) {
      const k = peerKeys[peer];
      if (!k) throw new Error(`no key for ${peer}`);
      return k;
    },
    async resolveDidCommEndpoint(peer) {
      const e = peerEndpoints[peer];
      if (!e) throw new Error(`no endpoint for ${peer}`);
      return e;
    },
  };

  const transport = createTransport({
    did,
    keyStore: createInMemoryKeyStore(did, privateKey),
    resolver,
    mailboxPath: tempPath(`${did.replace(/[^\w]/g, '_')}.sqlite`),
    fetchImpl: peerFetch,
    pollIntervalMs: 10,
  });
  transports.push(transport);

  const received: FakeAgent['received'] = [];
  transport.listen(async (msg, meta) => {
    received.push({ msg, meta });
  });

  const agent: FakeAgent = {
    did,
    transport,
    endpoint: new URL(`/didcomm`, endpointBase),
    publicKey,
    privateKey,
    received,
  };
  inboxByEndpoint[agent.endpoint.toString()] = transport;
  return agent;
}

// In-process fake of HTTPS POST — routes by endpoint string to the target
// transport's `receiveEnvelope`. Eliminates the need for a real Hono server
// in the unit-level test.
const inboxByEndpoint: Record<string, Transport> = {};
const peerFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const target = inboxByEndpoint[url];
  if (!target) {
    return new Response('not found', { status: 404 });
  }
  const body = typeof init?.body === 'string' ? init.body : '';
  const r = await target.receiveEnvelope(body);
  return new Response(r.ok ? JSON.stringify({ ok: true }) : JSON.stringify(r.error), {
    status: r.ok ? 200 : 400,
  });
};

describe('in-process two-agent transport', () => {
  it('delivers a signed envelope end-to-end', async () => {
    const endpointBase = new URL('https://fake.agent/');
    const peerKeys: Record<string, Uint8Array> = {};
    const peerEndpoints: Record<string, URL> = {};
    const samantha = await buildAgent(
      'did:web:samantha.agent',
      new URL('https://samantha.agent/'),
      peerKeys,
      peerEndpoints,
    );
    const ghost = await buildAgent(
      'did:web:ghost.agent',
      new URL('https://ghost.agent/'),
      peerKeys,
      peerEndpoints,
    );
    void endpointBase;

    await samantha.transport.send('did:web:ghost.agent', {
      id: 'msg-abc',
      type: 'https://didcomm.org/arp/1.0/request',
      from: samantha.did,
      to: [ghost.did],
      body: { action: 'read', resource: 'alpha/q2' },
    });

    // Trigger any pending handler work explicitly — the in-process fetch
    // already kicks `deliverPending` opportunistically but this keeps the
    // test deterministic without a sleep.
    await ghost.transport.drainInbox();
    expect(ghost.received).toHaveLength(1);
    expect(ghost.received[0]?.msg.id).toBe('msg-abc');
    expect(ghost.received[0]?.msg.body).toEqual({ action: 'read', resource: 'alpha/q2' });
  });

  it('drops a forged envelope (signer lies about identity)', async () => {
    const peerKeys: Record<string, Uint8Array> = {};
    const peerEndpoints: Record<string, URL> = {};
    const samantha = await buildAgent(
      'did:web:samantha.agent',
      new URL('https://samantha.agent/'),
      peerKeys,
      peerEndpoints,
    );
    const ghost = await buildAgent(
      'did:web:ghost.agent',
      new URL('https://ghost.agent/'),
      peerKeys,
      peerEndpoints,
    );

    // Hand-craft a JWS signed by samantha but claiming kid = ghost.
    const { signEnvelope } = await import('../src/envelope.js');
    const forged = await signEnvelope({
      message: {
        id: 'forged',
        type: 'https://didcomm.org/arp/1.0/request',
        from: 'did:web:ghost.agent',
        to: ['did:web:samantha.agent'],
        body: {},
      },
      signerDid: 'did:web:ghost.agent', // lies in kid
      privateKey: samantha.privateKey, // actually signed by samantha
    });

    const r = await samantha.transport.receiveEnvelope(forged.compact);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_signature');
    void ghost;
  });

  it('reports unknown peers', async () => {
    const peerKeys: Record<string, Uint8Array> = {};
    const peerEndpoints: Record<string, URL> = {};
    const samantha = await buildAgent(
      'did:web:samantha.agent',
      new URL('https://samantha.agent/'),
      peerKeys,
      peerEndpoints,
    );
    await expect(
      samantha.transport.send('did:web:unknown.agent', {
        id: 'x',
        type: 'https://didcomm.org/arp/1.0/ping',
        from: samantha.did,
        to: ['did:web:unknown.agent'],
        body: {},
      }),
    ).rejects.toBeTruthy();
  });
});
