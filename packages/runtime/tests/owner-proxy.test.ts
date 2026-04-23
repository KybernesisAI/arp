import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as http from 'node:http';
import * as ed25519 from '@noble/ed25519';
import {
  createInMemoryKeyStore,
  ed25519RawToMultibase,
} from '@kybernesis/arp-transport';
import type { Resolver } from '@kybernesis/arp-resolver';
import { createRuntime, type Runtime } from '../src/runtime.js';

const SCHEMA = readFileSync(
  resolve(__dirname, '..', '..', 'spec', 'src', 'cedar-schema.json'),
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

const dirs: string[] = [];
const runtimes: Runtime[] = [];
const servers: http.Server[] = [];

afterEach(async () => {
  while (runtimes.length) {
    const r = runtimes.pop();
    try {
      await r?.stop();
    } catch {
      /* ignore */
    }
  }
  while (servers.length) {
    const s = servers.pop();
    await new Promise<void>((r) => s?.close(() => r()));
  }
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'arp-proxy-'));
  dirs.push(d);
  return d;
}

function startOwnerStub(): Promise<{ url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          method: req.method,
          path: req.url,
          host: req.headers.host,
          xForwardedHost: req.headers['x-forwarded-host'],
        }),
      );
    });
    servers.push(server);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) {
        resolve({ url: `http://127.0.0.1:${address.port}` });
      }
    });
  });
}

async function bootRuntime(ownerTarget: string) {
  const dir = tempDir();
  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  const runtime = await createRuntime({
    config: {
      did: 'did:web:samantha.agent',
      principalDid: 'did:web:ian.self.xyz',
      publicKeyMultibase: ed25519RawToMultibase(pub),
      agentName: 'samantha',
      agentDescription: 'proxy test',
      wellKnownUrls: {
        didcomm: 'http://127.0.0.1/didcomm',
        agentCard: 'http://127.0.0.1/.well-known/agent-card.json',
        arpJson: 'http://127.0.0.1/.well-known/arp.json',
      },
      representationVcUrl: 'http://127.0.0.1/.well-known/representation.jwt',
      scopeCatalogVersion: 'v1',
      tlsFingerprint: 'a'.repeat(64),
    },
    keyStore: createInMemoryKeyStore('did:web:samantha.agent', priv),
    resolver: STUB_RESOLVER,
    cedarSchemaJson: SCHEMA,
    registryPath: join(dir, 'registry.sqlite'),
    auditDir: join(dir, 'audit'),
    mailboxPath: join(dir, 'mailbox.sqlite'),
    ownerApp: {
      target: ownerTarget,
      hostSuffixes: ['ian.samantha.agent'],
    },
  });
  runtimes.push(runtime);
  const { port } = await runtime.start(0);
  return { runtime, base: `http://127.0.0.1:${port}` };
}

/**
 * Node's `fetch` forbids overriding the `Host` header against the URL's
 * authority. We care specifically about Host-header-based routing here, so
 * we bypass fetch and use raw `http.request` — this mirrors the real
 * sidecar, where the Host comes from whatever the upstream dispatcher set.
 */
function rawRequest(
  base: string,
  path: string,
  hostHeader: string,
): Promise<{ status: number; body: string }> {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: url.hostname,
        port: Number(url.port),
        method: 'GET',
        path,
        headers: { host: hostHeader },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('owner-app proxy', () => {
  it('proxies /owner/* to the target, stripping the prefix', async () => {
    const owner = await startOwnerStub();
    const { base } = await bootRuntime(owner.url);
    const res = await rawRequest(base, '/owner/connections/123', 'samantha.agent');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as {
      path: string;
      xForwardedHost: string;
    };
    expect(body.path).toBe('/connections/123');
    expect(body.xForwardedHost).toBe('samantha.agent');
  });

  it('proxies owner-subdomain requests to the target', async () => {
    const owner = await startOwnerStub();
    const { base } = await bootRuntime(owner.url);
    const res = await rawRequest(base, '/', 'ian.samantha.agent');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as {
      path: string;
      xForwardedHost: string;
    };
    expect(body.path).toBe('/');
    expect(body.xForwardedHost).toBe('ian.samantha.agent');
  });

  it('lets agent-apex requests flow to the normal routes', async () => {
    const owner = await startOwnerStub();
    const { base } = await bootRuntime(owner.url);
    const res = await rawRequest(base, '/.well-known/did.json', 'samantha.agent');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { id: string };
    expect(body.id).toBe('did:web:samantha.agent');
  });
});
