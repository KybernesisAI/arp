import { describe, expect, it } from 'vitest';
import { tlsFingerprintProbe } from '../src/probes/tls-fingerprint.js';

function fakeFetch(responses: Record<string, { body: unknown; status?: number }>): typeof fetch {
  return (async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = new URL(url).pathname;
    const r = responses[path];
    if (!r) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('tlsFingerprintProbe', () => {
  it('passes without TLS when local /health exposes fingerprint', async () => {
    const r = await tlsFingerprintProbe({
      target: 'localhost:4501',
      baseUrl: 'http://127.0.0.1:4501',
      fetchImpl: fakeFetch({
        '/health': { body: { ok: true, cert_fingerprint: 'a'.repeat(64) } },
      }),
    });
    expect(r.pass).toBe(true);
    expect(r.details['mode']).toBe('local-plaintext');
  });

  it('skips when baseUrl is http:// and no /health fingerprint available', async () => {
    const r = await tlsFingerprintProbe({
      target: 'localhost:4501',
      baseUrl: 'http://127.0.0.1:4501',
      fetchImpl: fakeFetch({
        '/health': { body: { ok: true } }, // no cert_fingerprint
      }),
    });
    expect(r.pass).toBe(true);
    expect(r.skipped).toBe(true);
  });
});
