import { describe, it, expect } from 'vitest';
import { LruCache } from '../src/lru.js';

describe('LruCache', () => {
  it('stores and retrieves values', () => {
    const cache = new LruCache<string, number>({ max: 3, ttlMs: 1000 });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('evicts least-recently-used entries past max', () => {
    const cache = new LruCache<string, number>({ max: 2, ttlMs: 10_000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('promotes on read', () => {
    const cache = new LruCache<string, number>({ max: 2, ttlMs: 10_000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('expires entries after ttl', () => {
    let t = 0;
    const cache = new LruCache<string, number>({ max: 5, ttlMs: 100, now: () => t });
    cache.set('a', 1);
    t = 50;
    expect(cache.get('a')).toBe(1);
    t = 150;
    expect(cache.get('a')).toBeUndefined();
  });

  it('updates in place without eviction', () => {
    const cache = new LruCache<string, number>({ max: 2, ttlMs: 1000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBe(10);
  });

  it('rejects invalid construction', () => {
    expect(() => new LruCache({ max: 0, ttlMs: 100 })).toThrow();
    expect(() => new LruCache({ max: 10, ttlMs: 0 })).toThrow();
  });
});
