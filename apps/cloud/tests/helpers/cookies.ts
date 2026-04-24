/**
 * next/headers mock helpers for cloud route tests.
 *
 * Two things are factored out here:
 *
 *   1. `mockCookieStore()` — cookie-aware `cookies()` mock with get/set/delete
 *      that tests can program ahead of a request (mirrors the vi.mock pattern
 *      previously duplicated in `tenants-route.test.ts`).
 *
 *   2. `mockHeadersWithIp(ip)` — `headers()` mock that returns a Headers
 *      instance with `x-forwarded-for` pre-populated. Route handlers that
 *      rate-limit by client IP need this because `headers()` throws
 *      "outside a request scope" in vitest.
 *
 * Usage pattern — call `install()` at module scope BEFORE the route import:
 *
 *   const store = installCookieMock();
 *   const headersMock = installHeadersMock();
 *   const { POST } = await import('../app/api/foo/route');
 *
 * A single `vi.mock('next/headers', ...)` serves both hooks; the installer
 * wires the module factory and returns mutable handles for per-test reset.
 */

import { vi } from 'vitest';

export interface CookieStore {
  set(name: string, value: string): void;
  get(name: string): string | undefined;
  clear(): void;
}

export interface HeadersMock {
  /** Override the headers returned by `next/headers::headers()` for the next call. */
  setAll(h: Record<string, string>): void;
  /** Reset to an empty headers bag. */
  clear(): void;
}

let currentCookieStore: Map<string, string> | null = null;
let currentHeaders: Map<string, string> | null = null;

function ensureMocked(): void {
  // Idempotent — Vitest's vi.mock hoists and dedupes by module path, so
  // calling this multiple times from different helper methods is safe.
  vi.mock('next/headers', async () => {
    return {
      cookies: async () => ({
        get: (name: string) => {
          const v = currentCookieStore?.get(name);
          return v ? { name, value: v } : undefined;
        },
        set: (name: string, value: string) => {
          if (!currentCookieStore) currentCookieStore = new Map();
          currentCookieStore.set(name, value);
        },
        delete: (name: string) => {
          currentCookieStore?.delete(name);
        },
      }),
      headers: async () => {
        const h = new Headers();
        if (currentHeaders) {
          for (const [k, v] of currentHeaders) h.set(k, v);
        }
        return h;
      },
    };
  });
}

/**
 * Install the next/headers mock and return a cookie-store handle. Call at
 * module scope in each test file, BEFORE the first dynamic `import()` of a
 * route module.
 */
export function installCookieMock(): CookieStore {
  ensureMocked();
  currentCookieStore = new Map();
  return {
    set(name, value) {
      if (!currentCookieStore) currentCookieStore = new Map();
      currentCookieStore.set(name, value);
    },
    get(name) {
      return currentCookieStore?.get(name);
    },
    clear() {
      currentCookieStore?.clear();
    },
  };
}

/**
 * Install the next/headers mock and return a headers handle. The default
 * `x-forwarded-for` is a unique per-test IP so rate-limit buckets don't
 * collide across parallel test runs (vitest isolates modules per file, but
 * the PGlite DB is shared inside a single file).
 */
export function installHeadersMock(defaults?: Record<string, string>): HeadersMock {
  ensureMocked();
  currentHeaders = new Map();
  if (defaults) {
    for (const [k, v] of Object.entries(defaults)) {
      currentHeaders.set(k.toLowerCase(), v);
    }
  }
  return {
    setAll(h) {
      currentHeaders = new Map();
      for (const [k, v] of Object.entries(h)) {
        currentHeaders.set(k.toLowerCase(), v);
      }
    },
    clear() {
      currentHeaders?.clear();
    },
  };
}

/**
 * Generate a deterministic-per-test IP so rate-limit buckets across test
 * cases inside a single file stay separated. Strategy: derive the last
 * octet from a monotonic counter.
 */
let ipCounter = 1;
export function freshTestIp(): string {
  ipCounter = (ipCounter + 1) % 250;
  return `10.0.0.${ipCounter + 1}`;
}
