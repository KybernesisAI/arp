/**
 * Supervisor ↔ CLI IPC.
 *
 * The supervisor binds a localhost HTTP server on a random port at
 * boot. Port + auth token are written to `~/.arp/control.json` so the
 * `arpc` CLI in any other process can find the running supervisor and
 * call into it for outbound sends, agent listings, etc.
 *
 * Endpoints (all on 127.0.0.1):
 *
 *   GET  /health
 *     → { ok, agents: number, version }
 *
 *   GET  /agents
 *     → { agents: [{ root, agentDid, gatewayWsUrl }, ...] }
 *
 *   POST /send
 *     Body: { from: <did>, to: <did>, text: <string>,
 *             connectionId?: <id>, syncTimeoutMs?: number }
 *     → { msgId, thid, gatewayResponse,
 *         reply?: { peerDid, text } | { error, code } }
 *     If syncTimeoutMs > 0, blocks up to that long for a peer reply
 *     (matched by thid). If 0, returns immediately after gateway accept.
 *
 * Auth: every request must include an `x-arp-control-token` header
 * matching the value in control.json. The control file is mode 0600
 * (only the user can read it). This is defense in depth — the server
 * binds 127.0.0.1 only, so cross-host attackers can't reach it; the
 * token blocks malicious local processes from hitting /send without
 * read access to the user's home directory.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { BridgeHandle } from '@kybernesis/arp-cloud-bridge';

export interface ControlFile {
  port: number;
  token: string;
  pid: number;
  startedAt: number;
}

export function controlFilePath(): string {
  return join(homedir(), '.arp', 'control.json');
}

export function readControlFile(): ControlFile | null {
  const p = controlFilePath();
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw) as ControlFile;
    if (typeof parsed.port !== 'number' || typeof parsed.token !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface SupervisedRef {
  /** Folder the supervisor is watching. */
  root: string;
  /** The currently-running bridge for that agent (null when starting/stopped). */
  bridge: BridgeHandle | null;
}

export interface IpcServerOptions {
  /** Source-of-truth list the supervisor maintains. We read it on each request. */
  getSupervised: () => SupervisedRef[];
  /** Package version so /health can report it. */
  version: string;
}

export interface IpcServerHandle {
  port: number;
  token: string;
  close(): Promise<void>;
}

