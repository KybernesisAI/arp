import { DidDocumentSchema, type DidDocument } from '@kybernesis/arp-spec';
import { resolverError, type ResolverError } from './errors.js';

/**
 * Parse a `did:web:<domain>[:<path>]*` DID into the URL the DID document
 * lives at, per the did:web spec.
 *
 * `did:web:samantha.agent`        → https://samantha.agent/.well-known/did.json
 * `did:web:example.com:user:alice`→ https://example.com/user/alice/did.json
 */
export function didWebToUrl(did: string):
  | { ok: true; url: URL; host: string }
  | { ok: false; error: ResolverError } {
  if (!did.startsWith('did:web:')) {
    return {
      ok: false,
      error: resolverError('unsupported_method', `not a did:web DID: ${did}`),
    };
  }
  const body = did.slice('did:web:'.length);
  if (!body) {
    return {
      ok: false,
      error: resolverError('invalid_did', `empty did:web body: ${did}`),
    };
  }
  const parts = body.split(':').map((p) => decodeURIComponent(p));
  const host = parts[0];
  if (!host || !/^[A-Za-z0-9.-]+$/.test(host)) {
    return {
      ok: false,
      error: resolverError('invalid_did', `invalid did:web host: ${host ?? ''}`),
    };
  }
  const tail = parts.slice(1);
  const path = tail.length === 0 ? '/.well-known/did.json' : `/${tail.join('/')}/did.json`;
  return {
    ok: true,
    url: new URL(`https://${host}${path}`),
    host,
  };
}

export interface FetchDidDocOptions {
  /** Optional custom fetch (injectable for tests). */
  fetchImpl?: typeof fetch;
  /** Request timeout (default 5000 ms). */
  timeoutMs?: number;
}

export async function fetchAndParseDidDocument(
  url: URL,
  opts: FetchDidDocOptions = {},
): Promise<{ ok: true; value: DidDocument } | { ok: false; error: ResolverError }> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: resolverError(
          res.status === 404 ? 'not_found' : 'http_failure',
          `GET ${url.toString()} → HTTP ${res.status}`,
        ),
      };
    }
    const json = await res.json();
    const parsed = DidDocumentSchema.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        error: resolverError(
          'parse_failure',
          `invalid DID document from ${url.toString()}`,
          parsed.error.issues,
        ),
      };
    }
    return { ok: true, value: parsed.data };
  } catch (err) {
    return {
      ok: false,
      error: resolverError('http_failure', `fetch failed for ${url.toString()}`, err),
    };
  } finally {
    clearTimeout(timer);
  }
}
