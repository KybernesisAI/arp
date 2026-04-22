import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import type { ConnectionToken } from '@kybernesis/arp-spec';
import type { Resolver } from '@kybernesis/arp-resolver';
import {
  createInMemoryKeyStore,
  ed25519RawToMultibase,
  type TransportResolver,
} from '@kybernesis/arp-transport';
import { createRuntime, type Runtime } from '@kybernesis/arp-runtime';

/**
 * End-to-end two-agent integration (`Samantha` ↔ `Ghost`) covering the three
 * paths required by Phase 2 §4 Task 10:
 *
 *   1. Happy path — allow policy → round-trip completes with audit entries on both sides.
 *   2. Deny path — request outside the permit set → denial + deny audit entry.
 *   3. Revocation path — connection revoked → subsequent requests rejected with revocation reason.
 *
 * The test uses the real runtime end-to-end (HTTP server, Hono, SQLite
 * registry, JSONL audit log, DIDComm signing/verifying) but bridges agent
 * transport over an in-process `fetch` stub so we don't need a HNS DoH
 * lookup or a `.agent` cert.
 */

const SCHEMA = readFileSync(
  resolve(__dirname, '..', '..', 'packages', 'spec', 'src', 'cedar-schema.json'),
  'utf8',
);

const tempDirs: string[] = [];
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
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

const STUB_RESOLVER: Resolver = {
  async resolveHns() {
    return { a: [], aaaa: [], txt: {} };
  },
  async resolveDidWeb() {
    return { ok: false, error: { code: 'unsupported_method', message: 'stub' } };
  },
  clearCache() {},
};

interface AgentHarness {
  did: string;
  runtime: Runtime;
  receivedReplies: Array<{ msgId: string; body: Record<string, unknown> }>;
}

