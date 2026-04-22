import type { DidDocument } from '@kybernesis/arp-spec';
import { createFetchDohClient, createLocalHnsdClient, type DohClient } from './doh.js';
import { resolveHnsRaw, type HnsResolution } from './hns.js';
import {
  didWebToUrl,
  fetchAndParseDidDocument,
  type FetchDidDocOptions,
} from './did-web.js';
import { resolverError, type ResolverError } from './errors.js';
import { LruCache } from './lru.js';

export const DEFAULT_DOH_ENDPOINT = 'https://hnsdoh.com/dns-query';
export const DEFAULT_CACHE_TTL_MS = 300_000;
export const DEFAULT_CACHE_MAX = 1000;

export interface ResolverOptions {
  /** DoH endpoint. Defaults to `https://hnsdoh.com/dns-query`. */
  dohEndpoint?: string;
  /**
   * Force local `hnsd` resolution. Mirrors the `ARP_HNSD_LOCAL=true` env.
   * When true, DNS goes via `127.0.0.1:53` instead of DoH.
   */
  useLocalHnsd?: boolean;
  /** Pre-built DoH client (overrides endpoint + useLocalHnsd). */
  dohClient?: DohClient;
  /** Override fetch (propagated to DoH JSON client + did:web fetch). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout (applies to DoH + did:web HTTPS). */
  timeoutMs?: number;
  /** LRU cache TTL in ms. Default 300_000 (5 min, matches spec TTL). */
  cacheTtlMs?: number;
  /** LRU cache capacity. Default 1000. */
  cacheMax?: number;
  /** Clock injection (for tests). */
  now?: () => number;
}

export interface Resolver {
  resolveHns(name: string): Promise<HnsResolution>;
  resolveDidWeb(
    did: string,
  ): Promise<{ ok: true; value: DidDocument } | { ok: false; error: ResolverError }>;
  clearCache(): void;
}

/**
 * Build an ARP resolver. Applies the `ARP_HNSD_LOCAL` env var if
 * `useLocalHnsd` isn't explicitly set.
 */
export function createResolver(opts: ResolverOptions = {}): Resolver {
  const useLocal =
    opts.useLocalHnsd ??
    (typeof process !== 'undefined' && process.env.ARP_HNSD_LOCAL === 'true');

  const doh =
    opts.dohClient ??
    (useLocal
      ? createLocalHnsdClient()
      : createFetchDohClient({
          endpoint: opts.dohEndpoint ?? DEFAULT_DOH_ENDPOINT,
          fetchImpl: opts.fetchImpl,
          timeoutMs: opts.timeoutMs,
        }));

  const cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cacheMax = opts.cacheMax ?? DEFAULT_CACHE_MAX;
  const cacheOptions = {
    max: cacheMax,
    ttlMs: cacheTtlMs,
    ...(opts.now ? { now: opts.now } : {}),
  };
  const hnsCache = new LruCache<string, HnsResolution>(cacheOptions);
  const didCache = new LruCache<string, DidDocument>(cacheOptions);

  const didFetchOpts: FetchDidDocOptions = {
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
  };

  return {
    async resolveHns(name) {
      const key = name.replace(/\.$/, '').toLowerCase();
      const cached = hnsCache.get(key);
      if (cached) return cached;
      const resolution = await resolveHnsRaw(doh, key);
      hnsCache.set(key, resolution);
      return resolution;
    },

    async resolveDidWeb(did) {
      const key = did.toLowerCase();
      const cached = didCache.get(key);
      if (cached) return { ok: true, value: cached };

      const parsed = didWebToUrl(did);
      if (!parsed.ok) return parsed;

      // For .agent names we could route through HNS DoH to validate
      // hostname → IP resolution, but TLS is ultimately validated by
      // @kybernesis/arp-tls against the DID-doc pinned fingerprint, so the
      // fetch itself relies on the platform resolver via fetch().
      // If hnsd-local mode is on, seed the platform's resolver preference
      // first (callers typically point system DNS at 127.0.0.1 in that setup).
      if (parsed.host.endsWith('.agent')) {
        try {
          await resolveHnsRaw(doh, parsed.host, ['A', 'AAAA']);
        } catch (err) {
          return {
            ok: false,
            error: resolverError(
              'doh_failure',
              `HNS lookup failed for ${parsed.host}`,
              err,
            ),
          };
        }
      }

      const fetched = await fetchAndParseDidDocument(parsed.url, didFetchOpts);
      if (!fetched.ok) return fetched;
      didCache.set(key, fetched.value);
      return fetched;
    },

    clearCache() {
      hnsCache.clear();
      didCache.clear();
    },
  };
}
