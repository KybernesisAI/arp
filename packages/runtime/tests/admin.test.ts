import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import {
  createInMemoryKeyStore,
  ed25519RawToMultibase,
} from '@kybernesis/arp-transport';
import type { ConnectionToken } from '@kybernesis/arp-spec';
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
  const d = mkdtempSync(join(tmpdir(), 'arp-admin-'));
  dirs.push(d);
  return d;
}

async function bootRuntime(adminToken: string | undefined) {
  const dir = tempDir();
  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  const runtime = await createRuntime({
    config: {
      did: 'did:web:samantha.agent',
      principalDid: 'did:web:ian.example.agent',
      publicKeyMultibase: ed25519RawToMultibase(pub),
      agentName: 'samantha',
      agentDescription: 'admin test',
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
    ...(adminToken !== undefined ? { adminToken } : {}),
  });
  runtimes.push(runtime);
  const { port } = await runtime.start(0);
  return { runtime, base: `http://127.0.0.1:${port}` };
}

const sampleToken: ConnectionToken = {
  connection_id: 'conn_admin_test',
  issuer: 'did:web:ian.example.agent',
  subject: 'did:web:samantha.agent',
  audience: 'did:web:ghost.agent',
  purpose: 'project:alpha',
  cedar_policies: [
    'permit (principal == Agent::"did:web:ghost.agent", action, resource);',
  ],
  obligations: [],
  scope_catalog_version: 'v1',
  expires: '2099-01-01T00:00:00Z',
  sigs: { 'did:web:ian.example.agent': 'sig-ian', 'did:web:nick.example.agent': 'sig-nick' },
};

describe('admin API auth', () => {
  it('returns 404 when adminToken is unset', async () => {
    const { base } = await bootRuntime(undefined);
    const res = await fetch(`${base}/admin/connections`);
    expect(res.status).toBe(404);
  });

  it('returns 401 without the bearer header', async () => {
    const { base } = await bootRuntime('s3cret');
    const res = await fetch(`${base}/admin/connections`);
    expect(res.status).toBe(401);
  });

  it('returns 401 with the wrong bearer header', async () => {
    const { base } = await bootRuntime('s3cret');
    const res = await fetch(`${base}/admin/connections`, {
      headers: { authorization: 'Bearer wrong' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 with the right bearer header', async () => {
    const { base } = await bootRuntime('s3cret');
    const res = await fetch(`${base}/admin/connections`, {
      headers: { authorization: 'Bearer s3cret' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connections: unknown[] };
    expect(body.connections).toEqual([]);
  });
});

describe('admin API — connections + audit', () => {
  it('accepts a token via POST /admin/connections and lists it', async () => {
    const { base } = await bootRuntime('s3cret');
    const post = await fetch(`${base}/admin/connections`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer s3cret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ token: sampleToken }),
    });
    expect(post.status).toBe(200);

    const list = (await (
      await fetch(`${base}/admin/connections`, {
        headers: { authorization: 'Bearer s3cret' },
      })
    ).json()) as { connections: Array<{ connection_id: string }> };
    expect(list.connections).toHaveLength(1);
    expect(list.connections[0]?.connection_id).toBe('conn_admin_test');

    const detail = await fetch(
      `${base}/admin/connections/conn_admin_test`,
      { headers: { authorization: 'Bearer s3cret' } },
    );
    expect(detail.status).toBe(200);
  });

  it('revokes + suspends + resumes connections', async () => {
    const { base } = await bootRuntime('s3cret');
    await fetch(`${base}/admin/connections`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer s3cret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ token: sampleToken }),
    });

    const suspend = await fetch(
      `${base}/admin/connections/conn_admin_test/suspend`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer s3cret' },
      },
    );
    expect(suspend.status).toBe(200);

    const resume = await fetch(
      `${base}/admin/connections/conn_admin_test/resume`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer s3cret' },
      },
    );
    expect(resume.status).toBe(200);

    const revoke = await fetch(
      `${base}/admin/connections/conn_admin_test/revoke`,
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer s3cret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ reason: 'owner_revoked' }),
      },
    );
    expect(revoke.status).toBe(200);
  });

  it('returns paginated audit entries + verification result', async () => {
    const { runtime, base } = await bootRuntime('s3cret');
    await fetch(`${base}/admin/connections`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer s3cret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ token: sampleToken }),
    });
    const log = runtime.auditFor('conn_admin_test');
    log.append({ msg_id: 'm1', decision: 'allow', policies_fired: ['p1'] });
    log.append({ msg_id: 'm2', decision: 'deny', policies_fired: ['p2'], reason: 'denied' });

    const res = await fetch(`${base}/admin/audit/conn_admin_test`, {
      headers: { authorization: 'Bearer s3cret' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total: number;
      entries: Array<{ msg_id: string }>;
      verification: { valid: boolean };
    };
    expect(body.total).toBe(2);
    expect(body.entries[0]?.msg_id).toBe('m2');
    expect(body.verification.valid).toBe(true);
  });
});

describe('admin API — pairing invitations', () => {
  it('stores a pending invitation and lists it', async () => {
    const { base } = await bootRuntime('s3cret');
    const res = await fetch(`${base}/admin/pairing/invitations`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer s3cret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        proposal: {
          connection_id: 'conn_pending_1',
          issuer: 'did:web:ian.example.agent',
          audience: 'did:web:ghost.agent',
        },
        invitation_url: 'https://samantha.agent/pair?invitation=ZXhhbXBsZQ',
      }),
    });
    expect(res.status).toBe(200);

    const list = (await (
      await fetch(`${base}/admin/pairing/invitations`, {
        headers: { authorization: 'Bearer s3cret' },
      })
    ).json()) as { invitations: Array<{ connection_id: string }> };
    expect(list.invitations).toHaveLength(1);
    expect(list.invitations[0]?.connection_id).toBe('conn_pending_1');
  });

  it('accepts a dual-signed token via /admin/pairing/accept and clears the pending slot', async () => {
    const { base } = await bootRuntime('s3cret');
    await fetch(`${base}/admin/pairing/invitations`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer s3cret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        proposal: { connection_id: sampleToken.connection_id },
      }),
    });

    const accept = await fetch(`${base}/admin/pairing/accept`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer s3cret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ token: sampleToken }),
    });
    expect(accept.status).toBe(200);

    const list = (await (
      await fetch(`${base}/admin/pairing/invitations`, {
        headers: { authorization: 'Bearer s3cret' },
      })
    ).json()) as { invitations: unknown[] };
    expect(list.invitations).toHaveLength(0);
  });
});

describe('admin API — keys/rotate', () => {
  it('returns 501 with a restart-required explanation in v0', async () => {
    const { base } = await bootRuntime('s3cret');
    const res = await fetch(`${base}/admin/keys/rotate`, {
      method: 'POST',
      headers: { authorization: 'Bearer s3cret' },
    });
    expect(res.status).toBe(501);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toMatch(/restart/i);
  });
});
