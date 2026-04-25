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
  const d = mkdtempSync(join(tmpdir(), 'arp-rotate-'));
  dirs.push(d);
  return d;
}

async function bootRuntime(opts: {
  principalDid?: string;
  publicKeyMultibase?: string;
  graceMs?: number;
}): Promise<{
  runtime: Runtime;
  base: string;
  bearer: string;
  principalDid: string;
  publicKeyMultibase: string;
}> {
  const dir = tempDir();
  const adminToken = 's3cret';
  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  const principalDid = opts.principalDid ?? 'did:key:zPrincipalV1';
  const publicKeyMultibase = opts.publicKeyMultibase ?? ed25519RawToMultibase(pub);
  const runtime = await createRuntime({
    config: {
      did: 'did:web:samantha.agent',
      principalDid,
      publicKeyMultibase,
      agentName: 'samantha',
      agentDescription: 'rotate test',
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
    webauthn: {
      storePath: join(dir, 'auth.sqlite'),
      rpId: 'localhost',
      rpName: 'ARP Owner App Test',
      origins: ['http://localhost:7878'],
    },
    ...(opts.graceMs !== undefined ? { identityRotationGraceMs: opts.graceMs } : {}),
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

describe('admin /identity', () => {
  it('returns the boot principal DID before any rotation', async () => {
    const { base, bearer, principalDid, publicKeyMultibase } = await bootRuntime({});
    const res = await fetch(`${base}/admin/identity`, {
      headers: { authorization: bearer },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      principal_did: string;
      previous_principal_did: string | null;
      principal_public_key_multibase: string;
    };
    expect(body.principal_did).toBe(principalDid);
    expect(body.previous_principal_did).toBeNull();
    expect(body.principal_public_key_multibase).toBe(publicKeyMultibase);
  });
});

describe('admin /identity/rotate', () => {
  it('promotes a new principal DID + sets previous + grace expiry', async () => {
    const { base, bearer, principalDid } = await bootRuntime({});
    const newDid = 'did:key:zPrincipalV2';
    const newMb = 'zNewMultibase';
    const res = await fetch(`${base}/admin/identity/rotate`, {
      method: 'POST',
      headers: { authorization: bearer, 'content-type': 'application/json' },
      body: JSON.stringify({
        new_principal_did: newDid,
        new_public_key_multibase: newMb,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      principal_did: string;
      previous_principal_did: string;
      previous_deprecated_at: string;
    };
    expect(body.principal_did).toBe(newDid);
    expect(body.previous_principal_did).toBe(principalDid);
    expect(typeof body.previous_deprecated_at).toBe('string');
  });

  it('is idempotent when the same DID is submitted twice', async () => {
    const { base, bearer } = await bootRuntime({});
    const newDid = 'did:key:zPrincipalV2';
    const newMb = 'zNewMultibase';
    const first = await fetch(`${base}/admin/identity/rotate`, {
      method: 'POST',
      headers: { authorization: bearer, 'content-type': 'application/json' },
      body: JSON.stringify({
        new_principal_did: newDid,
        new_public_key_multibase: newMb,
      }),
    });
    expect(first.status).toBe(200);
    const second = await fetch(`${base}/admin/identity/rotate`, {
      method: 'POST',
      headers: { authorization: bearer, 'content-type': 'application/json' },
      body: JSON.stringify({
        new_principal_did: newDid,
        new_public_key_multibase: newMb,
      }),
    });
    expect(second.status).toBe(200);
    const body = (await second.json()) as { ok: boolean; no_change?: boolean };
    expect(body.no_change).toBe(true);
  });

  it('400 when new identity fields are missing', async () => {
    const { base, bearer } = await bootRuntime({});
    const res = await fetch(`${base}/admin/identity/rotate`, {
      method: 'POST',
      headers: { authorization: bearer, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('/.well-known/did.json — dual publish during grace', () => {
  it('publishes only the current principal pre-rotation', async () => {
    const { base, principalDid } = await bootRuntime({});
    const res = await fetch(`${base}/.well-known/did.json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      principal: { did: string; previousDid?: string };
    };
    expect(doc.principal.did).toBe(principalDid);
    expect(doc.principal.previousDid).toBeUndefined();
  });

  it('dual-publishes the previous principal during the grace window', async () => {
    const { base, bearer, principalDid } = await bootRuntime({});
    const newDid = 'did:key:zPrincipalV2';
    const newMb = 'zNewMultibase';
    const rotateRes = await fetch(`${base}/admin/identity/rotate`, {
      method: 'POST',
      headers: { authorization: bearer, 'content-type': 'application/json' },
      body: JSON.stringify({
        new_principal_did: newDid,
        new_public_key_multibase: newMb,
      }),
    });
    expect(rotateRes.status).toBe(200);

    const res = await fetch(`${base}/.well-known/did.json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      principal: {
        did: string;
        previousDid?: string;
        previousVerificationMethod?: { publicKeyMultibase: string };
        previousDeprecatedAt?: string;
      };
    };
    expect(doc.principal.did).toBe(newDid);
    expect(doc.principal.previousDid).toBe(principalDid);
    expect(doc.principal.previousVerificationMethod?.publicKeyMultibase).toBeTruthy();
    expect(typeof doc.principal.previousDeprecatedAt).toBe('string');
  });

  it('drops the previous principal after the grace window expires', async () => {
    // 1 ms grace so the next request is past it.
    const { base, bearer } = await bootRuntime({ graceMs: 1 });
    const newDid = 'did:key:zPrincipalV2';
    const newMb = 'zNewMultibase';
    await fetch(`${base}/admin/identity/rotate`, {
      method: 'POST',
      headers: { authorization: bearer, 'content-type': 'application/json' },
      body: JSON.stringify({
        new_principal_did: newDid,
        new_public_key_multibase: newMb,
      }),
    });
    // Wait long enough for the 1ms grace to pass.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const res = await fetch(`${base}/.well-known/did.json`);
    const doc = (await res.json()) as {
      principal: { did: string; previousDid?: string };
    };
    expect(doc.principal.did).toBe(newDid);
    expect(doc.principal.previousDid).toBeUndefined();
  });
});
