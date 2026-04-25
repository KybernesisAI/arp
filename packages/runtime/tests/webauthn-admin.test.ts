import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
  const d = mkdtempSync(join(tmpdir(), 'arp-webauthn-'));
  dirs.push(d);
  return d;
}

interface BootOpts {
  withWebauthn?: boolean;
  adminToken?: string;
  principalDid?: string;
  publicKeyMultibase?: string;
}

async function bootRuntime(opts: BootOpts = {}): Promise<{
  runtime: Runtime;
  base: string;
  bearer: string;
  principalDid: string;
  publicKeyMultibase: string;
}> {
  const dir = tempDir();
  const adminToken = opts.adminToken ?? 's3cret';
  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  const principalDid = opts.principalDid ?? 'did:key:zMockPrincipal';
  const publicKeyMultibase = opts.publicKeyMultibase ?? ed25519RawToMultibase(pub);
  const runtime = await createRuntime({
    config: {
      did: 'did:web:samantha.agent',
      principalDid,
      publicKeyMultibase,
      agentName: 'samantha',
      agentDescription: 'webauthn test',
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
    adminToken,
    ...(opts.withWebauthn ?? true
      ? {
          webauthn: {
            storePath: join(dir, 'auth.sqlite'),
            rpId: 'localhost',
            rpName: 'ARP Owner App Test',
            origins: ['http://localhost:7878'],
          },
        }
      : {}),
  });
  runtimes.push(runtime);
  const { port } = await runtime.start(0);
  return {
    runtime,
    base: `http://127.0.0.1:${port}`,
    bearer: `Bearer ${adminToken}`,
    principalDid,
    publicKeyMultibase,
  };
}

describe('admin webauthn — registration options', () => {
  it('returns 404 when webauthn is disabled', async () => {
    const { base, bearer } = await bootRuntime({ withWebauthn: false });
    const res = await fetch(`${base}/admin/webauthn/register/options`, {
      method: 'POST',
      headers: { authorization: bearer, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });

  it('returns WebAuthn creation options with a fresh challenge', async () => {
    const { base, bearer } = await bootRuntime();
    const res = await fetch(`${base}/admin/webauthn/register/options`, {
      method: 'POST',
      headers: { authorization: bearer, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { challenge: string; rp: { id: string } };
    expect(typeof body.challenge).toBe('string');
    expect(body.challenge.length).toBeGreaterThan(0);
    expect(body.rp.id).toBe('localhost');
  });

  it('rejects unauthorized callers (no bearer)', async () => {
    const { base } = await bootRuntime();
    const res = await fetch(`${base}/admin/webauthn/register/options`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });
});

describe('admin webauthn — registration verify (negative paths)', () => {
  it('400 when missing response body', async () => {
    const { base, bearer } = await bootRuntime();
    const res = await fetch(`${base}/admin/webauthn/register/verify`, {
      method: 'POST',
      headers: { authorization: bearer, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('missing_response');
  });

  it('400 when challenge is unknown', async () => {
    const { base, bearer } = await bootRuntime();
    // Encode a fake clientDataJSON with an unknown challenge.
    const clientData = Buffer.from(
      JSON.stringify({ challenge: 'unknown-challenge-zzz', type: 'webauthn.create' }),
      'utf8',
    ).toString('base64url');
    const res = await fetch(`${base}/admin/webauthn/register/verify`, {
      method: 'POST',
      headers: { authorization: bearer, 'content-type': 'application/json' },
      body: JSON.stringify({
        response: {
          id: 'fake',
          response: { clientDataJSON: clientData },
        },
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unknown_or_expired_challenge');
  });
});

describe('admin webauthn — auth options', () => {
  it('returns auth options with a fresh challenge', async () => {
    const { base, bearer } = await bootRuntime();
    const res = await fetch(`${base}/admin/webauthn/auth/options`, {
      method: 'POST',
      headers: { authorization: bearer, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { challenge: string; rpId: string };
    expect(typeof body.challenge).toBe('string');
    expect(body.rpId).toBe('localhost');
  });
});

describe('admin webauthn — auth verify (negative paths)', () => {
  it('404 when credential is unknown', async () => {
    const { base, bearer } = await bootRuntime();
    const res = await fetch(`${base}/admin/webauthn/auth/verify`, {
      method: 'POST',
      headers: { authorization: bearer, 'content-type': 'application/json' },
      body: JSON.stringify({
        response: {
          id: 'unknown-credential',
          response: { clientDataJSON: 'irrelevant' },
        },
      }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unknown_credential');
  });
});

describe('admin webauthn — credentials list', () => {
  it('returns an empty list before any registrations', async () => {
    const { base, bearer } = await bootRuntime();
    const res = await fetch(`${base}/admin/webauthn/credentials`, {
      headers: { authorization: bearer },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { credentials: unknown[] };
    expect(body.credentials).toEqual([]);
  });
});
