import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import { ArpAgent } from '@kybernesis/arp-sdk';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { arpEgressNode, arpNode, arpRouter } from '../src/index.js';

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
  const dataDir = mkdtempSync(join(tmpdir(), 'arp-lg-'));
  dirs.push(dataDir);
  return ArpAgent.fromHandoff(
    {
      agent_did: 'did:web:lg-test.agent',
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
  opts: { allow?: boolean; obligations?: Array<{ type: string; params: Record<string, unknown> }> } = {},
) {
  const policy = opts.allow === false
    ? `@id("p_deny")\nforbid(principal, action, resource);`
    : `@id("p_allow_all")\npermit(principal, action, resource);`;
  const token = {
    connection_id: connectionId,
    issuer: 'did:web:owner.self.xyz',
    subject: agent.did,
    audience: 'did:web:peer.agent',
    purpose: 'langgraph adapter test',
    cedar_policies: [policy],
    obligations: opts.obligations ?? [],
    scope_catalog_version: 'v1',
    expires: '2030-01-01T00:00:00.000Z',
    sigs: { issuer: 'x', audience: 'y' },
  };
  await agent.connections.add(token, JSON.stringify(token));
}

describe('@kybernesis/arp-adapter-langgraph (unit)', () => {
  it('arpNode writes allow + obligations on permitted requests', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_lg_allow', {
      obligations: [{ type: 'redact_fields', params: { fields: ['x'] } }],
    });
    const node = arpNode({ agent });
    const out = await node({
      arp_connection_id: 'conn_lg_allow',
      arp_pending_action: {
        action: 'summarize',
        resource: { type: 'Doc', id: 'alpha' },
      },
    });
    expect(out.arp_decision).toBe('allow');
    expect(out.arp_obligations?.[0]?.type).toBe('redact_fields');
    await agent.stop({ graceMs: 100 });
  });

  it('arpNode denies + sets arp_reason on forbidden requests', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_lg_deny', { allow: false });
    const node = arpNode({ agent });
    const out = await node({
      arp_connection_id: 'conn_lg_deny',
      arp_pending_action: {
        action: 'summarize',
        resource: { type: 'Doc', id: 'alpha' },
      },
    });
    expect(out.arp_decision).toBe('deny');
    expect(out.arp_reason).toBeTruthy();
    await agent.stop({ graceMs: 100 });
  });

  it('arpRouter splits state based on arp_decision', () => {
    const route = arpRouter();
    expect(route({ arp_decision: 'allow' })).toBe('allow');
    expect(route({ arp_decision: 'deny' })).toBe('deny');
    expect(route({})).toBe('deny');
  });

  it('arpEgressNode filters a state field through obligations', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_lg_egress');
    const node = arpEgressNode<{ arp_connection_id: string; arp_obligations?: Array<{ type: string; params: Record<string, unknown> }>; result: Record<string, unknown> }>({
      agent,
      dataField: 'result',
    });
    const out = await node({
      arp_connection_id: 'conn_lg_egress',
      arp_obligations: [{ type: 'redact_fields', params: { fields: ['secret'] } }],
      result: { ok: true, secret: 'x' },
    });
    expect((out.result as Record<string, unknown>).secret).toBeUndefined();
    await agent.stop({ graceMs: 100 });
  });
});
