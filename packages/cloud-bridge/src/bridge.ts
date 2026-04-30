/**
 * Bridge core — wires `@kybernesis/arp-cloud-client` to an adapter.
 *
 * On inbound:
 *   1. cloud-client receives `inbound_message` from the cloud-gateway
 *   2. We decode the JWS payload to get the DIDComm body
 *   3. If the message's thid matches an awaiting `awaitReply()`, resolve
 *      that promise + skip the adapter — the message was a reply to an
 *      outbound this process initiated, not a fresh agent-bound prompt
 *   4. Otherwise hand `body.text` to the adapter; adapter returns a reply
 *      string, we sign + send a response envelope
 *
 * On outbound (new in 0.2.0):
 *   - `sendOutbound({ to, text, ... })` signs an
 *     `https://didcomm.org/arp/1.0/request` envelope and pushes it through
 *     the WS. Returns the generated msgId/thid so the caller can match a
 *     reply via `awaitReply(thid)`.
 *
 * The bridge process is otherwise stateless — conversation state, memory,
 * skills all live inside the agent framework.
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  createCloudClient,
  signBearerToken,
  type CloudClientHandle,
  type InboundMessage,
} from '@kybernesis/arp-cloud-client';
import {
  signEnvelope,
  multibaseEd25519ToRaw,
  base64urlDecode,
} from '@kybernesis/arp-transport';
import type { Adapter, BridgeOptions } from './types.js';
import { PostHog } from 'posthog-node';

interface HandoffBundle {
  agent_did: string;
  principal_did: string;
  public_key_multibase: string;
  agent_private_key_multibase: string;
  gateway_ws_url: string;
}

export interface SendOutboundParams {
  /** Recipient DID. */
  to: string;
  /** Plaintext body. */
  text: string;
  /**
   * Existing thread id to continue. If unset, a new thid (= msgId) is
   * minted; use the returned `thid` to await the reply.
   */
  thid?: string;
  /**
   * Connection id (Cedar PDP scope). Required for any peer that's not
   * the sender themselves — without it the gateway returns
   * `missing_connection_id`. Self-messages with no connectionId fall
   * back to the self-demo permit-all path.
   */
  connectionId?: string | null;
  /** DIDComm protocol URI. Defaults to `https://didcomm.org/arp/1.0/request`. */
  msgType?: string;
  /**
   * Phase B/C — structured ARP action. When set, the envelope body
   * carries `action` + `resource` + caller-supplied params instead of
   * just `text`. The cloud PDP evaluates Cedar policies against the
   * resource attrs; the audience-side adapter dispatches to its
   * /api/arp/<action> handler. Plain-text sends leave this unset and
   * keep using the chat-relay path.
   */
  action?: string;
  /** Action-specific params merged into the envelope body (project_id, kb_id, query, etc.). */
  params?: Record<string, unknown>;
  /** Optional Cedar resource entity (passed through to PDP). */
  resource?: { type: string; id: string; attrs?: Record<string, unknown> };
}

export interface SendOutboundResult {
  msgId: string;
  thid: string;
  gatewayResponse: { ok: boolean; error?: string; status: number; body: unknown };
}

export interface AwaitReplyResult {
  thid: string;
  peerDid: string;
  text: string;
  body: Record<string, unknown>;
}

export interface PeerConnectionInfo {
  connectionId: string;
  peerDid: string;
  status: string;
  purpose: string | null;
  scopeSelections: Array<{ id: string; params?: Record<string, unknown> }>;
  expiresAt: string | null;
}

export interface BridgeHandle {
  readonly agentDid: string;
  readonly gatewayWsUrl: string;
  readonly adapterName: string;
  state(): string;
  stop(): Promise<void>;
  /**
   * Sign + send a DIDComm envelope. POSTs to the gateway's
   * /didcomm?target=<peerHost> endpoint (works through reverse proxies
   * that overwrite Host headers).
   */
  sendOutbound(params: SendOutboundParams): Promise<SendOutboundResult>;
  /**
   * Wait for an inbound DIDComm whose thid matches. Resolves on receipt
   * (the message is also intercepted — the agent's adapter never sees
   * it). Rejects after `timeoutMs` (default 30 000 ms).
   */
  awaitReply(thid: string, timeoutMs?: number): Promise<AwaitReplyResult>;
  /**
   * Fetch the agent's active connections from the cloud, including
   * scope-selections so callers (the contact skill, `arpc peer-actions`)
   * can discover what typed ARP actions are available per peer.
   */
  listPeerConnections(): Promise<PeerConnectionInfo[]>;
}

