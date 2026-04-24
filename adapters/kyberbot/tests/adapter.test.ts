import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import { ArpAgent } from '@kybernesis/arp-sdk';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { withArp } from '../src/index.js';
import { FakeKyberBot } from './stubs/kyberbot-fake.js';

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
  const dataDir = mkdtempSync(join(tmpdir(), 'arp-kb-adapter-'));
  dirs.push(dataDir);

  const agent = await ArpAgent.fromHandoff(
    {
      agent_did: 'did:web:kb-adapter-test.agent',
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
  return agent;
}

async function seedConnection(
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
    purpose: 'adapter test',
    cedar_policies: [policy],
    obligations: opts.obligations ?? [],
    scope_catalog_version: 'v1',
    expires: '2030-01-01T00:00:00.000Z',
    sigs: { issuer: 'x', audience: 'y' },
  };
  await agent.connections.add(token, JSON.stringify(token));
}

describe('@kybernesis/arp-adapter-kyberbot', () => {
  it('tool-middleware gates allowed tools and passes result through egress', async () => {
    const agent = await buildAgent();
    await seedConnection(agent, 'conn_tool_allow_test', {
      obligations: [
        { type: 'redact_fields', params: { fields: ['secret'] } },
      ],
    });

    const bot = new FakeKyberBot();
    const wrapper = withArp(bot, { agent });

    const out = (await bot.callTool(
      { connectionId: 'conn_tool_allow_test', toolName: 'search', args: { q: 'hi' } },
      async () => ({ hits: ['a'], secret: 'redacted-please' }),
    )) as Record<string, unknown>;

    expect(out.hits).toEqual(['a']);
    expect(out.secret).toBeUndefined();
    await wrapper.stop(100);
  });

  it('tool-middleware denies forbidden tools via onToolDenied', async () => {
    const agent = await buildAgent();
    await seedConnection(agent, 'conn_tool_deny_test', { allow: false });

    const bot = new FakeKyberBot();
    const wrapper = withArp(bot, {
      agent,
      onToolDenied: (_ctx, reason) => ({ blocked: true, reason }),
    });

    const out = (await bot.callTool(
      { connectionId: 'conn_tool_deny_test', toolName: 'search', args: {} },
      async () => {
        throw new Error('real tool should not run');
      },
    )) as Record<string, unknown>;
    expect(out.blocked).toBe(true);
    await wrapper.stop(100);
  });

  it('onMessage handler gates peer messages by connection_id', async () => {
    const agent = await buildAgent();
    await seedConnection(agent, 'conn_msg_test');

    const bot = new FakeKyberBot();
    const wrapper = withArp(bot, { agent });

    const reply = (await bot.fireMessage({
      id: 'm-1',
      from: 'did:web:peer.agent',
      action: 'summarize',
      body: { connection_id: 'conn_msg_test', topic: 't' },
    })) as { body: Record<string, unknown> };
    expect(reply.body.error).toBeUndefined();
    await wrapper.stop(100);
  });

  it('response filter applies connection-level obligations', async () => {
    const agent = await buildAgent();
    await seedConnection(agent, 'conn_resp_filter', {
      obligations: [
        { type: 'redact_fields', params: { fields: ['email'] } },
      ],
    });

    const bot = new FakeKyberBot();
    const wrapper = withArp(bot, { agent });

    const filtered = (await bot.filterResponse(
      { name: 'X', email: 'a@b' },
      { connectionId: 'conn_resp_filter', messageId: 'msg-x' },
    )) as Record<string, unknown>;
    expect(filtered.name).toBe('X');
    expect(filtered.email).toBeUndefined();
    await wrapper.stop(100);
  });
});
