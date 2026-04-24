import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import {
  ed25519RawToMultibase,
  type TransportResolver,
} from '@kybernesis/arp-transport';
import type { HandoffBundle } from '@kybernesis/arp-spec';
import { ArpAgent } from '../src/index.js';

/**
 * End-to-end exercise of the SDK's five integration points:
 *   - fromHandoff + start (lifecycle)
 *   - connections.add (seed a connection)
 *   - check (integration point 1)
 *   - egress (integration point 2)
 *   - onIncoming (integration point 3) via a peer agent round-trip
 *   - audit (integration point 4)
 *   - on('pairing' | 'revocation') (integration point 5)
 *
 * Runs the SDK's agent + a peer @kybernesis/arp-runtime in the same process
 * bridged by a stub transport resolver (no DNS, no HTTP to the public
 * internet). Mirrors the phase-5 dual-runtime shape but through the SDK.
 */

async function buildHandoff(
  agentDid: string,
  principalDid: string,
  publicKeyMultibase: string,
  port: number,
): Promise<HandoffBundle> {
  return {
    agent_did: agentDid,
    principal_did: principalDid,
    public_key_multibase: publicKeyMultibase,
    well_known_urls: {
      did: `http://127.0.0.1:${port}/.well-known/did.json`,
      agent_card: `http://127.0.0.1:${port}/.well-known/agent-card.json`,
      arp: `http://127.0.0.1:${port}/.well-known/arp.json`,
    },
    dns_records_published: ['A'],
    cert_expires_at: '2030-01-01T00:00:00.000Z',
    bootstrap_token: 'stub',
  };
}

