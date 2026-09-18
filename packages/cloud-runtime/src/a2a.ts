/**
 * A2A v1.0 JSON-RPC endpoint for a hosted identity (AgentID S5 / A3).
 *
 * `POST /a2a` on the identity's host. The caller authenticates with an ARP
 * **connection token** as bearer (base64url of the token JSON, or the JSON
 * itself): pairing already established consent + scopes; here we verify the
 * token, check the connection is active for THIS agent, derive the caller's
 * DID from the token, and run the normal policy + audit + delivery path.
 *
 * Methods: message/send, tasks/get, tasks/cancel, agent/getAuthenticatedExtendedCard.
 * Anonymous callers get a Task in AUTH_REQUIRED that says how to pair.
 * Sync-first: the task completes within the request when the reply arrives
 * in time; otherwise SUBMITTED + tasks/get (in-process task map — the
 * gateway is single-instance).
 */

import { randomUUID } from 'node:crypto';
import type { ConnectionToken, DidDocument } from '@kybernesis/arp-spec';
import { ConnectionTokenSchema } from '@kybernesis/arp-spec';
import { verifyConnectionToken } from '@kybernesis/arp-pairing';
import type { DidCommMessage } from '@kybernesis/arp-transport';
import { dispatchVerifiedMessage, type DispatchContext, type PeerResolver } from './dispatch.js';
import { awaitReply, cancelPendingReply, extractText } from './push.js';

// ------------------------------------------------------------------ JSON-RPC

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
const rpcError = (id: JsonRpcRequest['id'], code: number, message: string, data?: unknown): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  error: { code, message, ...(data !== undefined ? { data } : {}) },
});

// A2A task states (proto enum names in JSON form).
export type TaskState =
  | 'TASK_STATE_SUBMITTED'
  | 'TASK_STATE_WORKING'
  | 'TASK_STATE_COMPLETED'
  | 'TASK_STATE_FAILED'
  | 'TASK_STATE_CANCELED'
  | 'TASK_STATE_REJECTED'
  | 'TASK_STATE_AUTH_REQUIRED';

export interface A2aMessage {
  messageId: string;
  contextId?: string;
  taskId?: string;
  role: 'ROLE_USER' | 'ROLE_AGENT';
  parts: Array<{ text?: string; data?: unknown; mediaType?: string }>;
  metadata?: Record<string, unknown>;
}
export interface A2aTask {
  id: string;
  contextId: string;
  status: { state: TaskState; message?: A2aMessage; timestamp: string };
  history: A2aMessage[];
  artifacts: unknown[];
  metadata?: Record<string, unknown>;
}

const tasks = new Map<string, A2aTask>();
const TASK_TTL_MS = 60 * 60 * 1000;
function remember(task: A2aTask): A2aTask {
  tasks.set(task.id, task);
  setTimeout(() => tasks.delete(task.id), TASK_TTL_MS).unref?.();
  return task;
}
function agentMessage(text: string, contextId: string, taskId: string): A2aMessage {
  return { messageId: randomUUID(), contextId, taskId, role: 'ROLE_AGENT', parts: [{ text }] };
}

// ------------------------------------------------------------------ bearer