export async function startIpcServer(opts: IpcServerOptions): Promise<IpcServerHandle> {
  const token = randomBytes(24).toString('base64url');
  const server = createServer((req, res) => {
    void handle(req, res, token, opts);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr && 'port' in addr ? addr.port : 0;

  // Write control file (0600).
  const cf: ControlFile = { port, token, pid: process.pid, startedAt: Date.now() };
  const cp = controlFilePath();
  mkdirSync(dirname(cp), { recursive: true });
  writeFileSync(cp, JSON.stringify(cf, null, 2) + '\n', 'utf-8');
  try {
    chmodSync(cp, 0o600);
  } catch {
    /* ignore on platforms without chmod */
  }

  return {
    port,
    token,
    async close() {
      try {
        unlinkSync(cp);
      } catch {
        /* ignore */
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  token: string,
  opts: IpcServerOptions,
): Promise<void> {
  const url = req.url ?? '/';
  if (req.method === 'GET' && url === '/health') {
    return json(res, 200, {
      ok: true,
      agents: opts.getSupervised().length,
      version: opts.version,
    });
  }

  // Token-protected from here.
  const provided = req.headers['x-arp-control-token'];
  if (typeof provided !== 'string' || provided !== token) {
    return json(res, 401, { error: 'unauthorised' });
  }

  if (req.method === 'GET' && url === '/agents') {
    const supervised = opts.getSupervised();
    return json(res, 200, {
      agents: supervised.map((s) => ({
        root: s.root,
        agentDid: s.bridge?.agentDid ?? null,
        gatewayWsUrl: s.bridge?.gatewayWsUrl ?? null,
      })),
    });
  }

  if (req.method === 'POST' && url === '/send') {
    return handleSend(req, res, opts);
  }

  json(res, 404, { error: 'not_found' });
}

interface SendRequest {
  from: string;
  to: string;
  text: string;
  connectionId?: string | null;
  /** Wait up to this many ms for a peer reply matched by thid. 0 → fire-and-forget. */
  syncTimeoutMs?: number;
  // ── Phase B/C — structured ARP action ────────────────────────────
  /** When set, the envelope body carries action + params instead of
   *  pure text. Audience adapter dispatches to /api/arp/<action>. */
  action?: string;
  /** Action-specific params merged into the envelope body (e.g.,
   *  collection_id + query for notes.search). */
  params?: Record<string, unknown>;
  /** Optional Cedar resource entity. Defaults are inferred per
   *  action when omitted. */
  resource?: { type: string; id: string; attrs?: Record<string, unknown> };
}

async function handleSend(req: IncomingMessage, res: ServerResponse, opts: IpcServerOptions): Promise<void> {
  let body: SendRequest;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw) as SendRequest;
  } catch (err) {
    return json(res, 400, { error: 'bad_json', detail: (err as Error).message });
  }
  if (!body.from || !body.to || typeof body.text !== 'string') {
    return json(res, 400, { error: 'missing_fields', need: ['from', 'to', 'text'] });
  }

  const supervised = opts.getSupervised().find((s) => s.bridge?.agentDid === body.from);
  if (!supervised || !supervised.bridge) {
    return json(res, 404, {
      error: 'sender_not_supervised',
      detail: `no running bridge for ${body.from}. Did you arpc host add the right folder?`,
    });
  }
  const bridge = supervised.bridge;

  let send;
  try {
    send = await bridge.sendOutbound({
      to: body.to,
      text: body.text,
      ...(body.connectionId ? { connectionId: body.connectionId } : {}),
      ...(body.action ? { action: body.action } : {}),
      ...(body.params ? { params: body.params } : {}),
      ...(body.resource ? { resource: body.resource } : {}),
    });
  } catch (err) {
    return json(res, 500, { error: 'send_failed', detail: (err as Error).message });
  }

  if (!send.gatewayResponse.ok) {
    return json(res, 502, {
      msgId: send.msgId,
      thid: send.thid,
      gatewayResponse: send.gatewayResponse,
      error: 'gateway_rejected',
    });
  }

  // Cloud accepted the message but PDP denied at the audience side.
  // Don't enter awaitReply — there's no reply coming, the audience never
  // saw the request. Surface the deny immediately so the CLI prints a
  // clear "policy_denied" instead of timing out.
  const gwBody = send.gatewayResponse.body as
    | { decision?: 'allow' | 'deny'; reason?: string }
    | null
    | undefined;
  if (gwBody && gwBody.decision === 'deny') {
    return json(res, 403, {
      msgId: send.msgId,
      thid: send.thid,
      gatewayResponse: send.gatewayResponse,
      error: 'denied',
      reason: gwBody.reason ?? 'policy_denied',
    });
  }

  const timeoutMs = body.syncTimeoutMs ?? 30_000;
  if (timeoutMs <= 0) {
    return json(res, 202, { msgId: send.msgId, thid: send.thid, gatewayResponse: send.gatewayResponse });
  }

  try {
    const reply = await bridge.awaitReply(send.thid, timeoutMs);
    return json(res, 200, {
      msgId: send.msgId,
      thid: send.thid,
      gatewayResponse: send.gatewayResponse,
      reply: { peerDid: reply.peerDid, text: reply.text },
    });
  } catch (err) {
    return json(res, 504, {
      msgId: send.msgId,
      thid: send.thid,
      gatewayResponse: send.gatewayResponse,
      error: 'reply_timeout',
      detail: (err as Error).message,
    });
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.setEncoding('utf-8');
    req.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > 1_000_000) {
        req.destroy();
        reject(new Error('body too large'));
      }
    });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Re-export for tests that need to bypass the file-based discovery
export type { Server };
