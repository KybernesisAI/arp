/**
 * Push delivery (AgentID S4 / P3).
 *
 * When an identity has no WebSocket session but `runtime_kind = 'push'`, the
 * gateway delivers the (already policy-checked) message to the runtime over
 * HTTPS, waits for the runtime's answer, signs a `/response` envelope with the
 * identity's cloud-held key, and forwards it to the peer. The runtime trusts
 * the gateway through a short-lived ES256 JWS (`kind: 'arp-push'`) verifiable
 * against `GET /.well-known/jwks.json` — the same offline-verification shape
 * `@kybernesis/enterprise` uses for the control plane.
 *
 * Two runtime kinds:
 *   eve      POST <push_url>/eve/v1/session {message}, then read the NDJSON
 *            stream incrementally until the turn completes.
 *   generic  POST <push_url> {prompt, peerDid, thid, connectionId} → {reply}
 *
 * Also owns the in-process pending-reply registry used by the agent-API
 * (`POST /agent-api/send` waits for the `/response` whose thid matches).
 */

import { randomUUID } from 'node:crypto';
import { SignJWT, exportJWK, importJWK, type JWK, type KeyLike } from 'jose';
import type { CloudDbClient, AgentRow } from '@kybernesis/arp-cloud-db';
import { signEnvelope } from '@kybernesis/arp-transport';
import type { DidCommMessage } from '@kybernesis/arp-transport';
import type { Obligation } from '@kybernesis/arp-spec';
import { openPrivateKey } from './custody.js';
import type { CloudRuntimeLogger } from './types.js';

// ------------------------------------------------------------------ context

export interface PushSigner {
  privateKey: KeyLike;
  kid: string;
  /** Public JWKS document served at /.well-known/jwks.json. */
  jwks: { keys: JWK[] };
}

export interface PushContext {
  /** Issuer origin embedded in push tokens, e.g. `https://gateway.arp.run`. */
  issuer: string;
  signer: PushSigner;
  sealingKey: Uint8Array;
  fetchImpl?: typeof fetch;
  /** Per-delivery timeout (ms). Eve turns can run long; default 5 min. */
  timeoutMs?: number;
  /** Deliver a signed envelope to a peer. Injected to avoid a forward.ts cycle. */
  forward: (params: { peerDid: string; envelope: string }) => Promise<unknown>;
}

/** Build a signer from an ES256 private JWK (env `ARP_CLOUD_PUSH_SIGNING_JWK`). */
export async function pushSignerFromJwk(jwkJson: string): Promise<PushSigner> {
  const jwk = JSON.parse(jwkJson) as JWK;
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d) {
    throw new Error('ARP_CLOUD_PUSH_SIGNING_JWK must be an EC P-256 private JWK');
  }
  const privateKey = (await importJWK(jwk, 'ES256')) as KeyLike;
  const { d: _d, ...pub } = jwk;
  const kid = jwk.kid ?? 'arp-push-1';
  const publicJwk = { ...(await exportJWK((await importJWK(pub, 'ES256')) as KeyLike)), kid, alg: 'ES256', use: 'sig' };
  return { privateKey, kid, jwks: { keys: [publicJwk] } };
}

// ------------------------------------------------------------------ tokens

export interface PushClaims {
  kind: 'arp-push';
  agent_did: string;
  peer_did: string;
  connection_id: string;
  msg_id: string;
  thid: string;
  purpose: string | null;
  obligations: Obligation[];
}

export async function mintPushToken(ctx: PushContext, claims: PushClaims, ttlSeconds = 300): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'ES256', kid: ctx.signer.kid, typ: 'JWT' })
    .setIssuer(ctx.issuer)
    .setAudience(claims.agent_did)
    .setSubject(claims.peer_did)
    .setJti(claims.msg_id)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(ctx.signer.privateKey);
}

// ------------------------------------------------------------------ pending replies

interface Pending {
  resolve: (r: { text: string; msgId: string }) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}
const pending = new Map<string, Pending>();

