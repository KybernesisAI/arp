/**
 * Generic HTTP adapter — for any framework that exposes a single
 * "give me a reply for this prompt" HTTP endpoint. Useful as a
 * universal fallback when no framework-specific adapter exists yet
 * (OpenClaw, Hermes, custom rigs).
 *
 * Wire format expected by the agent:
 *   POST {url}
 *   Authorization: Bearer {token}    (optional, only if --token set)
 *   Body: { prompt: string, peerDid: string, thid: string|null, sessionId: string }
 *   Response: { reply: string }      OR plain text body
 *
 * If the framework you're integrating doesn't have anything HTTP-shaped
 * out of the box, you write a 30-line wrapper around its existing
 * "ask" function and expose it on a localhost port. That wrapper IS the
 * adapter — and it lives entirely outside our codebase, in your project.
 */

import type { Adapter, InboundContext } from '../types.js';

export interface GenericHttpAdapterOptions {
  /** Endpoint URL the bridge should POST to. */
  url: string;
  /** Optional bearer token. Sent as `Authorization: Bearer <token>`. */
  token?: string;
  /** Per-request timeout in ms. Defaults to 5 minutes. */
  timeoutMs?: number;
}

export function createGenericHttpAdapter(opts: GenericHttpAdapterOptions): Adapter {
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;

  return {
    name: 'generic-http',

    async init() {
      try {
        new URL(opts.url);
      } catch {
        throw new Error(`generic-http adapter: invalid URL ${opts.url}`);
      }
    },

    async ask(ctx: InboundContext): Promise<string> {
      const sessionId = `arp:${ctx.peerDid}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(opts.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
          },
          body: JSON.stringify({
            prompt: ctx.text,
            peerDid: ctx.peerDid,
            thid: ctx.thid,
            sessionId,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '<no body>');
          throw new Error(`${opts.url} responded ${res.status}: ${detail}`);
        }
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('application/json')) {
          const body = (await res.json()) as { reply?: string };
          if (typeof body.reply !== 'string') {
            throw new Error(`${opts.url} JSON response missing { reply: string }`);
          }
          return body.reply;
        }
        return await res.text();
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
