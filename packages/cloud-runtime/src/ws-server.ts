/**
 * WebSocket server for outbound clients.
 *
 * Wire protocol:
 *   1. Client connects to `/ws?did=<agent-did>&token=<bearer>`
 *      Bearer token is a short-lived signature over
 *      `sha256("arp-cloud-ws:" + agentDid + ":" + timestamp)` signed with
 *      the agent's ed25519 private key. The cloud verifies using the
 *      agent's public_key_multibase on record. Timestamp skew tolerance:
 *      300s.
 *   2. Cloud replies with `server_hello` containing queued message count.
 *   3. Cloud streams `inbound_message` events; client acks via `ack`.
 *   4. Client sends `outbound_envelope` events when the local agent replies;
 *      cloud verifies via agent's public key, persists + forwards.
 *
 * Reconnect logic lives client-side (@kybernesis/arp-cloud-client). The
 * server is stateless: each successful auth creates a new session.
 */

import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import * as ed25519 from '@noble/ed25519';
import { multibaseEd25519ToRaw } from '@kybernesis/arp-transport';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import { agents } from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';
import type { SessionRegistry } from './sessions.js';
import type { AgentSessionHandle, CloudRuntimeLogger, WsClientEvent, WsServerEvent } from './types.js';
import { drainQueue } from './dispatch.js';

export interface WsAuthResult {
  ok: true;
  agentDid: string;
  tenantId: string;
}

export interface WsAuthFailure {
  ok: false;
  status: number;
  reason: string;
}

export interface CloudWsServerOptions {
  db: CloudDbClient;
  sessions: SessionRegistry;
  logger: CloudRuntimeLogger;
  /** Seconds of clock skew tolerance for token timestamps. Default 300. */
  tokenSkewSec?: number;
  /** Called on every inbound `outbound_envelope` event. */
  onOutboundEnvelope?: (params: {
    tenantId: string;
    agentDid: string;
    event: Extract<WsClientEvent, { kind: 'outbound_envelope' }>;
  }) => Promise<void>;
  /** Optional clock injection (tests). */
  now?: () => number;
}

export interface CloudWsServer {
  /** Attach to an existing HTTP server's `upgrade` event. */
  attach(server: HttpServer): void;
  /** Standalone server (tests). Returns the chosen port. */
  listen(port: number): Promise<{ port: number }>;
  /** Authenticate a bearer token out-of-band (testkit, debug). */
  authenticate(agentDid: string, bearer: string): Promise<WsAuthResult | WsAuthFailure>;
  /** Close the WS server + all sessions. */
  close(): Promise<void>;
}

