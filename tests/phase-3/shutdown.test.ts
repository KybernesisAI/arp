import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { createResolver } from '@kybernesis/arp-resolver';
import { createRuntime, type Runtime } from '@kybernesis/arp-runtime';
import {
  createInMemoryKeyStore,
  ed25519RawToMultibase,
} from '@kybernesis/arp-transport';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const cedarSchemaJson = readFileSync(
  require_.resolve('@kybernesis/arp-spec/cedar-schema.json'),
  'utf8',
);

const DID = 'did:web:test.agent';

async function bootRuntime(dataDir: string): Promise<{
  runtime: Runtime;
  port: number;
}> {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  const runtime = await createRuntime({
    config: {
      did: DID,
      principalDid: 'did:web:ian.example.agent',
      publicKeyMultibase: ed25519RawToMultibase(pub),
      wellKnownUrls: {
        didcomm: 'https://test.agent/didcomm',
        agentCard: 'https://test.agent/.well-known/agent-card.json',
        arpJson: 'https://test.agent/.well-known/arp.json',
      },
      representationVcUrl: 'https://test.agent/.well-known/representation.jwt',
      scopeCatalogVersion: 'v1',
      agentName: 'Test',
      agentDescription: 'Test agent',
      tlsFingerprint: 'a'.repeat(64),
    },
    keyStore: createInMemoryKeyStore(DID, priv),
    resolver: createResolver(),
    cedarSchemaJson,
    registryPath: join(dataDir, 'registry.sqlite'),
    auditDir: join(dataDir, 'audit'),
    mailboxPath: join(dataDir, 'mailbox.sqlite'),
  });
  const info = await runtime.start(0, '127.0.0.1');
  return { runtime, port: info.port };
}

describe('runtime graceful shutdown', () => {
  let dataDir!: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'arp-shutdown-'));
  });
  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('extended /health exposes cert_fingerprint, connections_count, audit_seq', async () => {
    const { runtime, port } = await bootRuntime(dataDir);
    const body = (await (await fetch(`http://127.0.0.1:${port}/health`)).json()) as {
      ok: boolean;
      cert_fingerprint: string;
      connections_count: number;
      audit_seq: number;
      draining: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.cert_fingerprint).toMatch(/^[0a]+$/);
    expect(body.connections_count).toBe(0);
    expect(body.audit_seq).toBe(0);
    expect(body.draining).toBe(false);
    await runtime.stop();
  });

  it('stop() flips draining and resolves promptly when nothing is in flight', async () => {
    const { runtime, port } = await bootRuntime(dataDir);
    expect(runtime.isDraining()).toBe(false);

    // Drain a health call first so the server has had traffic.
    await fetch(`http://127.0.0.1:${port}/health`);

    const start = Date.now();
    await runtime.stop({ graceMs: 5000 });
    const elapsed = Date.now() - start;
    expect(runtime.isDraining()).toBe(true);
    // With 0 in-flight requests at stop-time we should not wait for graceMs —
    // the 50 ms quiet-period check exits on the first tick.
    expect(elapsed).toBeLessThan(1500);
  });

  it('stop() preserves 50 concurrent in-flight /didcomm POSTs', async () => {
    const { runtime, port } = await bootRuntime(dataDir);
    const base = `http://127.0.0.1:${port}`;

    // Fire 50 concurrent POSTs. Each one runs through the drain middleware
    // and then the transport.receiveEnvelope (which returns 400 for garbage).
    // All should return a valid HTTP status — none should hang or error at
    // the TCP layer.
    const pending = Array.from({ length: 50 }, () =>
      fetch(`${base}/didcomm`, {
        method: 'POST',
        body: '{"not": "a valid envelope"}',
        headers: { 'content-type': 'application/json' },
      }).then(
        (r) => r.status,
        () => 0,
      ),
    );

    // Kick stop() into flight alongside the 50 requests; graceMs gives the
    // in-flight ones room to finish.
    const stopPromise = runtime.stop({ graceMs: 5000 });

    const statuses = await Promise.all(pending);
    expect(statuses).toHaveLength(50);
    for (const s of statuses) {
      // 400 (bad envelope) or 503 (drain arrived first) — never 0 (TCP error)
      expect([200, 400, 503]).toContain(s);
    }

    await stopPromise;
    expect(runtime.isDraining()).toBe(true);
  });
});
