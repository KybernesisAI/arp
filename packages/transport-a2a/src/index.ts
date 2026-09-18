/**
 * @kybernesis/arp-transport-a2a — AgentID S5 / A4.
 *
 * Outbound half of "ARP as an A2A extension": given a peer DID, find its
 * A2A card, pick the JSON-RPC interface, and send `message/send` with the
 * ARP Connection Token as the bearer credential. The task the peer returns
 * is mapped back onto an ARP `/response` message so the rest of ARP
 * (audit, pending-reply correlation, adapters) never sees A2A.
 *
 * The package depends on `@kybernesis/arp-transport` only for the message
 * types (CLAUDE.md invariant #1 — no wire-format libraries leak out of the
 * transport package) and on `@kybernesis/arp-spec` for the card schema.
 */

import { WELL_KNOWN_PATHS, A2aAgentCardSchema, ARP_A2A_EXTENSION_URI, type A2aAgentCard, type ConnectionToken } from '@kybernesis/arp-spec';
import type { DidCommMessage, MessageHandler, Transport } from '@kybernesis/arp-transport';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// ------------------------------------------------------------------ DID → origin

/**
 * `did:web:<host>[:<path segment>...]` → `https://<host>/<path>`. When the
 * host ends in `.agent` and a mirror suffix is configured, the ICANN mirror
 * origin is used instead (public HNS resolvers are unreliable; S2 §0.2).
 */
export function a2aOriginForDid(did: string, opts: { mirrorSuffix?: string | null } = {}): string | null {
  if (!did.startsWith('did:web:')) return null;
  const [hostRaw, ...segments] = did.slice('did:web:'.length).split(':');
  if (!hostRaw) return null;
  let host = decodeURIComponent(hostRaw).toLowerCase();
  if (opts.mirrorSuffix && host.endsWith('.agent') && !host.includes('/')) {
    host = `${host}${opts.mirrorSuffix.startsWith('.') ? opts.mirrorSuffix : `.${opts.mirrorSuffix}`}`;
  }
  const path = segments.map((s) => decodeURIComponent(s)).join('/');
  return `https://${host}${path ? `/${path}` : ''}`;
}

// ------------------------------------------------------------------ card resolution

export interface ResolvedA2aInterface {
  /** JSON-RPC endpoint URL. */
  url: string;
  card: A2aAgentCard;
  /** Present when the peer advertises the ARP extension (it is an ARP identity). */
  arpExtension: { uri: string; params?: Record<string, unknown> } | null;
}

export interface ResolveOptions {
  fetchImpl?: FetchLike;
  mirrorSuffix?: string | null;
  /** Override the card origin (tests / private deployments). */
  originForDid?: (did: string) => string | null;
}

