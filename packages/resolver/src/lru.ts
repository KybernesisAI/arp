/**
 * Minimal LRU cache with per-entry TTL. No deps.
 *
 * Used by the resolver to cap memory to `max` entries and expire stale DoH
 * answers after the configured TTL without reaching for a full dependency.
 */

export interface LruCacheOptions {
  max: number;
  ttlMs: number;
  now?: () => number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class LruCache<K, V> {
  private readonly max: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly map: Map<K, Entry<V>>;

  constructor(opts: LruCacheOptions) {
    if (opts.max <= 0) {
      throw new Error('LruCache.max must be > 0');
    }
    if (opts.ttlMs <= 0) {
      throw new Error('LruCache.ttlMs must be > 0');
    }
    this.max = opts.max;
    this.ttlMs = opts.ttlMs;
    this.now = opts.now ?? Date.now;
    this.map = new Map();
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.max) {
      const oldest = this.map.keys().next();
      if (!oldest.done) {
        this.map.delete(oldest.value);
      }
    }
    this.map.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
