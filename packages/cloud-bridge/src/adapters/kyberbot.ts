/**
 * KyberBot adapter — calls the kyberbot agent's existing
 * `POST /api/web/chat` SSE endpoint (the same one the web UI uses).
 * Reads server.port from identity.yaml + KYBERBOT_API_TOKEN from .env
 * automatically when given the agent's root folder.
 *
 * Wire format (kyberbot side, unchanged):
 *   POST {KYBERBOT_URL}/api/web/chat
 *   Authorization: Bearer {KYBERBOT_API_TOKEN}
 *   Body: { prompt: string, sessionId?: string }
 *   Response: text/event-stream
 *     event: init        data: { sessionId, model }
 *     event: text        data: { delta }
 *     event: tool_use    data: { label, detail }
 *     event: complete    data: { fullResponse }
 *     event: error       data: { message }
 *
 * We accumulate text deltas and return the full assistant response.
 * The same `sessionId` per peer DID gives kyberbot proper per-peer
 * conversation history without us having to manage state.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, isAbsolute, resolve as resolvePath } from 'node:path';
import yaml from 'js-yaml';
import type { Adapter, InboundContext } from '../types.js';

export interface KyberBotAdapterOptions {
  /** Path to the agent home folder (e.g. /Users/ianborders/atlas). */
  root: string;
  /**
   * Override base URL. Defaults to `http://127.0.0.1:<server.port>` from
   * identity.yaml. Set explicitly when the agent is running on a remote
   * host or port.
   */
  baseUrl?: string;
  /**
   * Override API token. Defaults to `KYBERBOT_API_TOKEN` parsed from
   * `<root>/.env`. The kyberbot brain endpoints are auth-protected; we
   * need a valid token or every request 401s.
   */
  apiToken?: string;
  /** Per-request timeout in ms. Defaults to 5 minutes. */
  timeoutMs?: number;
}

interface IdentityConfig {
  agent_name?: string;
  server?: { port?: number };
}