/** Fetch + validate a peer's A2A card and pick its JSON-RPC interface. */
export async function resolveA2aInterface(did: string, opts: ResolveOptions = {}): Promise<ResolvedA2aInterface | null> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
  if (!fetchImpl) throw new Error('fetch not available');
  const origin = opts.originForDid ? opts.originForDid(did) : a2aOriginForDid(did, { mirrorSuffix: opts.mirrorSuffix ?? null });
  if (!origin) return null;
  let res: Response;
  try {
    res = await fetchImpl(`${origin}${WELL_KNOWN_PATHS.A2A_AGENT_CARD}`, { headers: { accept: 'application/json' } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  const parsed = A2aAgentCardSchema.safeParse(json);
  if (!parsed.success) return null;
  const card = parsed.data;
  const iface = card.supportedInterfaces.find((i) => i.protocolBinding === 'JSONRPC');
  if (!iface) return null;
  const ext = card.capabilities?.extensions?.find((e) => e.uri === ARP_A2A_EXTENSION_URI) ?? null;
  return {
    url: iface.url,
    card,
    arpExtension: ext ? { uri: ext.uri, ...(ext.params ? { params: ext.params as Record<string, unknown> } : {}) } : null,
  };
}

// ------------------------------------------------------------------ JSON-RPC client

export type A2aTaskState =
  | 'TASK_STATE_SUBMITTED'
  | 'TASK_STATE_WORKING'
  | 'TASK_STATE_COMPLETED'
  | 'TASK_STATE_FAILED'
  | 'TASK_STATE_CANCELED'
  | 'TASK_STATE_INPUT_REQUIRED'
  | 'TASK_STATE_REJECTED'
  | 'TASK_STATE_AUTH_REQUIRED';

export interface A2aPart {
  text?: string;
  data?: unknown;
  mediaType?: string;
}
export interface A2aMessage {
  messageId: string;
  contextId?: string;
  taskId?: string;
  role: 'ROLE_USER' | 'ROLE_AGENT';
  parts: A2aPart[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
}
export interface A2aTask {
  id: string;
  contextId?: string;
  status: { state: A2aTaskState; message?: A2aMessage; timestamp?: string };
  history?: A2aMessage[];
  artifacts?: Array<{ parts?: A2aPart[] }>;
  metadata?: Record<string, unknown>;
}

export interface A2aRpcError extends Error {
  code: number;
  data?: unknown;
}

const TERMINAL: ReadonlySet<A2aTaskState> = new Set([
  'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED',
  'TASK_STATE_CANCELED',
  'TASK_STATE_REJECTED',
  'TASK_STATE_AUTH_REQUIRED',
  'TASK_STATE_INPUT_REQUIRED',
]);

/** Serialise a Connection Token the way the gateway's `/a2a` expects it as a bearer. */
export function connectionTokenBearer(token: ConnectionToken | Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(token), 'utf8').toString('base64url');
}

/** Best-effort text of a task's reply: status message, else last agent turn, else artifacts. */
export function taskText(task: A2aTask): string {
  const fromParts = (parts: A2aPart[] | undefined) => (parts ?? []).map((p) => p.text ?? '').filter(Boolean).join('\n');
  const status = fromParts(task.status.message?.parts);
  if (status) return status;
  const history = [...(task.history ?? [])].reverse().find((m) => m.role === 'ROLE_AGENT');
  const hist = fromParts(history?.parts);
  if (hist) return hist;
  return (task.artifacts ?? []).map((a) => fromParts(a.parts)).filter(Boolean).join('\n');
}

export interface A2aClientOptions {
  fetchImpl?: FetchLike;
  /** Extension URIs to negotiate via the `A2A-Extensions` header. Default: the ARP extension. */
  extensions?: string[];
  /** Per-request timeout (ms). Default 130 s (the gateway waits up to 120 s inside message/send). */
  timeoutMs?: number;
}

export interface SendMessageInput {
  url: string;
  bearer?: string;
  text: string;
  messageId?: string;
  contextId?: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

export interface A2aClient {
  sendMessage(input: SendMessageInput): Promise<A2aTask>;
  getTask(input: { url: string; bearer?: string; id: string }): Promise<A2aTask>;
  /** message/send, then poll tasks/get until a terminal state or the deadline. */
  sendAndWait(input: SendMessageInput & { waitMs?: number; pollMs?: number }): Promise<A2aTask>;
}

export function createA2aClient(opts: A2aClientOptions = {}): A2aClient {
  const fetchImpl: FetchLike | undefined = opts.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
  if (!fetchImpl) throw new Error('fetch not available');
  const doFetch: FetchLike = fetchImpl;
  const extensions = opts.extensions ?? [ARP_A2A_EXTENSION_URI];
  const timeoutMs = opts.timeoutMs ?? 130_000;
  let seq = 0;

  async function rpc<T>(url: string, bearer: string | undefined, method: string, params: Record<string, unknown>): Promise<T> {
    const id = `${Date.now()}-${++seq}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
          ...(extensions.length ? { 'a2a-extensions': extensions.join(', ') } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    let body: { result?: T; error?: { code: number; message: string; data?: unknown } };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw Object.assign(new Error(`a2a_http_${res.status}`), { code: -32000 }) as A2aRpcError;
    }
    if (body.error) {
      throw Object.assign(new Error(body.error.message), { code: body.error.code, data: body.error.data }) as A2aRpcError;
    }
    if (body.result === undefined) throw Object.assign(new Error('a2a_empty_result'), { code: -32000 }) as A2aRpcError;
    return body.result;
  }

  const client: A2aClient = {
    async sendMessage(input) {
      const message: A2aMessage = {
        messageId: input.messageId ?? cryptoRandomId(),
        role: 'ROLE_USER',
        parts: [{ text: input.text }],
        ...(input.contextId ? { contextId: input.contextId } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
        ...(extensions.length ? { extensions } : {}),
      };
      return rpc<A2aTask>(input.url, input.bearer, 'message/send', { message });
    },
    async getTask(input) {
      return rpc<A2aTask>(input.url, input.bearer, 'tasks/get', { id: input.id });
    },
    async sendAndWait(input) {
      const waitMs = input.waitMs ?? 120_000;
      const pollMs = input.pollMs ?? 1_000;
      const deadline = Date.now() + waitMs;
      let task = await client.sendMessage(input);
      while (!TERMINAL.has(task.status.state) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, Math.min(pollMs, Math.max(0, deadline - Date.now()))));
        task = await client.getTask({ url: input.url, id: task.id, ...(input.bearer ? { bearer: input.bearer } : {}) });
      }
      return task;
    },
  };
  return client;
}

function cryptoRandomId(): string {
  const g = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return g?.randomUUID ? g.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ------------------------------------------------------------------ Transport adapter

export interface A2aTransportOptions extends ResolveOptions, A2aClientOptions {
  /** Our own DID (the `from` of replies handed to the listener). */
  did: string;
  /** Bearer credential for a given peer — the ARP Connection Token for that connection. */
  bearerFor: (peerDid: string) => Promise<string | null> | string | null;
  /** How long `send` waits for the peer's task to settle. Default 120 s. */
  waitMs?: number;
  now?: () => number;
}

export interface A2aSendResult {
  task: A2aTask;
  /** The ARP `/response` message derived from the task (null when the task did not complete). */
  response: DidCommMessage | null;
  /** Denial / failure reason when the task ended in REJECTED / AUTH_REQUIRED / FAILED / CANCELED. */
  denied: { state: A2aTaskState; reason: string } | null;
}

/** ARP → A2A outbound transport: `Transport.send` + `listen`, no inbox (A2A replies are synchronous). */
export interface A2aTransport extends Pick<Transport, 'send' | 'listen' | 'close'> {
  /** Like `send`, but returns the task + the derived `/response` instead of only dispatching it to the listener. */
  sendAndCollect(to: string, payload: DidCommMessage): Promise<A2aSendResult>;
  resolve(peerDid: string): Promise<ResolvedA2aInterface | null>;
}

export function createA2aTransport(opts: A2aTransportOptions): A2aTransport {
  const client = createA2aClient(opts);
  const now = opts.now ?? (() => Date.now());
  const waitMs = opts.waitMs ?? 120_000;
  let handler: MessageHandler | null = null;
  const cache = new Map<string, { at: number; value: ResolvedA2aInterface | null }>();
  const CACHE_MS = 5 * 60_000;

  async function resolve(peerDid: string): Promise<ResolvedA2aInterface | null> {
    const hit = cache.get(peerDid);
    if (hit && now() - hit.at < CACHE_MS) return hit.value;
    const value = await resolveA2aInterface(peerDid, opts);
    cache.set(peerDid, { at: now(), value });
    return value;
  }

  async function sendAndCollect(to: string, payload: DidCommMessage): Promise<A2aSendResult> {
    const iface = await resolve(to);
    if (!iface) throw Object.assign(new Error(`no A2A interface for ${to}`), { code: 'unknown_peer' });
    const bearer = (await opts.bearerFor(to)) ?? undefined;
    const text = typeof payload.body['text'] === 'string' ? (payload.body['text'] as string) : JSON.stringify(payload.body);
    const thid = payload.thid ?? payload.id;
    const task = await client.sendAndWait({
      url: iface.url,
      ...(bearer ? { bearer } : {}),
      text,
      messageId: payload.id,
      contextId: thid,
      metadata: { arp: { type: payload.type, thid, from: payload.from, ...(payload.body['connection_id'] ? { connection_id: payload.body['connection_id'] } : {}) } },
      waitMs,
    });
    const state = task.status.state;
    if (state === 'TASK_STATE_COMPLETED') {
      const response: DidCommMessage = {
        id: task.status.message?.messageId ?? cryptoRandomId(),
        type: 'https://didcomm.org/arp/1.0/response',
        from: to,
        to: [opts.did],
        thid,
        created_time: Math.floor(now() / 1000),
        body: { text: taskText(task), a2a_task_id: task.id, ...(task.status.message?.metadata ? { metadata: task.status.message.metadata } : {}) },
      };
      return { task, response, denied: null };
    }
    const failed = state === 'TASK_STATE_REJECTED' || state === 'TASK_STATE_AUTH_REQUIRED' || state === 'TASK_STATE_FAILED' || state === 'TASK_STATE_CANCELED';
    return { task, response: null, denied: failed ? { state, reason: taskText(task) || state.replace('TASK_STATE_', '').toLowerCase() } : null };
  }

  return {
    resolve,
    sendAndCollect,
    async send(to, payload) {
      const result = await sendAndCollect(to, payload);
      if (result.denied) throw Object.assign(new Error(result.denied.reason), { code: 'send_failed', state: result.denied.state });
      if (result.response && handler) {
        await handler(result.response, { peerDid: to, verified: false, envelopeRaw: JSON.stringify(result.task), receivedAtMs: now() });
      }
    },
    listen(h) {
      handler = h;
    },
    async close() {
      handler = null;
      cache.clear();
    },
  };
}