/** Register interest in the `/response` for `thid` (agent-API send). */
export function awaitReply(thid: string, timeoutMs = 120_000): Promise<{ text: string; msgId: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(thid);
      reject(new Error(`awaitReply(${thid}): timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    pending.set(thid, { resolve, reject, timer });
  });
}

/** Called by dispatch for every inbound `/response`; true when it was consumed. */
export function resolvePendingReply(thid: string | undefined, msg: DidCommMessage): boolean {
  if (!thid) return false;
  const p = pending.get(thid);
  if (!p) return false;
  pending.delete(thid);
  clearTimeout(p.timer);
  p.resolve({ text: extractText(msg.body), msgId: msg.id });
  return true;
}

/**
 * Resolve a pending reply straight from a signed `/response` envelope our own
 * hosted agent produced — used before the peer lookup so replies to callers
 * that are NOT hosted here (external A2A clients) still reach the waiter.
 * Decodes without verifying: the envelope was signed by this gateway's own
 * paths (push reply or WS outbound), never by an external party.
 */
export function resolvePendingFromEnvelope(compact: string): boolean {
  const parts = compact.split('.');
  if (parts.length !== 3) return false;
  try {
    const msg = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as DidCommMessage;
    if (!msg || typeof msg.type !== 'string') return false;
    if (!(msg.type.endsWith('/response') || msg.type.endsWith('.response'))) return false;
    return resolvePendingReply(msg.thid, msg);
  } catch {
    return false;
  }
}

/** Drop a pending wait (e.g. the request was rejected before delivery). */
export function cancelPendingReply(thid: string): void {
  const p = pending.get(thid);
  if (!p) return;
  pending.delete(thid);
  clearTimeout(p.timer);
  p.reject(new Error('cancelled'));
}

export function pendingReplyCount(): number {
  return pending.size;
}

// ------------------------------------------------------------------ runtime adapters

export function extractText(body: Record<string, unknown> | undefined): string {
  if (!body) return '';
  for (const k of ['text', 'reply', 'result', 'message']) {
    const v = body[k];
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object' && typeof (v as { result?: unknown }).result === 'string') {
      return (v as { result: string }).result;
    }
  }
  return JSON.stringify(body);
}

export interface DeliveryInput {
  agent: Pick<AgentRow, 'did' | 'pushUrl' | 'pushKind' | 'agentName'>;
  peerDid: string;
  connectionId: string;
  purpose: string | null;
  msg: DidCommMessage;
  obligations: Obligation[];
}

function composePrompt(input: DeliveryInput): string {
  const text = extractText(input.msg.body);
  const peer = input.peerDid.replace(/^did:web:/, '');
  const lines = [
    `Message from ${peer} (a paired agent, connection ${input.connectionId}${input.purpose ? `, purpose: ${input.purpose}` : ''}).`,
  ];
  if (input.obligations.length > 0) {
    lines.push(`Obligations on your reply: ${input.obligations.map((o) => o.type).join(', ')}.`);
  }
  lines.push('Reply with your answer only; it will be delivered back to them.', '', text);
  return lines.join('\n');
}

export async function deliverEve(ctx: PushContext, input: DeliveryInput, token: string): Promise<string> {
  const f = ctx.fetchImpl ?? globalThis.fetch;
  const base = (input.agent.pushUrl ?? '').replace(/\/+$/, '');
  const timeout = ctx.timeoutMs ?? 5 * 60_000;
  const started = await f(`${base}/eve/v1/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: composePrompt(input) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!started.ok) throw new Error(`runtime refused the message (HTTP ${started.status})`);
  const { sessionId } = (await started.json()) as { sessionId?: string };
  if (!sessionId) throw new Error('runtime did not open a session');

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeout);
  let reply = '';
  try {
    const res = await f(`${base}/eve/v1/session/${encodeURIComponent(sessionId)}/stream?startIndex=0`, {
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`runtime would not stream its answer (HTTP ${res.status})`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let event: { type?: string; data?: Record<string, unknown> };
        try {
          event = JSON.parse(line) as { type?: string; data?: Record<string, unknown> };
        } catch {
          continue;
        }
        if (event.type === 'message.completed' && event.data?.['finishReason'] === 'stop') {
          reply = String(event.data['message'] ?? '');
        }
        if (event.type === 'turn.failed' || event.type === 'session.failed') {
          const detail = (event.data as { message?: string } | undefined)?.message;
          throw new Error(`runtime failed to answer${detail ? `: ${detail}` : ''}`);
        }
        if (event.type === 'session.waiting' || event.type === 'turn.completed') {
          await reader.cancel().catch(() => undefined);
          return reply;
        }
      }
    }
    return reply;
  } finally {
    clearTimeout(deadline);
  }
}