export function parseConnectionTokenBearer(header: string | undefined): ConnectionToken | null {
  if (!header || !header.startsWith('Bearer ')) return null;
  const raw = header.slice(7).trim();
  let json: unknown = null;
  try {
    json = raw.startsWith('{') ? JSON.parse(raw) : JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = ConnectionTokenSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

// ------------------------------------------------------------------ handler

export interface A2aHandlerOptions {
  resolver: PeerResolver;
  /** Build the dispatch context for the resolved identity. */
  now?: () => number;
  /** How long message/send waits for the reply before returning SUBMITTED. */
  waitMs?: number;
}

export interface A2aIdentity {
  agentDid: string;
  card: Record<string, unknown> | null;
  ctx: DispatchContext;
}

export async function handleA2aRequest(
  opts: A2aHandlerOptions,
  identity: A2aIdentity,
  req: JsonRpcRequest,
  authorization: string | undefined,
): Promise<JsonRpcResponse> {
  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') return rpcError(req.id ?? null, -32600, 'Invalid Request');
  const now = opts.now ?? (() => Date.now());
  const pairUrl = `https://cloud.arp.run/pair?peer=${encodeURIComponent(identity.agentDid)}`;

  if (req.method === 'agent/getAuthenticatedExtendedCard') {
    return { jsonrpc: '2.0', id: req.id, result: identity.card ?? {} };
  }
  if (req.method === 'tasks/get') {
    const id = String((req.params as { id?: unknown } | undefined)?.id ?? '');
    const task = tasks.get(id);
    if (!task) return rpcError(req.id, -32001, 'Task not found');
    return { jsonrpc: '2.0', id: req.id, result: task };
  }
  if (req.method === 'tasks/cancel') {
    const id = String((req.params as { id?: unknown } | undefined)?.id ?? '');
    const task = tasks.get(id);
    if (!task) return rpcError(req.id, -32001, 'Task not found');
    return rpcError(req.id, -32002, 'This task cannot be canceled');
  }
  if (req.method !== 'message/send') return rpcError(req.id, -32601, 'Method not found');

  const params = (req.params ?? {}) as { message?: A2aMessage };
  const inbound = params.message;
  const text = (inbound?.parts ?? []).map((p) => (typeof p.text === 'string' ? p.text : '')).filter(Boolean).join('\n');
  if (!inbound || !text) return rpcError(req.id, -32602, 'message.parts must include text');
  const contextId = inbound.contextId ?? randomUUID();
  const taskId = inbound.taskId ?? randomUUID();
  const ts = () => new Date(now()).toISOString();

  // ---- auth: ARP connection token as bearer ------------------------------
  const token = parseConnectionTokenBearer(authorization);
  if (!token) {
    const task = remember({
      id: taskId,
      contextId,
      status: {
        state: 'TASK_STATE_AUTH_REQUIRED',
        message: agentMessage(
          `This agent only talks to paired agents. Request a connection at ${pairUrl}, then send your ARP connection token as the bearer credential.`,
          contextId,
          taskId,
        ),
        timestamp: ts(),
      },
      history: [inbound],
      artifacts: [],
      metadata: { pair: pairUrl },
    });
    return { jsonrpc: '2.0', id: req.id, result: task };
  }
  const me = identity.agentDid;
  const callerDid = token.subject === me ? token.audience : token.audience === me ? token.subject : null;
  if (!callerDid) return rpcError(req.id, -32003, 'Connection token is not for this agent');
  const verified = await verifyConnectionToken(token, {
    resolver: {
      async resolve(did: string) {
        const doc = await opts.resolver.resolveDid(did);
        return doc ? { ok: true as const, value: doc as DidDocument } : { ok: false as const, reason: 'unresolvable' };
      },
    },
    now,
  });
  if (!verified.ok) return rpcError(req.id, -32003, `Connection token rejected: ${verified.reason}`);

  // ---- dispatch through the normal policy + audit path -------------------
  const msgId = randomUUID();
  const thid = contextId;
  const msg: DidCommMessage = {
    id: msgId,
    type: 'https://didcomm.org/arp/1.0/request',
    from: callerDid,
    to: [me],
    thid,
    created_time: Math.floor(now() / 1000),
    body: { text, connection_id: token.connection_id, a2a: { messageId: inbound.messageId, taskId, contextId } },
  };
  const envelopeRaw = `a2a:${Buffer.from(JSON.stringify(msg)).toString('base64url')}`;
  const waiting = awaitReply(thid, opts.waitMs ?? 120_000).catch(() => null);
  const result = await dispatchVerifiedMessage(identity.ctx, msg, callerDid, envelopeRaw);
  // dispatch reports policy denials as ok:true/decision:'deny' (audited, 202
  // on the DIDComm path); for A2A both shapes are a REJECTED task.
  if (!result.ok || result.decision === 'deny') {
    cancelPendingReply(thid);
    void waiting;
    const task = remember({
      id: taskId,
      contextId,
      status: {
        state: 'TASK_STATE_REJECTED',
        message: agentMessage(`Not allowed on this connection (${result.reason ?? 'denied'}).`, contextId, taskId),
        timestamp: ts(),
      },
      history: [inbound],
      artifacts: [],
    });
    return { jsonrpc: '2.0', id: req.id, result: task };
  }
  const reply = await waiting;
  if (reply) {
    const task = remember({
      id: taskId,
      contextId,
      status: { state: 'TASK_STATE_COMPLETED', message: agentMessage(reply.text, contextId, taskId), timestamp: ts() },
      history: [inbound, agentMessage(reply.text, contextId, taskId)],
      artifacts: [],
      metadata: { connection_id: token.connection_id, msg_id: msgId },
    });
    return { jsonrpc: '2.0', id: req.id, result: task };
  }
  const task = remember({
    id: taskId,
    contextId,
    status: { state: 'TASK_STATE_SUBMITTED', timestamp: ts() },
    history: [inbound],
    artifacts: [],
    metadata: { connection_id: token.connection_id, msg_id: msgId, queued: result.queued ?? false },
  });
  return { jsonrpc: '2.0', id: req.id, result: task };
}

/** Test/ops hook: seed or inspect the in-process task map. */
export function a2aTaskCount(): number {
  return tasks.size;
}
export { extractText as a2aExtractText };