interface PendingReply {
  resolve: (r: AwaitReplyResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export async function startBridge(opts: BridgeOptions): Promise<BridgeHandle> {
  let bundle: HandoffBundle;
  try {
    bundle = JSON.parse(readFileSync(opts.handoffPath, 'utf-8')) as HandoffBundle;
  } catch (err) {
    throw new Error(`cannot read handoff at ${opts.handoffPath}: ${(err as Error).message}`);
  }

  const agentDid = bundle.agent_did;
  const privateKey = multibaseEd25519ToRaw(bundle.agent_private_key_multibase);
  const cloudWsUrl = opts.cloudWsUrl ?? bundle.gateway_ws_url;

  // Derive HTTP gateway URL from the WS URL — same host, different scheme/path.
  const gatewayHttp = cloudWsUrl
    .replace(/^wss:/, 'https:')
    .replace(/^ws:/, 'http:')
    .replace(/\/ws$/, '');

  if (opts.adapter.init) {
    await opts.adapter.init();
  }

  const phKey = process.env['POSTHOG_KEY'] ?? process.env['NEXT_PUBLIC_POSTHOG_KEY'] ?? '';
  const phHost = process.env['POSTHOG_HOST'] ?? process.env['NEXT_PUBLIC_POSTHOG_HOST'];
  const ph = new PostHog(phKey || 'disabled', {
    ...(phHost ? { host: phHost } : {}),
    flushAt: 1,
    flushInterval: 0,
    disabled: !phKey,
  });

  const pending = new Map<string, PendingReply>();
  let client: CloudClientHandle | null = null;

  client = createCloudClient({
    cloudWsUrl,
    agentDid,
    agentPrivateKey: privateKey,
    clientVersion: `arp-cloud-bridge/${opts.adapter.name}`,
    onStateChange: (s) => {
      // eslint-disable-next-line no-console
      console.log(`[bridge] cloud-client state: ${s}`);
    },
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error(`[bridge] cloud-client error: ${err.message}`);
    },
    onIncoming: async (input) => {
      await handleInbound(input, opts.adapter, client!, agentDid, privateKey, pending, ph);
    },
  });

  return {
    agentDid,
    gatewayWsUrl: cloudWsUrl,
    adapterName: opts.adapter.name,
    state: () => (client ? client.state() : 'stopped'),
    async stop() {
      // Reject any outstanding awaiting promises so callers don't hang.
      for (const [, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new Error('bridge stopped'));
      }
      pending.clear();
      if (client) {
        await client.stop();
        client = null;
      }
    },
    async sendOutbound(params) {
      const msgId = randomUUID();
      const thid = params.thid ?? msgId;
      const msgType = params.msgType ?? 'https://didcomm.org/arp/1.0/request';
      // ── Phase B/C — structured ARP action wire shape ────────────────
      // Plain sends just put `text` in body; typed sends add `action`
      // (and `resource` + caller's params merged in). The cloud PDP
      // pulls action + resource out via dispatch.mapRequest and
      // evaluates cedar against them. Audience adapter dispatches on
      // body.action — see packages/cloud-bridge/src/adapters/kyberbot.ts.
      const messageBody: Record<string, unknown> = { text: params.text };
      if (params.connectionId) messageBody['connection_id'] = params.connectionId;
      if (params.action) messageBody['action'] = params.action;
      if (params.resource) messageBody['resource'] = params.resource;
      if (params.params) Object.assign(messageBody, params.params);
      const env = await signEnvelope({
        message: {
          id: msgId,
          type: msgType,
          from: agentDid,
          to: [params.to],
          thid,
          body: messageBody,
        },
        signerDid: agentDid,
        privateKey,
      });
      const peerHost = params.to.replace(/^did:web:/, '');
      const url = `${gatewayHttp}/didcomm?target=${encodeURIComponent(peerHost)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/didcomm-signed+json' },
        body: env.compact,
      });
      const text = await res.text().catch(() => '');
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      ph.capture({
        distinctId: agentDid,
        event: 'message_sent',
        properties: {
          agent_did: agentDid,
          peer_did: params.to,
          connection_id: params.connectionId ?? null,
          has_action: !!params.action,
          msg_type: msgType,
          gateway_status: res.status,
          ok: res.ok,
        },
      });
      return {
        msgId,
        thid,
        gatewayResponse: {
          ok: res.ok,
          status: res.status,
          body,
          ...(res.ok ? {} : { error: typeof body === 'object' && body && 'error' in body ? String((body as { error: unknown }).error) : `http_${res.status}` }),
        },
      };
    },
    awaitReply(thid, timeoutMs = 30_000) {
      return new Promise<AwaitReplyResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(thid);
          reject(new Error(`awaitReply(${thid}): timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        timer.unref?.();
        pending.set(thid, { resolve, reject, timer });
      });
    },
    async listPeerConnections(): Promise<PeerConnectionInfo[]> {
      const bearer = await signBearerToken(agentDid, privateKey, Date.now());
      const url = `${gatewayHttp}/agent-connections?did=${encodeURIComponent(agentDid)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${bearer}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`listPeerConnections: ${res.status} ${text}`);
      }
      const body = (await res.json()) as {
        connections: Array<{
          connection_id: string;
          peer_did: string;
          status: string;
          purpose: string | null;
          scope_selections: Array<{ id: string; params?: Record<string, unknown> }>;
          expires_at: string | null;
        }>;
      };
      return body.connections.map((c) => ({
        connectionId: c.connection_id,
        peerDid: c.peer_did,
        status: c.status,
        purpose: c.purpose,
        scopeSelections: c.scope_selections,
        expiresAt: c.expires_at,
      }));
    },
  };
}

async function handleInbound(
  input: InboundMessage,
  adapter: Adapter,
  client: CloudClientHandle,
  agentDid: string,
  privateKey: Uint8Array,
  pending: Map<string, PendingReply>,
  ph: PostHog,
): Promise<void> {
  if (input.decision !== 'allow') {
    // eslint-disable-next-line no-console
    console.log(`[bridge] PDP denied inbound from ${input.peerDid ?? 'unknown'}`);
    return;
  }

  const decoded = decodeEnvelopePayload(input.envelope);
  if (!decoded) {
    // eslint-disable-next-line no-console
    console.warn('[bridge] could not decode inbound envelope payload');
    return;
  }

  const peerDid = input.peerDid ?? decoded.from ?? 'unknown';
  const thid = decoded.thid ?? decoded.id ?? null;
  const text =
    typeof decoded.body?.['text'] === 'string'
      ? (decoded.body['text'] as string)
      : JSON.stringify(decoded.body ?? {});
  const msgType = decoded.type ?? input.msgType ?? '';
  const isResponse = msgType.endsWith('/response') || msgType.endsWith('.response');

  // ---- intercept replies to outbound sends -------------------------------
  if (thid && pending.has(thid)) {
    const p = pending.get(thid)!;
    pending.delete(thid);
    clearTimeout(p.timer);
    p.resolve({ thid, peerDid, text, body: decoded.body ?? {} });
    // eslint-disable-next-line no-console
    console.log(`[bridge] ← ${peerDid}: ${truncate(text, 80)}  (matched awaitReply)`);
    return;
  }

  // ---- responses are NOT requests --------------------------------------
  // A message of type `/response` is an answer to a previous request the
  // adapter generated. Do NOT feed it back through adapter.ask() — that
  // would generate ANOTHER reply, the peer would generate ANOTHER reply,
  // and the two agents would ping-pong forever. The conversation needs
  // a human/CLI on at least one end to terminate naturally.
  if (isResponse) {
    // eslint-disable-next-line no-console
    console.log(`[bridge] ← ${peerDid}: ${truncate(text, 80)}  (response, no auto-reply)`);
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[bridge] ← ${peerDid}: ${truncate(text, 80)}`);

