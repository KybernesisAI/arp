/**
 * DoH client — supports both JSON form (application/dns-json) and RFC 8484
 * wire form (application/dns-message). Public Handshake DoH endpoints
 * (hnsdoh.com et al.) only speak RFC 8484 — the JSON form is rejected with
 * HTTP 400 — so the wire client is the default for `.agent` resolution.
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
 * DoH client backed by RFC 8484 binary wire-format HTTP requests. Default
 * for `.agent` resolution because public HNS DoH endpoints (hnsdoh.com,
 * easyhandshake.com) only speak this format. Opaque to the consumer —
 * exposes the same `DohClient` shape as the JSON variant.
 */
export function createFetchDohClient(opts: DohFetchClientOptions): DohClient {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('No fetch implementation available; provide opts.fetchImpl');
  }
  const timeoutMs = opts.timeoutMs ?? 5000;
  return {
    async query(name, type) {
      const wire = encodeDnsQuery(name, DOH_TYPE_CODES[type]);
      const dnsParam = base64UrlNoPad(wire);
      const url = new URL(opts.endpoint);
      url.searchParams.set('dns', dnsParam);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, {
          method: 'GET',
          headers: { Accept: 'application/dns-message' },
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`DoH ${type} ${name} → HTTP ${res.status}`);
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        const parsed = decodeDnsResponse(buf);
        if (parsed.rcode !== 0) {
          if (parsed.rcode === 3) return []; // NXDOMAIN
          throw new Error(`DoH ${type} ${name} → rcode ${parsed.rcode}`);
        }
        const wanted = DOH_TYPE_CODES[type];
        return parsed.answers
          .filter((a) => a.type === wanted)
          .map((a) => ({ name: a.name, type: a.type, TTL: a.ttl, data: a.data }));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Legacy JSON-form DoH client (application/dns-json). Cloudflare + Google
 * speak this; HNS resolvers generally don't. Kept for callers that pin
 * specifically to a JSON-DoH endpoint.
 */
export function createJsonDohClient(opts: DohFetchClientOptions): DohClient {
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

/* ------------------------- DNS wire codec ------------------------- */

function encodeDnsQuery(name: string, qtype: number): Uint8Array {
  const id = Math.floor(Math.random() * 0xffff);
  const flags = 0x0100; // RD = 1
  const labels: number[] = [];
  for (const part of name.split('.')) {
    if (part.length === 0) continue;
    if (part.length > 63) throw new Error(`DNS label too long: ${part}`);
    labels.push(part.length);
    for (let i = 0; i < part.length; i++) labels.push(part.charCodeAt(i));
  }
  labels.push(0); // root
  const out = new Uint8Array(12 + labels.length + 4);
  const view = new DataView(out.buffer);
  view.setUint16(0, id);
  view.setUint16(2, flags);
  view.setUint16(4, 1); // QDCOUNT
  view.setUint16(6, 0); // ANCOUNT
  view.setUint16(8, 0); // NSCOUNT
  view.setUint16(10, 0); // ARCOUNT
  out.set(labels, 12);
  view.setUint16(12 + labels.length, qtype); // QTYPE
  view.setUint16(14 + labels.length, 1); // QCLASS = IN
  return out;
}

interface ParsedDnsResponse {
  rcode: number;
  answers: { name: string; type: number; ttl: number; data: string }[];
}

function decodeDnsResponse(data: Uint8Array): ParsedDnsResponse {
  if (data.length < 12) throw new Error('DNS response too short');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const flags = view.getUint16(2);
  const rcode = flags & 0x0f;
  const qdcount = view.getUint16(4);
  const ancount = view.getUint16(6);
  let i = 12;
  for (let q = 0; q < qdcount; q++) {
    i = skipName(data, i);
    i += 4; // qtype + qclass
  }
  const answers: ParsedDnsResponse['answers'] = [];
  for (let a = 0; a < ancount; a++) {
    const [name, after] = parseName(data, i);
    i = after;
    const type = view.getUint16(i);
    /* class */ view.getUint16(i + 2);
    const ttl = view.getUint32(i + 4);
    const rdlen = view.getUint16(i + 8);
    i += 10;
    const rdata = data.subarray(i, i + rdlen);
    i += rdlen;
    answers.push({ name, type, ttl, data: decodeRdata(type, rdata, data) });
  }
  return { rcode, answers };
}

function parseName(data: Uint8Array, offset: number): [string, number] {
  const parts: string[] = [];
  let cursor = offset;
  let jumpedTo = -1;
  let safety = 0;
  while (safety++ < 256) {
    const len = data[cursor]!;
    if (len === 0) {
      cursor += 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      const ptr = ((len & 0x3f) << 8) | data[cursor + 1]!;
      if (jumpedTo === -1) jumpedTo = cursor + 2;
      cursor = ptr;
      continue;
    }
    cursor += 1;
    parts.push(
      String.fromCharCode(...Array.from(data.subarray(cursor, cursor + len))),
    );
    cursor += len;
  }
  return [parts.join('.'), jumpedTo === -1 ? cursor : jumpedTo];
}

function skipName(data: Uint8Array, offset: number): number {
  return parseName(data, offset)[1];
}

function decodeRdata(type: number, rdata: Uint8Array, full: Uint8Array): string {
  switch (type) {
    case 1: // A
      return Array.from(rdata).join('.');
    case 28: // AAAA
      return Array.from({ length: 8 }, (_, i) =>
        ((rdata[i * 2]! << 8) | rdata[i * 2 + 1]!).toString(16),
      ).join(':');
    case 5: // CNAME
      return parseName(full, full.byteLength - rdata.byteLength)[0];
    case 16: {
      // TXT — concatenate all character strings in the rdata
      let out = '';
      let i = 0;
      while (i < rdata.length) {
        const len = rdata[i]!;
        i += 1;
        out += String.fromCharCode(...Array.from(rdata.subarray(i, i + len)));
        i += len;
      }
      return out;
    }
    default:
      // Unknown — return hex so callers can debug
      return Array.from(rdata, (b) => b.toString(16).padStart(2, '0')).join('');
  }
}

function base64UrlNoPad(buf: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
