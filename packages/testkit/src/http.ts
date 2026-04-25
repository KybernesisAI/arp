import type { ProbeContext } from './types.js';
import { withTimeout } from './timing.js';

export interface FetchJsonResult {
  ok: boolean;
  status: number;
  contentType: string | null;
  body: unknown;
  rawText: string;
  /** Network-layer error message when the request never reached an HTTP response (DNS NXDOMAIN, ECONNREFUSED, TLS handshake failure, timeout, …). Undefined on any reachable response — including 4xx/5xx. */
  networkError?: string;
}

function networkErrorResult(err: unknown): FetchJsonResult {
  const message =
    err instanceof Error
      ? ((err as Error & { cause?: Error }).cause?.message ?? err.message)
      : String(err);
  return {
    ok: false,
    status: 0,
    contentType: null,
    body: null,
    rawText: '',
    networkError: message,
  };
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
  let res: Response;
  try {
    res = await withTimeout(fetchImpl(url, init), timeoutMs, `GET ${url}`);
  } catch (err) {
    return networkErrorResult(err);
  }
  const contentType = res.headers.get('content-type');
  let rawText = '';
  try {
    rawText = await res.text();
  } catch (err) {
    return { ...networkErrorResult(err), status: res.status };
  }
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
  let res: Response;
  try {
    res = await withTimeout(
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
  } catch (err) {
    return networkErrorResult(err);
  }
  const contentType = res.headers.get('content-type');
  let rawText = '';
  try {
    rawText = await res.text();
  } catch (err) {
    return { ...networkErrorResult(err), status: res.status };
  }
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
