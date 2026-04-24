import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import { ArpAgent } from '@kybernesis/arp-sdk';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { withArp } from '../src/index.js';
import { FakeHermesAgent } from './stubs/hermes-fake.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

async function buildAgent() {
  const key = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(key);
  const pubMb = ed25519RawToMultibase(pub);
  const dataDir = mkdtempSync(join(tmpdir(), 'arp-hermes-'));
  dirs.push(dataDir);
  return ArpAgent.fromHandoff(
    {
      agent_did: 'did:web:hermes-test.agent',
      principal_did: 'did:web:owner.example.agent',
      public_key_multibase: pubMb,
      well_known_urls: {
        did: 'http://127.0.0.1:4500/.well-known/did.json',
        agent_card: 'http://127.0.0.1:4500/.well-known/agent-card.json',
        arp: 'http://127.0.0.1:4500/.well-known/arp.json',
      },
      dns_records_published: ['A'],
      cert_expires_at: '2030-01-01T00:00:00.000Z',
      bootstrap_token: 'stub',
    },
    {
      dataDir,
      privateKey: key,
      transportResolver: {
        async resolveEd25519PublicKey() {
          return pub;
        },
        async resolveDidCommEndpoint() {
          return new URL('http://127.0.0.1:1/didcomm');
        },
      },
    },
  );
}

async function seed(
  agent: ArpAgent,
  connectionId: string,
  opts: {
    allow?: boolean;
    obligations?: Array<{ type: string; params: Record<string, unknown> }>;
  } = {},
) {
  const policy = opts.allow === false
    ? `@id("p_deny")\nforbid(principal, action, resource);`
    : `@id("p_allow_all")\npermit(principal, action, resource);`;
  const token = {
    connection_id: connectionId,
    issuer: 'did:web:owner.example.agent',
    subject: agent.did,
    audience: 'did:web:peer.agent',
    purpose: 'hermes adapter test',
    cedar_policies: [policy],
    obligations: opts.obligations ?? [],
    scope_catalog_version: 'v1',
    expires: '2030-01-01T00:00:00.000Z',
    sigs: { issuer: 'x', audience: 'y' },
  };
  await agent.connections.add(token, JSON.stringify(token));
}

describe('@kybernesis/arp-adapter-hermes-agent', () => {
  it('tool middleware allows + applies obligations', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_hermes_allow', {
      obligations: [{ type: 'redact_fields', params: { fields: ['secret'] } }],
    });
    const hermes = new FakeHermesAgent();
    const wrap = withArp(hermes, { agent });

    const out = (await hermes.callTool(
      { connectionId: 'conn_hermes_allow', toolName: 'search', args: { q: 'h' } },
      async () => ({ hits: 2, secret: 'x' }),
    )) as Record<string, unknown>;
    expect(out.hits).toBe(2);
    expect(out.secret).toBeUndefined();
    await wrap.stop(100);
  });

  it('denies denied tools with onToolDenied override', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_hermes_deny', { allow: false });
    const hermes = new FakeHermesAgent();
    const wrap = withArp(hermes, {
      agent,
      onToolDenied: (_c, r) => ({ error: 'nope', r }),
    });

    const out = (await hermes.callTool(
      { connectionId: 'conn_hermes_deny', toolName: 'search', args: {} },
      async () => {
        throw new Error('must not run');
      },
    )) as Record<string, unknown>;
    expect(out.error).toBe('nope');
    await wrap.stop(100);
  });

  it('peer-message handler guards by connection id', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_hermes_msg');
    const hermes = new FakeHermesAgent();
    const wrap = withArp(hermes, { agent });

    const reply = (await hermes.firePeerMessage({
      id: 'm-1',
      from: 'did:web:peer.agent',
      connectionId: 'conn_hermes_msg',
      action: 'ping',
      body: {},
    })) as { body: Record<string, unknown> };
    expect(reply.body.error).toBeUndefined();
    await wrap.stop(100);
  });

  it('egress applies connection obligations', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_hermes_egress', {
      obligations: [{ type: 'redact_fields', params: { fields: ['token'] } }],
    });
    const hermes = new FakeHermesAgent();
    const wrap = withArp(hermes, { agent });

    const filtered = (await hermes.runEgress(
      { user: 'a', token: 't' },
      { connectionId: 'conn_hermes_egress' },
    )) as Record<string, unknown>;
    expect(filtered.user).toBe('a');
    expect(filtered.token).toBeUndefined();
    await wrap.stop(100);
  });
});
