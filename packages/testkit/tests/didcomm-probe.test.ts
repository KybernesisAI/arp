import { describe, expect, it } from 'vitest';
import { didCommProbe } from '../src/probes/didcomm-probe.js';

function fakeFetch(
  response: { ok: boolean; error?: { code: string; message: string }; msg_id?: string },
  status = 400,
): typeof fetch {
  return (async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    expect(url.endsWith('/didcomm')).toBe(true);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string> | undefined)?.['content-type']).toBe(
      'application/didcomm-signed+json',
    );
    return new Response(JSON.stringify(response), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('didCommProbe', () => {
  it('passes on 400 unknown_peer (unknown-signer probe path)', async () => {
    const r = await didCommProbe({
      target: 'localhost:4501',
      baseUrl: 'http://127.0.0.1:4501',
      fetchImpl: fakeFetch(
        { ok: false, error: { code: 'unknown_peer', message: 'no DID' } },
        400,
      ),
    });
    expect(r.pass).toBe(true);
    expect(r.details['observed_error_code']).toBe('unknown_peer');
  });

  it('fails on 200 ok (unexpected for unknown-signer)', async () => {
    const r = await didCommProbe({
      target: 'localhost:4501',
      baseUrl: 'http://127.0.0.1:4501',
      fetchImpl: fakeFetch({ ok: true, msg_id: 'x' }, 200),
    });
    expect(r.pass).toBe(false);
  });

  it('fails on unrelated 400 (invalid_envelope)', async () => {
    const r = await didCommProbe({
      target: 'localhost:4501',
      baseUrl: 'http://127.0.0.1:4501',
      fetchImpl: fakeFetch(
        { ok: false, error: { code: 'invalid_envelope', message: 'bad' } },
        400,
      ),
    });
    expect(r.pass).toBe(false);
  });

  it('fails on 500', async () => {
    const r = await didCommProbe({
      target: 'localhost:4501',
      baseUrl: 'http://127.0.0.1:4501',
      fetchImpl: fakeFetch({ ok: false, error: { code: 'x', message: 'y' } }, 500),
    });
    expect(r.pass).toBe(false);
  });
});
