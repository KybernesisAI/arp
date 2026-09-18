import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { ARP_A2A_EXTENSION_URI } from '@kybernesis/arp-spec';
import type { DidCommMessage } from '@kybernesis/arp-transport';
import {
  a2aOriginForDid,
  connectionTokenBearer,
  createA2aClient,
  createA2aTransport,
  resolveA2aInterface,
  taskText,
  type A2aTask,
  type FetchLike,
} from '../src/index.js';

const PEER = 'did:web:peer.example';
const ME = 'did:web:me.agent';

/** Minimal A2A v1.0 JSON-RPC server: signed-card discovery + message/send + tasks/get. */
function fakeA2aServer(opts: { pollOnce?: boolean; requireBearer?: string } = {}) {
  const app = new Hono();
  const seen: { bearer?: string; extensions?: string; messages: Array<Record<string, unknown>> } = { messages: [] };
  const tasks = new Map<string, A2aTask>();
  app.get('/.well-known/agent-card.json', (c) =>
    c.json({
      name: 'peer',
      description: 'A stock A2A agent',
      protocolVersion: '1.0',
      version: '1.0.0',
      supportedInterfaces: [
        { url: 'https://peer.example/grpc', protocolBinding: 'GRPC', protocolVersion: '1.0' },
        { url: 'https://peer.example/rpc', protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
      ],
      capabilities: { streaming: false, extensions: [{ uri: ARP_A2A_EXTENSION_URI, params: { did: PEER } }] },
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['text/plain'],
      skills: [{ id: 'converse', name: 'Converse', description: 'chat', tags: ['chat'] }],
    }),
  );
  app.post('/rpc', async (c) => {
    seen.bearer = c.req.header('authorization') ?? undefined;
    seen.extensions = c.req.header('a2a-extensions') ?? undefined;
    const req = (await c.req.json()) as { id: string; method: string; params: Record<string, unknown> };
    if (opts.requireBearer && seen.bearer !== `Bearer ${opts.requireBearer}`) {
      const task: A2aTask = {
        id: 't-auth',
        contextId: 'ctx',
        status: { state: 'TASK_STATE_AUTH_REQUIRED', message: { messageId: 'm', role: 'ROLE_AGENT', parts: [{ text: 'Pair first: https://cloud.arp.run/pair?peer=did:web:peer.example' }] } },
      };
      return c.json({ jsonrpc: '2.0', id: req.id, result: task });
    }
    if (req.method === 'message/send') {
      const message = req.params['message'] as Record<string, unknown>;
      seen.messages.push(message);
      const text = ((message['parts'] as Array<{ text?: string }>)[0]?.text ?? '') as string;
      const id = `task-${seen.messages.length}`;
      const done: A2aTask = {
        id,
        contextId: (message['contextId'] as string) ?? 'ctx',
        status: { state: 'TASK_STATE_COMPLETED', message: { messageId: 'r1', role: 'ROLE_AGENT', parts: [{ text: `echo:${text}` }] }, timestamp: new Date().toISOString() },
        history: [message as unknown as A2aTask['history'] extends Array<infer M> ? M : never],
      };
      if (opts.pollOnce) {
        tasks.set(id, done);
        return c.json({ jsonrpc: '2.0', id: req.id, result: { id, contextId: done.contextId, status: { state: 'TASK_STATE_SUBMITTED' } } });
      }
      return c.json({ jsonrpc: '2.0', id: req.id, result: done });
    }
    if (req.method === 'tasks/get') {
      const t = tasks.get(req.params['id'] as string);
      if (!t) return c.json({ jsonrpc: '2.0', id: req.id, error: { code: -32001, message: 'Task not found' } });
      return c.json({ jsonrpc: '2.0', id: req.id, result: t });
    }
    return c.json({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } });
  });
  const fetchImpl: FetchLike = async (input, init) => app.request(input, init);
  return { app, seen, fetchImpl };
}

describe('a2aOriginForDid', () => {
  it('maps did:web hosts, paths, ports and the .agent mirror', () => {
    expect(a2aOriginForDid('did:web:peer.example')).toBe('https://peer.example');
    expect(a2aOriginForDid('did:web:peer.example:agents:bob')).toBe('https://peer.example/agents/bob');
    expect(a2aOriginForDid('did:web:localhost%3A8080')).toBe('https://localhost:8080');
    expect(a2aOriginForDid('did:web:samantha.agent', { mirrorSuffix: '.arp.run' })).toBe('https://samantha.agent.arp.run');
    expect(a2aOriginForDid('did:web:samantha.agent')).toBe('https://samantha.agent');
    expect(a2aOriginForDid('did:key:z6Mk')).toBeNull();
  });
});

