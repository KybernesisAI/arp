import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import { ArpAgent } from '@kybernesis/arp-sdk';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { arpGuardedTool, withArp } from '../src/index.js';
import { FakeNanoClaw } from './stubs/nano-fake.js';

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
  const dataDir = mkdtempSync(join(tmpdir(), 'arp-nano-'));
  dirs.push(dataDir);
  return ArpAgent.fromHandoff(
    {
      agent_did: 'did:web:nano-test.agent',
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
  opts: { allow?: boolean; obligations?: Array<{ type: string; params: Record<string, unknown> }> } = {},
) {
  const policy = opts.allow === false
    ? `@id("p_deny")\nforbid(principal, action, resource);`
    : `@id("p_allow_all")\npermit(principal, action, resource);`;
  const token = {
    connection_id: connectionId,
    issuer: 'did:web:owner.example.agent',
    subject: agent.did,
    audience: 'did:web:peer.agent',
    purpose: 'nano adapter test',
    cedar_policies: [policy],
    obligations: opts.obligations ?? [],
    scope_catalog_version: 'v1',
    expires: '2030-01-01T00:00:00.000Z',
    sigs: { issuer: 'x', audience: 'y' },
  };
  await agent.connections.add(token, JSON.stringify(token));
}

describe('@kybernesis/arp-adapter-nanoclaw', () => {
  it('arpGuardedTool wraps a plain async function with check + egress', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_nano_tool', {
      obligations: [{ type: 'redact_fields', params: { fields: ['secret'] } }],
    });
    const guarded = arpGuardedTool(
      agent,
      { connectionId: 'conn_nano_tool', toolName: 'search' },
      async (args: { q: string }) => ({ result: args.q, secret: 's' }),
    );
    const out = (await guarded({ q: 'hi' })) as Record<string, unknown>;
    expect(out.result).toBe('hi');
    expect(out.secret).toBeUndefined();
    await agent.stop({ graceMs: 100 });
  });

  it('arpGuardedTool surfaces denials without running the underlying impl', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_nano_deny', { allow: false });
    let ran = false;
    const guarded = arpGuardedTool(
      agent,
      { connectionId: 'conn_nano_deny', toolName: 'search' },
      async () => {
        ran = true;
        return 'no';
      },
    );
    const out = (await guarded({})) as Record<string, unknown>;
    expect(out.error).toBe('denied_by_arp');
    expect(ran).toBe(false);
    await agent.stop({ graceMs: 100 });
  });

  it('withArp registers tool wrapper + inbound handler on NanoClaw-like host', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_nano_wrap');
    const nano = new FakeNanoClaw();
    const wrap = withArp(nano, { agent, outboundOnly: true });

    const toolOut = (await nano.runTool(
      { connectionId: 'conn_nano_wrap', toolName: 'ping', args: {} },
      async () => ({ pong: true }),
    )) as Record<string, unknown>;
    expect(toolOut.pong).toBe(true);

    const inboundOut = (await nano.fireInbound({
      id: 'm-1',
      connectionId: 'conn_nano_wrap',
      action: 'ping',
      body: {},
    })) as { body: Record<string, unknown> };
    expect(inboundOut.body.error).toBeUndefined();

    await wrap.stop(100);
  });
});
