import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import { ArpAgent } from '@kybernesis/arp-sdk';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { arpPlugin } from '../src/index.js';
import { FakeOpenClaw } from './stubs/openclaw-fake.js';

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
  const dataDir = mkdtempSync(join(tmpdir(), 'arp-oc-'));
  dirs.push(dataDir);
  return ArpAgent.fromHandoff(
    {
      agent_did: 'did:web:oc-adapter-test.agent',
      principal_did: 'did:web:owner.self.xyz',
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
    issuer: 'did:web:owner.self.xyz',
    subject: agent.did,
    audience: 'did:web:peer.agent',
    purpose: 'openclaw adapter test',
    cedar_policies: [policy],
    obligations: opts.obligations ?? [],
    scope_catalog_version: 'v1',
    expires: '2030-01-01T00:00:00.000Z',
    sigs: { issuer: 'x', audience: 'y' },
  };
  await agent.connections.add(token, JSON.stringify(token));
}

describe('@kybernesis/arp-adapter-openclaw', () => {
  it('beforeAction allows when PDP permits; afterAction redacts obligations', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_oc_allow', {
      obligations: [{ type: 'redact_fields', params: { fields: ['raw'] } }],
    });
    const framework = new FakeOpenClaw();
    framework.use(arpPlugin({ agent }));

    const out = await framework.runAction(
      {
        connectionId: 'conn_oc_allow',
        action: { name: 'summarize', args: { topic: 'x' } },
        meta: {},
      },
      async () => ({ summary: 'ok', raw: 'secret' }),
    );
    expect(out.allow).toBe(true);
    expect((out.result as Record<string, unknown>).summary).toBe('ok');
    expect((out.result as Record<string, unknown>).raw).toBeUndefined();
    const plugin = framework.plugins[0] as ReturnType<typeof arpPlugin>;
    await plugin.shutdown(100);
  });

  it('beforeAction denies when PDP forbids', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_oc_deny', { allow: false });
    const framework = new FakeOpenClaw();
    framework.use(arpPlugin({ agent }));

    const out = await framework.runAction(
      {
        connectionId: 'conn_oc_deny',
        action: { name: 'summarize', args: {} },
        meta: {},
      },
      async () => {
        throw new Error('should not run');
      },
    );
    expect(out.allow).toBe(false);
    const plugin = framework.plugins[0] as ReturnType<typeof arpPlugin>;
    await plugin.shutdown(100);
  });

  it('onInboundMessage routes through PDP', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_oc_msg');
    const framework = new FakeOpenClaw();
    framework.use(arpPlugin({ agent }));

    const reply = await framework.fireInbound({
      id: 'm-1',
      connectionId: 'conn_oc_msg',
      action: 'ping',
      body: {},
    });
    expect(reply?.body.error).toBeUndefined();
    const plugin = framework.plugins[0] as ReturnType<typeof arpPlugin>;
    await plugin.shutdown(100);
  });
});
