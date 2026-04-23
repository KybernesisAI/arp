import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import { END, START, StateGraph, Annotation } from '@langchain/langgraph';
import { ArpAgent } from '@kybernesis/arp-sdk';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { arpNode, arpRouter } from '../src/index.js';

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
  const dataDir = mkdtempSync(join(tmpdir(), 'arp-lg-graph-'));
  dirs.push(dataDir);
  return ArpAgent.fromHandoff(
    {
      agent_did: 'did:web:lg-graph-test.agent',
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

async function seed(agent: ArpAgent, connectionId: string, allow: boolean) {
  const policy = allow
    ? `@id("p_allow_all")\npermit(principal, action, resource);`
    : `@id("p_deny")\nforbid(principal, action, resource);`;
  const token = {
    connection_id: connectionId,
    issuer: 'did:web:owner.self.xyz',
    subject: agent.did,
    audience: 'did:web:peer.agent',
    purpose: 'langgraph integration',
    cedar_policies: [policy],
    obligations: [],
    scope_catalog_version: 'v1',
    expires: '2030-01-01T00:00:00.000Z',
    sigs: { issuer: 'x', audience: 'y' },
  };
  await agent.connections.add(token, JSON.stringify(token));
}

describe('@kybernesis/arp-adapter-langgraph in a real LangGraph StateGraph', () => {
  it('routes to allow branch when PDP permits', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_lg_graph_allow', true);

    const State = Annotation.Root({
      arp_connection_id: Annotation<string>(),
      arp_pending_action: Annotation<{
        action: string;
        resource: { type: string; id: string };
      }>(),
      arp_decision: Annotation<'allow' | 'deny' | undefined>(),
      arp_reason: Annotation<string | undefined>(),
      arp_obligations: Annotation<Array<{ type: string; params: Record<string, unknown> }> | undefined>(),
      path: Annotation<string[]>({
        reducer: (a, b) => [...(a ?? []), ...(b ?? [])],
        default: () => [],
      }),
    });

    const graph = new StateGraph(State)
      .addNode('guard', arpNode({ agent }))
      .addNode('act', async () => ({ path: ['act'] }))
      .addNode('deny', async () => ({ path: ['deny'] }))
      .addEdge(START, 'guard')
      .addConditionalEdges('guard', arpRouter(), {
        allow: 'act',
        deny: 'deny',
      })
      .addEdge('act', END)
      .addEdge('deny', END)
      .compile();

    const result = await graph.invoke({
      arp_connection_id: 'conn_lg_graph_allow',
      arp_pending_action: {
        action: 'summarize',
        resource: { type: 'Doc', id: 'alpha' },
      },
    });

    expect(result.arp_decision).toBe('allow');
    expect(result.path).toContain('act');
    expect(result.path).not.toContain('deny');
    await agent.stop({ graceMs: 100 });
  });

  it('routes to deny branch when PDP forbids', async () => {
    const agent = await buildAgent();
    await seed(agent, 'conn_lg_graph_deny', false);

    const State = Annotation.Root({
      arp_connection_id: Annotation<string>(),
      arp_pending_action: Annotation<{
        action: string;
        resource: { type: string; id: string };
      }>(),
      arp_decision: Annotation<'allow' | 'deny' | undefined>(),
      arp_reason: Annotation<string | undefined>(),
      arp_obligations: Annotation<Array<{ type: string; params: Record<string, unknown> }> | undefined>(),
      path: Annotation<string[]>({
        reducer: (a, b) => [...(a ?? []), ...(b ?? [])],
        default: () => [],
      }),
    });

    const graph = new StateGraph(State)
      .addNode('guard', arpNode({ agent }))
      .addNode('act', async () => ({ path: ['act'] }))
      .addNode('deny', async () => ({ path: ['deny'] }))
      .addEdge(START, 'guard')
      .addConditionalEdges('guard', arpRouter(), {
        allow: 'act',
        deny: 'deny',
      })
      .addEdge('act', END)
      .addEdge('deny', END)
      .compile();

    const result = await graph.invoke({
      arp_connection_id: 'conn_lg_graph_deny',
      arp_pending_action: {
        action: 'summarize',
        resource: { type: 'Doc', id: 'alpha' },
      },
    });

    expect(result.arp_decision).toBe('deny');
    expect(result.path).toContain('deny');
    expect(result.path).not.toContain('act');
    await agent.stop({ graceMs: 100 });
  });
});