export function createKyberBotAdapter(opts: KyberBotAdapterOptions): Adapter {
  const root = isAbsolute(opts.root) ? opts.root : resolvePath(process.cwd(), opts.root);
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;

  let baseUrl = opts.baseUrl ?? null;
  let apiToken = opts.apiToken ?? null;
  let agentName = 'kyberbot-agent';

  return {
    name: 'kyberbot',
    async init() {
      // Resolve base URL from identity.yaml if not given
      if (!baseUrl) {
        const identityPath = join(root, 'identity.yaml');
        if (!existsSync(identityPath)) {
          throw new Error(`KyberBot adapter: ${identityPath} not found`);
        }
        const identity = yaml.load(readFileSync(identityPath, 'utf-8')) as IdentityConfig;
        const port = identity?.server?.port ?? 3456;
        baseUrl = `http://127.0.0.1:${port}`;
        agentName = identity?.agent_name ?? agentName;
      }

      // Resolve API token from .env if not given
      if (!apiToken) {
        const envPath = join(root, '.env');
        if (!existsSync(envPath)) {
          throw new Error(`KyberBot adapter: ${envPath} not found and no apiToken supplied`);
        }
        const env = parseDotenv(readFileSync(envPath, 'utf-8'));
        apiToken = env['KYBERBOT_API_TOKEN'] ?? null;
        if (!apiToken) {
          throw new Error(
            `KyberBot adapter: KYBERBOT_API_TOKEN not found in ${envPath}. ` +
              `KyberBot's chat endpoint is auth-protected; the bridge needs the token to call it.`,
          );
        }
      }

      // eslint-disable-next-line no-console
      console.log(`[bridge] kyberbot adapter ready · root=${root} · base=${baseUrl} · agent=${agentName}`);

      // Sanity ping the health endpoint — fail fast if the agent isn't up
      try {
        const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) {
          throw new Error(`health check responded ${res.status}`);
        }
      } catch (err) {
        throw new Error(
          `KyberBot adapter: ${baseUrl}/health unreachable — is the agent running? ` +
            `Start it with \`cd ${root} && kyberbot\`. Underlying: ${(err as Error).message}`,
        );
      }
    },

    async ask(ctx: InboundContext): Promise<string> {
      if (!baseUrl || !apiToken) {
        throw new Error('KyberBot adapter not initialised; call init() first');
      }

      // ── Phase B/C — typed action dispatch ──────────────────────────
      // When the inbound carries a structured `action` (e.g. notes.search,
      // knowledge.query), route to /api/arp/<action> instead of the
      // free-form chat endpoint. KyberBot's typed handler filters by
      // project_id at the data layer + applies obligations as code, so
      // policy enforcement stops being LLM-prompted ("please comply")
      // and becomes deterministic.
      const action = typeof ctx.body?.['action'] === 'string' ? (ctx.body['action'] as string) : null;
      if (action && isTypedArpAction(action)) {
        return await callTypedArp({
          baseUrl,
          apiToken,
          action,
          body: ctx.body!,
          obligations: ctx.obligations,
          connectionId: ctx.connectionId,
          peerDid: ctx.peerDid,
          timeoutMs,
        });
      }

      // ── Free-form chat fall-through ────────────────────────────────
      // Plain-text messages (action=relay_to_principal or unset) still
      // go through /api/web/chat. We augment the prompt with connection
      // context so the LLM knows who's asking + what scopes apply, but
      // obligations honored by the LLM are best-effort. For
      // deterministic enforcement, callers should use typed actions.
      const sessionId = ctx.connectionId
        ? `arp:${ctx.peerDid}:${ctx.connectionId}`
        : `arp:${ctx.peerDid}`;
      const promptWithContext = augmentPromptWithConnectionContext(ctx);
      const body = JSON.stringify({ prompt: promptWithContext, sessionId });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);

      try {
        const res = await fetch(`${baseUrl}/api/web/chat`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiToken}`,
            accept: 'text/event-stream',
          },
          body,
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => '<no body>');
          throw new Error(`kyberbot /api/web/chat ${res.status}: ${detail}`);
        }
        return await consumeSSE(res.body);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Drain the SSE stream and accumulate the assistant's text.
 *
 * KyberBot's chat-sse handler emits, in order: `init`, then any
 * combination of `text` (full text blocks — `{ text }`), `status`,
 * `tool_start`, `tool_end`, and finally `result` (`{ usage, costUsd,
 * summary }`). The `summary` from the result event is the canonical
 * final response — it concatenates every text block + handles
 * trimming. We prefer it; falling back to summing the text events if
 * the stream ended before result fired.
 */
async function consumeSSE(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buffer = '';
  const textBlocks: string[] = [];
  let summary: string | null = null;
  let errorMessage: string | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const ev = parseSSEChunk(chunk);
      if (!ev) continue;
      if (ev.event === 'text') {
        const t = (ev.data as { text?: string })?.text;
        if (typeof t === 'string' && t.length > 0) textBlocks.push(t);
      } else if (ev.event === 'result') {
        const s = (ev.data as { summary?: string })?.summary;
        if (typeof s === 'string') summary = s;
      } else if (ev.event === 'error') {
        errorMessage = (ev.data as { message?: string })?.message ?? 'unknown error';
      }
    }
  }

  if (errorMessage) {
    throw new Error(`kyberbot stream error: ${errorMessage}`);
  }
  return summary ?? textBlocks.join('\n\n').trim();
}

function parseSSEChunk(chunk: string): { event: string; data: unknown } | null {
  const lines = chunk.split('\n');
  let event = 'message';
  const dataParts: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataParts.push(line.slice(5).trim());
  }
  if (dataParts.length === 0) return null;
  const raw = dataParts.join('\n');
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}

// ── Phase B/C — typed ARP action dispatch ───────────────────────────────

/**
 * Allowlist of structured actions kyberbot's /api/arp/* surface
 * implements. Anything not in this list falls through to the
 * free-form chat path even if `action` is set, so a peer asking for
 * a future action that hasn't shipped yet doesn't 400 — it just gets
 * a polite LLM-mediated response.
 *
 * Keep in sync with packages/cli/src/server/arp/router.ts and
 * @kybernesis/arp-scope-catalog. The router exposes a /health
 * endpoint that lists currently-mounted actions; consumers SHOULD
 * probe that at startup rather than hard-coding this list. For now
 * it's static + matches PR-AC-3 (PR-AC-4 will expand).
 */
const TYPED_ARP_ACTIONS = new Set<string>([
  'notes.search',
  'notes.read',
  'knowledge.query',
]);

function isTypedArpAction(action: string): boolean {
  return TYPED_ARP_ACTIONS.has(action);
}

interface CallTypedArpInput {
  baseUrl: string;
  apiToken: string;
  action: string;
  body: Record<string, unknown>;
  obligations?: Array<{ type: string; params: Record<string, unknown> }>;
  connectionId: string | null;
  peerDid: string;
  timeoutMs: number;
}

/**
 * POST /api/arp/<action> on the local kyberbot. Forwards the inbound
 * body + obligations + connection_id (which kyberbot uses for rate-
 * limit scoping + audit attribution). Returns the JSON response
 * stringified — the bridge ships that as the reply text in the
 * outbound DIDComm envelope back to the peer.
 *
 * Errors propagate as exceptions; the bridge's outer try/catch logs
 * + the cloud requeues per the existing protocol (better than
 * shipping a malformed reply).
 */
async function callTypedArp(input: CallTypedArpInput): Promise<string> {
  const { baseUrl, apiToken, action, body, obligations, connectionId, peerDid, timeoutMs } = input;

  // Build the request payload our server-side handler expects. The
  // handler validates required fields (connection_id, action params)
  // and returns 4xx on missing inputs — that 4xx becomes an error
  // string the LLM-mediated peer can interpret on the other end.
  const payload: Record<string, unknown> = {
    ...body,
    connection_id: connectionId ?? '',
    source_did: peerDid,
    obligations: obligations ?? [],
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/arp/${action}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      // Bubble the structured error through to the peer; the JSON
      // body already has shape { ok: false, error, reason }.
      return text || JSON.stringify({ ok: false, error: 'internal', status: res.status });
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Augment a free-form chat prompt with connection context so the LLM
 * has the social signal it needs (who's asking, on what connection)
 * to compose a useful reply. Doesn't try to prompt-enforce
 * obligations — those should use the typed surface; this is just a
 * courtesy nudge for the chat fall-through.
 */
function augmentPromptWithConnectionContext(ctx: InboundContext): string {
  const lines: string[] = [];
  if (ctx.connectionId) {
    lines.push(`[ARP context: peer=${ctx.peerDid}, connection=${ctx.connectionId}]`);
  } else {
    lines.push(`[ARP context: peer=${ctx.peerDid}]`);
  }
  if (ctx.obligations && ctx.obligations.length > 0) {
    const obligationNames = ctx.obligations.map((o) => o.type).join(', ');
    lines.push(`[Obligations the cloud attached: ${obligationNames}]`);
  }
  lines.push('');
  lines.push(ctx.text);
  return lines.join('\n');
}

function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}