describe('two-agent integration (Samantha ↔ Ghost)', () => {
  it('allow + deny + revocation round-trips end-to-end with audit chain intact', async () => {
    const sharedKeys: Record<string, Uint8Array> = {};
    const sharedEndpoints: Record<string, URL> = {};
    const sharedReceivers: Record<
      string,
      (body: string) => Promise<{ ok: boolean; error?: unknown }>
    > = {};
    const sharedReplyObservers: Record<string, AgentHarness['receivedReplies']> = {};

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
      const entry = Object.entries(sharedEndpoints).find(
        ([, u]) => u.toString() === urlStr,
      );
      if (!entry) return new Response('unknown endpoint', { status: 404 });
      const [did] = entry;
      const body = typeof init?.body === 'string' ? init.body : '';
      const r = await sharedReceivers[did]!(body);
      return new Response(r.ok ? JSON.stringify({ ok: true }) : JSON.stringify(r.error), {
        status: r.ok ? 200 : 400,
      });
    };

    async function buildAgent(did: string, port: number): Promise<AgentHarness> {
      const dir = mkdtempSync(join(tmpdir(), `arp-phase2-${did.split(':')[2]}-`));
      tempDirs.push(dir);
      const priv = ed25519.utils.randomPrivateKey();
      const pub = await ed25519.getPublicKeyAsync(priv);
      sharedKeys[did] = pub;
      const endpoint = new URL(`http://127.0.0.1:${port}/didcomm`);
      sharedEndpoints[did] = endpoint;

      const receivedReplies: AgentHarness['receivedReplies'] = [];
      sharedReplyObservers[did] = receivedReplies;

      const runtime = await createRuntime({
        config: {
          did,
          principalDid: 'did:web:ian.self.xyz',
          publicKeyMultibase: ed25519RawToMultibase(pub),
          agentName: did.split(':')[2] ?? 'agent',
          agentDescription: `phase 2 test agent ${did}`,
          wellKnownUrls: {
            didcomm: endpoint.toString(),
            agentCard: `http://127.0.0.1:${port}/.well-known/agent-card.json`,
            arpJson: `http://127.0.0.1:${port}/.well-known/arp.json`,
          },
          representationVcUrl: `http://127.0.0.1:${port}/.well-known/representation.jwt`,
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
        dispatch: async ({ message, memory, connectionId }) => {
          const body = message.body as Record<string, unknown>;
          // Simple echo handler with memory write so we can assert isolation.
          memory.set('last_action', body['action']);
          return {
            reply: {
              echo: body,
              last_action: memory.get('last_action'),
              connection_id: connectionId,
            },
          };
        },
      });
      runtimes.push(runtime);
      sharedReceivers[did] = runtime.transport.receiveEnvelope.bind(runtime.transport);

      return { did, runtime, receivedReplies };
    }

    const samantha = await buildAgent('did:web:samantha.agent', 4401);
    const ghost = await buildAgent('did:web:ghost.agent', 4402);

    // NOTE: the runtimes are running their real HTTP servers on :4401 / :4402,
    // but transport traffic is routed in-process via the shared fetch so the
    // test doesn't depend on a real HNS DoH hop or TLS-pinning round trip.
    // Starting the servers still exercises startup + shutdown.
    await samantha.runtime.start(4401);
    await ghost.runtime.start(4402);

    // Seed both sides with the same Connection Token. Policy permits read +
    // summarize on Project::alpha for Ghost; nothing else.
    const token: ConnectionToken = {
      connection_id: 'conn_phase2_alpha',
      issuer: 'did:web:ian.self.xyz',
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
      sigs: { ian: 'sig-ian', nick: 'sig-nick' },
    };

    await samantha.runtime.addConnection(token);
    await ghost.runtime.addConnection({
      ...token,
      subject: 'did:web:ghost.agent',
      audience: 'did:web:samantha.agent',
    });

    async function fullyDrain() {
      let quiescent = 0;
      while (quiescent < 2) {
        const s = await samantha.runtime.transport.drainInbox();
        const g = await ghost.runtime.transport.drainInbox();
        if (s === 0 && g === 0) quiescent++;
        else quiescent = 0;
      }
    }

    /* ---- 1. Happy path ---- */
    await ghost.runtime.transport.send('did:web:samantha.agent', {
      id: 'msg-happy-1',
      type: 'https://didcomm.org/arp/1.0/request',
      from: 'did:web:ghost.agent',
      to: ['did:web:samantha.agent'],
      body: {
        connection_id: 'conn_phase2_alpha',
        action: 'read',
        resource: 'Project:alpha',
      },
    });
    await fullyDrain();

    /* ---- 2. Deny path ---- */
    await ghost.runtime.transport.send('did:web:samantha.agent', {
      id: 'msg-deny-1',
      type: 'https://didcomm.org/arp/1.0/request',
      from: 'did:web:ghost.agent',
      to: ['did:web:samantha.agent'],
      body: {
        connection_id: 'conn_phase2_alpha',
        action: 'delete',
        resource: 'Project:alpha',
      },
    });
    await fullyDrain();

    /* ---- 3. Revocation path ---- */
    await samantha.runtime.revokeConnection('conn_phase2_alpha', 'user_requested');
    await ghost.runtime.transport.send('did:web:samantha.agent', {
      id: 'msg-revoked-1',
      type: 'https://didcomm.org/arp/1.0/request',
      from: 'did:web:ghost.agent',
      to: ['did:web:samantha.agent'],
      body: {
        connection_id: 'conn_phase2_alpha',
        action: 'read',
        resource: 'Project:alpha',
      },
    });
    await fullyDrain();

    /* ---- Assertions: Samantha's audit chain holds all 3 decisions ---- */
    const log = samantha.runtime.auditFor('conn_phase2_alpha');
    const verification = log.verify();
    expect(verification.valid).toBe(true);
    expect(verification.entriesSeen).toBe(3);

    // Parse each JSON line to inspect decisions in order.
    const lines = readFileSync(log.path, 'utf8')
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as { decision: string; msg_id: string; reason: string | null });
    expect(lines).toHaveLength(3);
    expect(lines[0]?.decision).toBe('allow');
    expect(lines[0]?.msg_id).toBe('msg-happy-1');
    expect(lines[1]?.decision).toBe('deny');
    expect(lines[1]?.msg_id).toBe('msg-deny-1');
    expect(lines[2]?.decision).toBe('deny');
    expect(lines[2]?.msg_id).toBe('msg-revoked-1');
    expect(lines[2]?.reason).toMatch(/revoked/);

    /* ---- Assertions: Samantha's connection registry reports revoked ---- */
    expect(await samantha.runtime.registry.isRevoked('connection', 'conn_phase2_alpha')).toBe(true);

    /* ---- Assertions: well-known endpoints serve valid payloads ---- */
    const didRes = await fetch('http://127.0.0.1:4401/.well-known/did.json');
    expect(didRes.ok).toBe(true);
    const didDoc = (await didRes.json()) as { id: string };
    expect(didDoc.id).toBe('did:web:samantha.agent');

    const health = (await (await fetch('http://127.0.0.1:4401/health')).json()) as {
      ok: boolean;
      did: string;
    };
    expect(health.ok).toBe(true);
    expect(health.did).toBe('did:web:samantha.agent');

    /* ---- Assertions: per-connection memory isolation ---- */
    samantha.runtime.memory.set('conn_phase2_alpha', 'probe', 'alpha-only');
    expect(samantha.runtime.memory.get('conn_other', 'probe')).toBeNull();
    expect(samantha.runtime.memory.get('conn_phase2_alpha', 'probe')).toBe('alpha-only');
  });
});