describe('resolveA2aInterface', () => {
  it('fetches the card, validates it, picks JSONRPC and surfaces the ARP extension', async () => {
    const { fetchImpl } = fakeA2aServer();
    const r = await resolveA2aInterface(PEER, { fetchImpl });
    expect(r?.url).toBe('https://peer.example/rpc');
    expect(r?.card.name).toBe('peer');
    expect(r?.arpExtension).toEqual({ uri: ARP_A2A_EXTENSION_URI, params: { did: PEER } });
  });
  it('returns null for unreachable / invalid cards', async () => {
    const nothing: FetchLike = async () => new Response('nope', { status: 404 });
    expect(await resolveA2aInterface(PEER, { fetchImpl: nothing })).toBeNull();
    const junk: FetchLike = async () => new Response(JSON.stringify({ name: 'x' }), { status: 200 });
    expect(await resolveA2aInterface(PEER, { fetchImpl: junk })).toBeNull();
    const boom: FetchLike = async () => { throw new Error('ECONNREFUSED'); };
    expect(await resolveA2aInterface(PEER, { fetchImpl: boom })).toBeNull();
  });
});

describe('createA2aClient', () => {
  it('sends message/send with the bearer + extension header and reads the reply', async () => {
    const { fetchImpl, seen } = fakeA2aServer();
    const client = createA2aClient({ fetchImpl });
    const task = await client.sendMessage({ url: 'https://peer.example/rpc', bearer: 'tok', text: 'hi', contextId: 'thid-1' });
    expect(task.status.state).toBe('TASK_STATE_COMPLETED');
    expect(taskText(task)).toBe('echo:hi');
    expect(seen.bearer).toBe('Bearer tok');
    expect(seen.extensions).toBe(ARP_A2A_EXTENSION_URI);
    expect(seen.messages[0]).toMatchObject({ role: 'ROLE_USER', contextId: 'thid-1', parts: [{ text: 'hi' }] });
  });
  it('polls tasks/get until the task settles', async () => {
    const { fetchImpl } = fakeA2aServer({ pollOnce: true });
    const client = createA2aClient({ fetchImpl });
    const task = await client.sendAndWait({ url: 'https://peer.example/rpc', text: 'later', waitMs: 2_000, pollMs: 10 });
    expect(task.status.state).toBe('TASK_STATE_COMPLETED');
    expect(taskText(task)).toBe('echo:later');
  });
  it('surfaces JSON-RPC errors', async () => {
    const { fetchImpl } = fakeA2aServer();
    const client = createA2aClient({ fetchImpl });
    await expect(client.getTask({ url: 'https://peer.example/rpc', id: 'missing' })).rejects.toMatchObject({ code: -32001 });
  });
});

describe('createA2aTransport', () => {
  const request = (text: string): DidCommMessage => ({
    id: 'msg-1',
    type: 'https://didcomm.org/arp/1.0/request',
    from: ME,
    to: [PEER],
    thid: 'thid-9',
    body: { text, connection_id: 'conn_1' },
  });

  it('maps a COMPLETED task back onto an ARP /response and hands it to the listener', async () => {
    const { fetchImpl, seen } = fakeA2aServer();
    const bearer = connectionTokenBearer({ connection_id: 'conn_1', sigs: {} });
    const t = createA2aTransport({ did: ME, fetchImpl, bearerFor: () => bearer, now: () => 1_700_000_000_000 });
    const got: DidCommMessage[] = [];
    t.listen(async (m) => void got.push(m));
    await t.send(PEER, request('ping'));
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ type: 'https://didcomm.org/arp/1.0/response', from: PEER, to: [ME], thid: 'thid-9', body: { text: 'echo:ping', a2a_task_id: 'task-1' } });
    expect(seen.bearer).toBe(`Bearer ${bearer}`);
    expect(seen.messages[0]).toMatchObject({ messageId: 'msg-1', contextId: 'thid-9', metadata: { arp: { thid: 'thid-9', from: ME, connection_id: 'conn_1' } } });
    // Card resolution is cached per peer.
    const r = await t.sendAndCollect(PEER, request('again'));
    expect(r.response?.body['text']).toBe('echo:again');
    await t.close();
  });

  it('reports AUTH_REQUIRED / REJECTED as a denial instead of a response', async () => {
    const { fetchImpl } = fakeA2aServer({ requireBearer: 'right' });
    const t = createA2aTransport({ did: ME, fetchImpl, bearerFor: () => 'wrong' });
    const r = await t.sendAndCollect(PEER, request('x'));
    expect(r.response).toBeNull();
    expect(r.denied).toMatchObject({ state: 'TASK_STATE_AUTH_REQUIRED' });
    expect(r.denied?.reason).toContain('/pair?peer=');
    await expect(t.send(PEER, request('x'))).rejects.toMatchObject({ code: 'send_failed', state: 'TASK_STATE_AUTH_REQUIRED' });
  });

  it('throws unknown_peer when the peer has no A2A card', async () => {
    const nothing: FetchLike = async () => new Response('', { status: 404 });
    const t = createA2aTransport({ did: ME, fetchImpl: nothing, bearerFor: () => null });
    await expect(t.send(PEER, request('x'))).rejects.toMatchObject({ code: 'unknown_peer' });
  });
});
