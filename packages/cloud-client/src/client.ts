/**
 * CloudClient — thin bridge between cloud.arp.run and a locally-running ARP
 * agent process.
 *
 * Responsibilities:
 *   1. Open a WebSocket to wss://cloud.arp.run/ws with a signed bearer token.
 *   2. Receive `inbound_message` events, POST each to the local agent's
 *      HTTP endpoint, ack the cloud once the local delivery succeeds.
 *   3. Rotate the bearer token hourly — the cloud's ws auth tolerates 300s
 *      clock skew, so we reconnect every 55 min to be safe.
 *   4. Exponential backoff reconnect on any drop: 1s, 2s, 4s, 8s, …, 60s.
 *      On reconnect the cloud will redeliver any queued messages and the
 *      state machine resumes without message loss.
 *
 * Policy on message loss during reconnect:
 *   - The cloud keeps queued status until the client's `ack` arrives.
 *   - If the client disconnects mid-send, no ack, message stays queued.
 *   - On reconnect, `server_hello` triggers a `drainQueue` server-side,
 *     which re-sends every queued row.
 *   - Duplicate detection is the responsibility of the local agent
 *     (idempotent on `msgId`). The cloud does not dedup across sessions.
 *
 * Budget: entire module ≤ 300 LOC including types.
 */

import { WebSocket as WsWebSocket } from 'ws';
import { signBearerToken } from './auth.js';
import type {
  CloudClientConfig,
  CloudClientHandle,
  CloudClientState,
  WebSocketInstance,
  WebSocketLike,
} from './types.js';

interface InboundEvent {
  kind: 'inbound_message';
  messageId: string;
  msgId: string;
  msgType: string;
  envelope: string;
  connectionId: string | null;
  peerDid: string | null;
  decision: 'allow' | 'deny';
  obligations: Array<{ type: string; params: Record<string, unknown> }>;
  policiesFired: string[];
}

type ServerEvent =
  | InboundEvent
  | { kind: 'server_hello'; agentDid: string; serverTime: number; queuedCount: number }
  | { kind: 'ping'; nonce: string }
  | { kind: 'revocation'; connectionId: string; reason: string };

const TOKEN_ROTATE_MS = 55 * 60 * 1000; // 55 minutes

