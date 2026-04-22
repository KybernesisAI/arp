/**
 * @kybernesis/arp-resolver — HNS DoH + did:web resolution with LRU cache.
 *
 * Exports:
 *   - resolveHns(name)        — DoH against hnsdoh.com (or local hnsd)
 *   - resolveDidWeb(did)      — did:web resolution, HNS-aware for `.agent`
 *   - createResolver(opts)    — factory with injectable DoH client + cache
 *
 * No runtime dependency on DIDComm, Cedar, SQLite, etc. — those live in
 * downstream packages and talk to this one via the `Resolver` interface.
 */

export {
  createResolver,
  DEFAULT_DOH_ENDPOINT,
  DEFAULT_CACHE_MAX,
  DEFAULT_CACHE_TTL_MS,
  type Resolver,
  type ResolverOptions,
} from './resolver.js';
export {
  createFetchDohClient,
  createLocalHnsdClient,
  DOH_TYPE_CODES,
  type DohAnswer,
  type DohClient,
  type DohFetchClientOptions,
  type DohRecordType,
  type DohResponse,
} from './doh.js';
export {
  resolveHnsRaw,
  type HnsResolution,
  type HnsTxtRecords,
} from './hns.js';
export {
  didWebToUrl,
  fetchAndParseDidDocument,
  type FetchDidDocOptions,
} from './did-web.js';
export { resolverError, type ResolverError, type ResolverErrorCode } from './errors.js';
export { LruCache, type LruCacheOptions } from './lru.js';

/**
 * Convenience: a default singleton resolver using hnsdoh.com. Callers who
 * need custom cache/DoH config should use `createResolver()` directly.
 */
import { createResolver, type Resolver } from './resolver.js';
let defaultResolver: Resolver | undefined;
export function getDefaultResolver(): Resolver {
  if (!defaultResolver) {
    defaultResolver = createResolver();
  }
  return defaultResolver;
}