describe('ArpAgent integration (SDK end-to-end)', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length) {
      const d = dirs.pop();
      if (d) rmSync(d, { recursive: true, force: true });
    }
  });

  it('fromHandoff → start → check → egress → audit → connections.revoke', async () => {
    const samanthaDid = 'did:web:sdktest-samantha.agent';
    const ghostDid = 'did:web:sdktest-ghost.agent';
    const ianDid = 'did:web:sdktest-ian.example.agent';

    // Mint keys.
    const samanthaKey = ed25519.utils.randomPrivateKey();
    const ghostKey = ed25519.utils.randomPrivateKey();
    const samanthaPub = await ed25519.getPublicKeyAsync(samanthaKey);
    const ghostPub = await ed25519.getPublicKeyAsync(ghostKey);

    const samanthaPort = 15701;
    const ghostPort = 15702;

    const handoff = await buildHandoff(
      samanthaDid,
      ianDid,
      ed25519RawToMultibase(samanthaPub),
      samanthaPort,
    );

    // Shared transport plumbing (both agents share a routing table).
    const endpoints: Record<string, URL> = {
      [samanthaDid]: new URL(`http://127.0.0.1:${samanthaPort}/didcomm`),
      [ghostDid]: new URL(`http://127.0.0.1:${ghostPort}/didcomm`),
    };
    const keys: Record<string, Uint8Array> = {
      [samanthaDid]: samanthaPub,
      [ghostDid]: ghostPub,
    };

    // In-memory transport resolver — fan out to local endpoints only.
    const transportResolver: TransportResolver = {
      async resolveEd25519PublicKey(did) {
        const k = keys[did];
        if (!k) throw new Error(`no key for ${did}`);
        return k;
      },
      async resolveDidCommEndpoint(did) {
        const e = endpoints[did];
        if (!e) throw new Error(`no endpoint for ${did}`);
        return e;
      },
    };

    // Temp data dirs.
    const samanthaDir = mkdtempSync(join(tmpdir(), 'arp-sdk-it-samantha-'));
    const ghostDir = mkdtempSync(join(tmpdir(), 'arp-sdk-it-ghost-'));
    dirs.push(samanthaDir, ghostDir);

    const receivedActions: string[] = [];

    const samantha = await ArpAgent.fromHandoff(handoff, {
      dataDir: samanthaDir,
      privateKey: samanthaKey,
      transportResolver,
      adminToken: 'it-admin',
      agentName: 'Samantha SDK',
      onIncoming: async (task, _ctx) => {
        receivedActions.push(task.action);
        return {
          body: {
            tool: task.action,
            echo: task.body,
            internal_secret: 'must-be-redacted',
          },
        };
      },
    });

    // Peer runtime — uses @kybernesis/arp-runtime directly (not the SDK) so
    // we prove the SDK agent interoperates with the baseline runtime.
    const { createRuntime } = await import('@kybernesis/arp-runtime');
    const { createInMemoryKeyStore: kks } = await import('@kybernesis/arp-transport');
    const { readFileSync } = await import('node:fs');
    const { createRequire } = await import('node:module');
    const req = createRequire(import.meta.url);
    const cedarSchemaJson = readFileSync(
      req.resolve('@kybernesis/arp-spec/cedar-schema.json'),
      'utf8',
    );

    const stubResolver = {
      async resolveHns() {
        return { a: [], aaaa: [], txt: {} };
      },
      async resolveDidWeb() {
        return {
          ok: false as const,
          error: { code: 'unsupported_method' as const, message: 'stub' },
        };
      },
      clearCache() {},
    };

    const ghost = await createRuntime({
      config: {
        did: ghostDid,
        principalDid: ianDid,
        publicKeyMultibase: ed25519RawToMultibase(ghostPub),
        agentName: 'Ghost',
        agentDescription: 'sdk integration peer',
        wellKnownUrls: {
          didcomm: `http://127.0.0.1:${ghostPort}/didcomm`,
          agentCard: `http://127.0.0.1:${ghostPort}/.well-known/agent-card.json`,
          arpJson: `http://127.0.0.1:${ghostPort}/.well-known/arp.json`,
        },
        representationVcUrl: `http://127.0.0.1:${ghostPort}/.well-known/representation.jwt`,
        scopeCatalogVersion: 'v1',
        tlsFingerprint: 'a'.repeat(64),
      },
      keyStore: kks(ghostDid, ghostKey),
      resolver: stubResolver,
      transportResolver,
      cedarSchemaJson,
      registryPath: join(ghostDir, 'registry.sqlite'),
      auditDir: join(ghostDir, 'audit'),
      mailboxPath: join(ghostDir, 'mailbox.sqlite'),
    });

    await samantha.start({ port: samanthaPort });
    await ghost.start(ghostPort);

    // Seed a connection on Samantha that permits `ping` with a
    // `redact_fields` obligation.
    const token = {
      connection_id: 'conn_abc1234567890',
      issuer: ianDid,
      subject: samanthaDid,
      audience: ghostDid,
      purpose: 'sdk integration',
      cedar_policies: [
        `@id("p_allow_all")\npermit(principal, action, resource);`,
      ],
      obligations: [
        { type: 'redact_fields', params: { fields: ['internal_secret'] } },
      ],
      scope_catalog_version: 'v1',
      expires: '2030-01-01T00:00:00.000Z',
      sigs: { issuer: 'xxxxxx', audience: 'yyyyyy' },
    };

    const pairingSeen: string[] = [];
    samantha.on('pairing', (e) => pairingSeen.push(e.connectionId));

    await samantha.connections.add(token, JSON.stringify(token));
    // Mirror the same connection on Ghost's side — responder semantics.
    const record = await samantha.registry.get(token.connection_id);
    expect(record).toBeTruthy();

    // Ghost needs the connection too so its outbound `send` passes PDP when
    // the reply comes back. Use its admin API via the in-memory transport
    // by seeding through its registry directly.
    await ghost.addConnection(token, JSON.stringify(token));

    expect(pairingSeen).toContain(token.connection_id);

    // Fire an inbound request from ghost → samantha.
    await ghost.transport.send(samanthaDid, {
      id: 'msg-1',
      type: 'https://didcomm.org/arp/1.0/request',
      from: ghostDid,
      to: [samanthaDid],
      body: {
        connection_id: token.connection_id,
        action: 'ping',
        resource: { type: 'Resource', id: 'x' },
      },
    });

    // Wait for inbox quiescence on both sides.
    for (let i = 0; i < 50; i++) {
      const s = await samantha['runtime'].transport.drainInbox();
      const g = await ghost.transport.drainInbox();
      if (s === 0 && g === 0) break;
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(receivedActions).toContain('ping');

    // Check integration-point 1 (agent.check).
    const dec = await samantha.check({
      action: 'ping',
      resource: { type: 'Resource', id: 'x' },
      connectionId: token.connection_id,
    });
    expect(dec.decision).toBe('allow');

    // Egress path — obligations should redact.
    const redacted = (await samantha.egress({
      data: { hello: 'world', internal_secret: 'zzz' },
      connectionId: token.connection_id,
    })) as Record<string, unknown>;
    expect(redacted.hello).toBe('world');
    expect(redacted.internal_secret).toBeUndefined();

    // Audit write.
    await samantha.audit({
      connectionId: token.connection_id,
      decision: 'allow',
      reason: 'sdk audit integration',
    });

    // Revoke.
    const revokeSeen: string[] = [];
    samantha.on('revocation', (e) => revokeSeen.push(e.connectionId));
    await samantha.connections.revoke(token.connection_id, 'test cleanup');
    expect(revokeSeen).toContain(token.connection_id);

    // Post-revocation, check() must deny.
    const denied = await samantha.check({
      action: 'ping',
      resource: { type: 'Resource', id: 'x' },
      connectionId: token.connection_id,
    });
    expect(denied.decision).toBe('deny');

    // Shutdown.
    await samantha.stop({ graceMs: 500 });
    await ghost.stop({ graceMs: 500 });
  });
});
