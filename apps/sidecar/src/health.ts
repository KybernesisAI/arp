export interface HealthResponse {
  ok: boolean;
  did?: string;
  uptime_ms?: number;
  cert_fingerprint?: string;
  connections_count?: number;
  audit_seq?: number;
  draining?: boolean;
  version?: string;
}

/**
 * Poll `/health` on the local sidecar. Resolves to the response body if
 * 2xx arrives before `timeoutMs`, or `null` otherwise. Never throws.
 */
export async function checkHealth(params: {
  host?: string;
  port?: number;
  timeoutMs?: number;
}): Promise<HealthResponse | null> {
  const host = params.host ?? '127.0.0.1';
  const port = params.port ?? 443;
  const timeoutMs = params.timeoutMs ?? 3000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${host}:${port}/health`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as HealthResponse;
    return body;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