export function createCloudClient(config: CloudClientConfig): CloudClientHandle {
  const WS: WebSocketLike =
    config.webSocketCtor ?? (WsWebSocket as unknown as WebSocketLike);
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const now = config.now ?? (() => Date.now());
  const maxBackoff = config.maxBackoffMs ?? 60_000;
  const initialBackoff = config.initialBackoffMs ?? 1_000;

  let state: CloudClientState = 'initial';
  let ws: WebSocketInstance | null = null;
  let stopRequested = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let tokenTimer: ReturnType<typeof setTimeout> | null = null;

  function setState(s: CloudClientState) {
    if (state === s) return;
    state = s;
    try {
      config.onStateChange?.(s);
    } catch {
      /* ignore */
    }
  }

  function backoffMs(): number {
    const attempt = Math.max(0, reconnectAttempts);
    const base = initialBackoff * 2 ** Math.min(attempt, 10);
    return Math.min(base, maxBackoff);
  }

  async function connect(): Promise<void> {
    if (stopRequested) return;
    setState('connecting');
    let bearer: string;
    try {
      bearer = await signBearerToken(config.agentDid, config.agentPrivateKey, now());
    } catch (err) {
      handleError(err as Error);
      scheduleReconnect();
      return;
    }
    const url = `${config.cloudWsUrl}?did=${encodeURIComponent(config.agentDid)}&token=${encodeURIComponent(
      bearer,
    )}`;
    let sock: WebSocketInstance;
    try {
      sock = new WS(url);
    } catch (err) {
      handleError(err as Error);
      scheduleReconnect();
      return;
    }
    ws = sock;
    sock.onopen = () => {
      setState('connected');
      reconnectAttempts = 0;
      try {
        sock.send(
          JSON.stringify({
            kind: 'client_hello',
            agentDid: config.agentDid,
            clientVersion: config.clientVersion ?? '0.1.0',
          }),
        );
      } catch (err) {
        handleError(err as Error);
      }
      // Rotate token on schedule.
      if (tokenTimer) clearTimeout(tokenTimer);
      tokenTimer = setTimeout(() => {
        // Closing triggers reconnect with a fresh token.
        try {
          sock.close(4001, 'token_rotation');
        } catch {
          /* ignore */
        }
      }, TOKEN_ROTATE_MS);
      tokenTimer.unref?.();
    };
    sock.onmessage = (ev) => {
      const raw = typeof ev.data === 'string' ? ev.data : ev.data instanceof Buffer ? ev.data.toString('utf8') : '';
      if (!raw) return;
      let event: ServerEvent;
      try {
        event = JSON.parse(raw) as ServerEvent;
      } catch (err) {
        handleError(err as Error);
        return;
      }
      if (event.kind === 'inbound_message') {
        void handleInbound(sock, event);
      } else if (event.kind === 'ping') {
        try {
          sock.send(JSON.stringify({ kind: 'pong', nonce: event.nonce }));
        } catch (err) {
          handleError(err as Error);
        }
      } else if (event.kind === 'revocation') {
        // Surface through error hook; agents can subscribe to revocation via
        // their own channels — the cloud client just relays.
        handleError(
          new Error(`revocation ${event.connectionId}: ${event.reason}`),
        );
      } else if (event.kind === 'server_hello') {
        // nothing to do; informational
      }
    };
    sock.onerror = (ev) => {
      handleError(new Error(`ws error ${String(ev)}`));
    };
    sock.onclose = () => {
      setState('disconnected');
      if (tokenTimer) {
        clearTimeout(tokenTimer);
        tokenTimer = null;
      }
      ws = null;
      if (!stopRequested) {
        scheduleReconnect();
      }
    };
  }

  async function handleInbound(sock: WebSocketInstance, ev: InboundEvent): Promise<void> {
    try {
      const res = await fetchImpl(`${config.agentApiUrl}/didcomm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/didcomm-signed+json',
          'X-Arp-Cloud-Msg-Id': ev.msgId,
          ...(ev.peerDid ? { 'X-Arp-Peer-Did': ev.peerDid } : {}),
          ...(ev.connectionId ? { 'X-Arp-Connection-Id': ev.connectionId } : {}),
        },
        body: ev.envelope,
      });
      if (!res.ok) {
        throw new Error(`local agent responded ${res.status}`);
      }
      // Successful local delivery → ack the cloud so it can mark the
      // message delivered.
      sock.send(JSON.stringify({ kind: 'ack', messageId: ev.messageId }));
      config.onInboundDelivered?.(ev.messageId, ev.msgId);
    } catch (err) {
      handleError(err as Error);
      // Deliberately no ack; the cloud times out after 30s and keeps the
      // message queued for redelivery.
    }
  }

  function scheduleReconnect(): void {
    if (stopRequested) return;
    const delay = backoffMs();
    reconnectAttempts += 1;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
    reconnectTimer.unref?.();
  }

  function handleError(err: Error): void {
    try {
      config.onError?.(err);
    } catch {
      /* ignore */
    }
  }

  // Kick off.
  void connect();

  return {
    state: () => state,
    reconnectAttempts: () => reconnectAttempts,
    async stop() {
      stopRequested = true;
      setState('stopped');
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (tokenTimer) {
        clearTimeout(tokenTimer);
        tokenTimer = null;
      }
      const sock = ws;
      ws = null;
      if (sock) {
        try {
          sock.close(1000, 'client_stop');
        } catch {
          /* ignore */
        }
      }
    },
    async sendOutboundEnvelope(params) {
      const sock = ws;
      if (!sock || state !== 'connected') {
        throw new Error('not_connected');
      }
      sock.send(
        JSON.stringify({
          kind: 'outbound_envelope',
          msgId: params.msgId,
          msgType: params.msgType,
          peerDid: params.peerDid,
          envelope: params.envelope,
          connectionId: params.connectionId ?? null,
        }),
      );
    },
  };
}