export async function deliverGeneric(ctx: PushContext, input: DeliveryInput, token: string): Promise<string> {
  const f = ctx.fetchImpl ?? globalThis.fetch;
  const res = await f(input.agent.pushUrl ?? '', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      prompt: composePrompt(input),
      text: extractText(input.msg.body),
      peerDid: input.peerDid,
      thid: input.msg.thid ?? input.msg.id,
      connectionId: input.connectionId,
      obligations: input.obligations,
    }),
    signal: AbortSignal.timeout(ctx.timeoutMs ?? 5 * 60_000),
  });
  if (!res.ok) throw new Error(`runtime responded ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const body = (await res.json()) as { reply?: string };
    if (typeof body.reply !== 'string') throw new Error('runtime JSON response missing { reply }');
    return body.reply;
  }
  return res.text();
}

// ------------------------------------------------------------------ orchestrator

export interface DeliverPushResult {
  ok: boolean;
  reply?: string;
  responseMsgId?: string;
  error?: string;
}

/**
 * Deliver one inbound message to a push runtime and send the reply back to
 * the peer as a signed `/response`. Never throws; the caller logs + marks.
 */
export async function deliverPush(
  ctx: PushContext,
  db: CloudDbClient,
  input: DeliveryInput & { agent: AgentRow },
  logger: CloudRuntimeLogger,
): Promise<DeliverPushResult> {
  const log = logger.child({ agentDid: input.agent.did, msgId: input.msg.id, pushKind: input.agent.pushKind });
  if (!input.agent.pushUrl || !input.agent.pushKind) return { ok: false, error: 'push_not_configured' };
  if (input.agent.keyCustody !== 'cloud' || !input.agent.privateKeyEnc) return { ok: false, error: 'key_not_in_cloud_custody' };

  const thid = input.msg.thid ?? input.msg.id;
  let reply: string;
  try {
    const token = await mintPushToken(ctx, {
      kind: 'arp-push',
      agent_did: input.agent.did,
      peer_did: input.peerDid,
      connection_id: input.connectionId,
      msg_id: input.msg.id,
      thid,
      purpose: input.purpose,
      obligations: input.obligations,
    });
    reply = input.agent.pushKind === 'eve' ? await deliverEve(ctx, input, token) : await deliverGeneric(ctx, input, token);
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'push_delivery_failed');
    return { ok: false, error: (err as Error).message };
  }

  // Do not reply to a reply — a `/response` delivered by push is terminal.
  const isResponse = input.msg.type.endsWith('/response') || input.msg.type.endsWith('.response');
  if (isResponse) return { ok: true, reply };

  try {
    const seed = openPrivateKey(input.agent.privateKeyEnc, ctx.sealingKey);
    const responseMsgId = randomUUID();
    const env = await signEnvelope({
      message: {
        id: responseMsgId,
        type: 'https://didcomm.org/arp/1.0/response',
        from: input.agent.did,
        to: [input.peerDid],
        thid,
        body: { text: reply, connection_id: input.connectionId },
      },
      signerDid: input.agent.did,
      privateKey: seed,
    });
    seed.fill(0);
    const forwarded = await ctx.forward({ peerDid: input.peerDid, envelope: env.compact });
    if (forwarded === null) log.warn({ peerDid: input.peerDid }, 'push_reply_peer_not_hosted');
    void db; // reserved for future outbound persistence
    return { ok: true, reply, responseMsgId };
  } catch (err) {
    log.error({ err: (err as Error).message }, 'push_reply_failed');
    return { ok: false, reply, error: (err as Error).message };
  }
}

/**
 * Agent-API send: sign a request envelope for a cloud-custody identity and
 * forward it to the peer. Returns thid so the caller can `awaitReply`.
 */
export async function sendFromCloudIdentity(
  ctx: PushContext,
  agent: AgentRow,
  params: { peerDid: string; text: string; connectionId: string; thid?: string; action?: string },
): Promise<{ msgId: string; thid: string; forwarded: unknown }> {
  if (agent.keyCustody !== 'cloud' || !agent.privateKeyEnc) throw new Error('key_not_in_cloud_custody');
  const msgId = randomUUID();
  const thid = params.thid ?? msgId;
  const seed = openPrivateKey(agent.privateKeyEnc, ctx.sealingKey);
  const body: Record<string, unknown> = { text: params.text, connection_id: params.connectionId };
  if (params.action) body['action'] = params.action;
  const env = await signEnvelope({
    message: { id: msgId, type: 'https://didcomm.org/arp/1.0/request', from: agent.did, to: [params.peerDid], thid, body },
    signerDid: agent.did,
    privateKey: seed,
  });
  seed.fill(0);
  const forwarded = await ctx.forward({ peerDid: params.peerDid, envelope: env.compact });
  return { msgId, thid, forwarded };
}
