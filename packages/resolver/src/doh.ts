/**
 * DoH client — JSON form (application/dns-json), Cloudflare/Google/hnsdoh
 * compatible. We stick to JSON rather than RFC 8484 wire format to avoid a
 * DNS-encoder dependency; the JSON form is what hnsdoh.com serves publicly
 * and is sufficient for A/AAAA/TXT lookups against `.agent` names.
 */

export type DohRecordType = 'A' | 'AAAA' | 'TXT';

/** Integer codes per IANA DNS parameters (RFC 1035 + RFC 3596). */
export const DOH_TYPE_CODES: Readonly<Record<DohRecordType, number>> = Object.freeze({
  A: 1,
  AAAA: 28,
  TXT: 16,
});

export interface DohAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

export interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

export interface DohClient {
  query(name: string, type: DohRecordType): Promise<DohAnswer[]>;
}

export interface DohFetchClientOptions {
  /** Full URL of the DoH JSON endpoint. */
  endpoint: string;
  /** Optional custom fetch (defaults to global `fetch`). Useful for tests. */
  fetchImpl?: typeof fetch;
  /** Millisecond timeout for each request (default 5000). */
  timeoutMs?: number;
}

/**
 * DoH client backed by JSON-form HTTP requests. Any server that speaks
 * `application/dns-json` works; defaults to hnsdoh.com.
 */
export function createFetchDohClient(opts: DohFetchClientOptions): DohClient {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('No fetch implementation available; provide opts.fetchImpl');
  }
  const timeoutMs = opts.timeoutMs ?? 5000;
  return {
    async query(name, type) {
      const url = new URL(opts.endpoint);
      url.searchParams.set('name', name);
      url.searchParams.set('type', type);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, {
          method: 'GET',
          headers: { Accept: 'application/dns-json' },
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`DoH ${type} ${name} → HTTP ${res.status}`);
        }
        const body = (await res.json()) as DohResponse;
        if (body.Status !== 0) {
          // Status codes per RFC 8484 §4.2.1; 0 = NOERROR, 3 = NXDOMAIN.
          if (body.Status === 3) return [];
          throw new Error(`DoH ${type} ${name} → rcode ${body.Status}`);
        }
        const wanted = DOH_TYPE_CODES[type];
        return (body.Answer ?? []).filter((a) => a.type === wanted);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Local `hnsd` override — queries 127.0.0.1:53 via Node's DNS resolver.
 * Enabled when `ARP_HNSD_LOCAL=true` is set in the environment.
 *
 * Loads `node:dns/promises` lazily so the package stays import-safe in
 * non-Node runtimes.
 */
export function createLocalHnsdClient(): DohClient {
  return {
    async query(name, type) {
      const dns = await import('node:dns/promises');
      const resolver = new dns.Resolver();
      resolver.setServers(['127.0.0.1']);
      try {
        switch (type) {
          case 'A': {
            const addrs = await resolver.resolve4(name, { ttl: true });
            return addrs.map((r) => ({
              name,
              type: DOH_TYPE_CODES.A,
              TTL: r.ttl,
              data: r.address,
            }));
          }
          case 'AAAA': {
            const addrs = await resolver.resolve6(name, { ttl: true });
            return addrs.map((r) => ({
              name,
              type: DOH_TYPE_CODES.AAAA,
              TTL: r.ttl,
              data: r.address,
            }));
          }
          case 'TXT': {
            const records = await resolver.resolveTxt(name);
            return records.map((chunks) => ({
              name,
              type: DOH_TYPE_CODES.TXT,
              TTL: 300,
              data: chunks.join(''),
            }));
          }
        }
      } catch (err) {
        if (isNxDomain(err)) return [];
        throw err;
      }
    },
  };
}

function isNxDomain(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return code === 'ENOTFOUND' || code === 'ENODATA';
  }
  return false;
}
