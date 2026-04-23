import type { ProbeContext } from './types.js';
import { withTimeout } from './timing.js';

export interface FetchJsonResult {
  ok: boolean;
  status: number;
  contentType: string | null;
  body: unknown;
  rawText: string;
}

export async function fetchJson(url: string, ctx: ProbeContext): Promise<FetchJsonResult> {
  const fetchImpl = ctx.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('no fetch implementation available');
  }
  const timeoutMs = ctx.timeoutMs ?? 10_000;
  const init: RequestInit = ctx.extraHeaders
    ? { headers: ctx.extraHeaders }
    : {};
  const res = await withTimeout(fetchImpl(url, init), timeoutMs, `GET ${url}`);
  const contentType = res.headers.get('content-type');
  const rawText = await res.text();
  let body: unknown = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }
  return {
    ok: res.ok,
    status: res.status,
    contentType,
    body,
    rawText,
  };
}

export async function postJson(
  url: string,
  payload: unknown,
  ctx: ProbeContext,
  headers: Record<string, string> = {},
): Promise<FetchJsonResult> {
  const fetchImpl = ctx.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) throw new Error('no fetch implementation available');
  const timeoutMs = ctx.timeoutMs ?? 10_000;
  const res = await withTimeout(
    fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(ctx.extraHeaders ?? {}),
        ...headers,
      },
      body: JSON.stringify(payload),
    }),
    timeoutMs,
    `POST ${url}`,
  );
  const contentType = res.headers.get('content-type');
  const rawText = await res.text();
  let body: unknown = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }
  return {
    ok: res.ok,
    status: res.status,
    contentType,
    body,
    rawText,
  };
}