export function createCloudWsServer(opts: CloudWsServerOptions): CloudWsServer {
  const { db, sessions, logger } = opts;
  const now = opts.now ?? (() => Date.now());
  const skewSec = opts.tokenSkewSec ?? 300;

  let wss: WebSocketServer | null = null;
  let httpServer: HttpServer | null = null;
  let ownsHttpServer = false;

  async function authenticate(
    agentDid: string,
    bearer: string,
  ): Promise<WsAuthResult | WsAuthFailure> {
    const rows = await db.select().from(agents).where(eq(agents.did, agentDid)).limit(1);
    const agentRow = rows[0];
    if (!agentRow) return { ok: false, status: 401, reason: 'unknown_agent' };
    const parts = bearer.split('.');
    if (parts.length !== 2) return { ok: false, status: 401, reason: 'bad_bearer_shape' };
    const [tsStr, sigB64] = parts as [string, string];
    const ts = Number(tsStr);
    if (!Number.isFinite(ts)) return { ok: false, status: 401, reason: 'bad_bearer_ts' };
    const skewMs = Math.abs(now() - ts);
    if (skewMs > skewSec * 1000) return { ok: false, status: 401, reason: 'bearer_expired' };
    let publicKey: Uint8Array;
    try {
      publicKey = multibaseEd25519ToRaw(agentRow.publicKeyMultibase);
    } catch {
      return { ok: false, status: 500, reason: 'malformed_agent_key' };
    }
    const challenge = createHash('sha256')
      .update(`arp-cloud-ws:${agentDid}:${ts}`)
      .digest();
    const sig = Buffer.from(sigB64, 'base64url');
    const ok = await ed25519.verifyAsync(new Uint8Array(sig), new Uint8Array(challenge), publicKey);
    if (!ok) return { ok: false, status: 401, reason: 'bad_signature' };
    return { ok: true, agentDid, tenantId: agentRow.tenantId };
  }

  function buildWss(): WebSocketServer {
    const server = new WebSocketServer({ noServer: true });

    server.on('connection', (ws: WsWebSocket, auth: WsAuthResult) => {
      const sessionId = randomUUID();
      const openedAt = now();
      let closed = false;

      const pending = new Map<string, { resolve: () => void; reject: (err: Error) => void }>();

      const handle: AgentSessionHandle = {
        did: auth.agentDid,
        tenantId: auth.tenantId,
        sessionId,
        openedAt,
        isOpen: () => !closed && ws.readyState === ws.OPEN,
        async send(event) {
          if (closed || ws.readyState !== ws.OPEN) {
            throw new Error('session_closed');
          }
          // For inbound_message we wait for client ack keyed by messageId.
          if (event.kind === 'inbound_message') {
            return new Promise<void>((resolve, reject) => {
              pending.set(event.messageId, { resolve, reject });
              ws.send(JSON.stringify(event), (err) => {
                if (err) {
                  pending.delete(event.messageId);
                  reject(err);
                }
              });
              // 30s ack timeout.
              setTimeout(() => {
                const entry = pending.get(event.messageId);
                if (entry) {
                  pending.delete(event.messageId);
                  entry.reject(new Error('ack_timeout'));
                }
              }, 30_000).unref?.();
            });
          }
          return new Promise<void>((resolve, reject) => {
            ws.send(JSON.stringify(event), (err) => (err ? reject(err) : resolve()));
          });
        },
        async close(code = 1000, reason = 'server_close') {
          if (closed) return;
          closed = true;
          try {
            ws.close(code, reason);
          } catch {
            /* ignore */
          }
        },
      };

      sessions.add(handle);

      // Mark agent as currently live.
      void (async () => {
        const tenantDb = withTenant(db, toTenantId(auth.tenantId));
        await tenantDb.updateAgent(auth.agentDid, {
          wsSessionId: sessionId,
          lastSeenAt: new Date(openedAt),
        });
      })();

      // server_hello
      void (async () => {
        const tenantDb = withTenant(db, toTenantId(auth.tenantId));
        const queued = await tenantDb.claimQueuedMessages(auth.agentDid, 1);
        const count = queued.length;
        const hello: WsServerEvent = {
          kind: 'server_hello',
          agentDid: auth.agentDid,
          serverTime: openedAt,
          queuedCount: count,
        };
        try {
          await handle.send(hello);
        } catch {
          /* ignore */
        }
        await drainQueue({
          tenantDb,
          sessions,
          logger,
          agentDid: auth.agentDid,
          tenantId: auth.tenantId,
        });
      })();

      ws.on('message', async (raw: Buffer) => {
        let event: WsClientEvent;
        try {
          event = JSON.parse(raw.toString('utf8')) as WsClientEvent;
        } catch {
          logger.warn({ sessionId }, 'ws_bad_client_message');
          return;
        }
        if (event.kind === 'ack') {
          const entry = pending.get(event.messageId);
          if (entry) {
            pending.delete(event.messageId);
            entry.resolve();
          }
        } else if (event.kind === 'outbound_envelope') {
          try {
            await opts.onOutboundEnvelope?.({
              tenantId: auth.tenantId,
              agentDid: auth.agentDid,
              event,
            });
          } catch (err) {
            logger.warn({ err: (err as Error).message }, 'outbound_envelope_failed');
          }
        } else if (event.kind === 'pong') {
          // noop — pings used only for liveness; could record here.
        } else if (event.kind === 'client_hello') {
          logger.debug({ agentDid: event.agentDid, clientVersion: event.clientVersion }, 'client_hello');
        }
      });

      ws.on('close', () => {
        closed = true;
        sessions.remove(sessionId);
        for (const [k, entry] of pending) {
          entry.reject(new Error('session_closed'));
          pending.delete(k);
        }
        void (async () => {
          const tenantDb = withTenant(db, toTenantId(auth.tenantId));
          const row = await tenantDb.getAgent(auth.agentDid);
          if (row?.wsSessionId === sessionId) {
            await tenantDb.updateAgent(auth.agentDid, { wsSessionId: null });
          }
        })();
      });
    });
    return server;
  }

  async function parseAuthFromReq(req: IncomingMessage): Promise<WsAuthResult | WsAuthFailure> {
    const url = new URL(req.url ?? '/', 'http://placeholder');
    const agentDid = url.searchParams.get('did') ?? '';
    const bearer = url.searchParams.get('token') ?? req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    if (!agentDid || !bearer) return { ok: false, status: 401, reason: 'missing_credentials' };
    return authenticate(agentDid, bearer);
  }

  return {
    attach(server) {
      if (!wss) wss = buildWss();
      server.on('upgrade', async (req, socket, head) => {
        if (!req.url?.startsWith('/ws') && !req.url?.startsWith('/api/ws')) {
          return;
        }
        const auth = await parseAuthFromReq(req);
        if (!auth.ok) {
          socket.write(`HTTP/1.1 ${auth.status} Unauthorized\r\n\r\n`);
          socket.destroy();
          return;
        }
        wss!.handleUpgrade(req, socket, head, (ws) => {
          wss!.emit('connection', ws, auth);
        });
      });
    },
    async listen(port) {
      const http = await import('node:http');
      const server = http.createServer((_req, res) => {
        res.writeHead(426, { 'Content-Type': 'text/plain' });
        res.end('Upgrade Required');
      });
      if (!wss) wss = buildWss();
      server.on('upgrade', async (req, socket, head) => {
        const auth = await parseAuthFromReq(req);
        if (!auth.ok) {
          socket.write(`HTTP/1.1 ${auth.status} Unauthorized\r\n\r\n`);
          socket.destroy();
          return;
        }
        wss!.handleUpgrade(req, socket, head, (ws) => {
          wss!.emit('connection', ws, auth);
        });
      });
      httpServer = server;
      ownsHttpServer = true;
      await new Promise<void>((resolve) => server.listen(port, () => resolve()));
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      return { port: actualPort };
    },
    authenticate,
    async close() {
      // Broadcast a graceful shutdown event to every active client so
      // bridges close + reconnect immediately on the next container,
      // skipping their exponential backoff. Without this, Railway's
      // blue-green deploy leaves bridges pinned to the old TCP for
      // many seconds and dispatches during the gap go to
      // queued_no_session. Brief 200ms grace for the event to flush
      // before we force-close the server.
      if (wss) {
        const event: WsServerEvent = { kind: 'shutdown', reason: 'server_shutdown' };
        const payload = JSON.stringify(event);
        for (const client of wss.clients) {
          try {
            client.send(payload);
          } catch {
            /* socket already closing; ignore */
          }
        }
        await new Promise((r) => setTimeout(r, 200));
        await new Promise<void>((resolve) => wss!.close(() => resolve()));
        wss = null;
      }
      if (httpServer && ownsHttpServer) {
        await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
        httpServer = null;
      }
    },
  };
}

/**
 * Convenience: sign a bearer token for the given agent. Used by the
 * cloud-client. Exposed here so the test harness and the client share
 * the same implementation.
 */
export async function signBearerToken(agentDid: string, privateKey: Uint8Array, nowMs: number): Promise<string> {
  void agentDid;
  const challenge = createHash('sha256')
    .update(`arp-cloud-ws:${agentDid}:${nowMs}`)
    .digest();
  const sig = await ed25519.signAsync(new Uint8Array(challenge), privateKey);
  return `${nowMs}.${Buffer.from(sig).toString('base64url')}`;
}