  let reply: string;
  try {
    reply = await adapter.ask({
      peerDid,
      thid,
      connectionId: input.connectionId,
      text,
      body: decoded.body ?? {},
      obligations: input.obligations,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[bridge] adapter ${adapter.name} failed:`, (err as Error).message);
    throw err; // no ack → cloud requeues for redelivery
  }

  if (!reply || reply.trim().length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[bridge] adapter returned empty reply; ack-ing without sending response');
    return;
  }

  ph.capture({
    distinctId: agentDid,
    event: 'inbound_message_handled',
    properties: {
      agent_did: agentDid,
      peer_did: peerDid,
      connection_id: input.connectionId ?? null,
      adapter: adapter.name,
      msg_type: decoded.type ?? '',
    },
  });

  // eslint-disable-next-line no-console
  console.log(`[bridge] → ${peerDid}: ${truncate(reply, 80)}`);

  const msgId = randomUUID();
  const env = await signEnvelope({
    message: {
      id: msgId,
      type: 'https://didcomm.org/arp/1.0/response',
      from: agentDid,
      to: [peerDid],
      thid: thid ?? msgId,
      body: { text: reply },
    },
    signerDid: agentDid,
    privateKey,
  });
  await client.sendOutboundEnvelope({
    msgId,
    msgType: 'https://didcomm.org/arp/1.0/response',
    peerDid,
    envelope: env.compact,
    connectionId: input.connectionId,
  });
}

function decodeEnvelopePayload(compact: string): {
  id?: string;
  type?: string;
  from?: string;
  thid?: string;
  body?: Record<string, unknown>;
} | null {
  const parts = compact.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = base64urlDecode(parts[1]!);
    return JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '…';
}
