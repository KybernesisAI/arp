import { describe, expect, it } from 'vitest';
import { createRevocationProbe, revocationProbe } from '../src/probes/revocation.js';

function fakeFetch(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...extraHeaders },
    })) as typeof fetch;
}

describe('revocationProbe', () => {
  it('passes shape check when revocations.json is valid', async () => {
    const r = await revocationProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      fetchImpl: fakeFetch({
        issuer: 'did:web:ian.self.xyz',
        updated_at: new Date().toISOString(),
        revocations: [],
      }),
    });
    expect(r.pass).toBe(true);
    expect(r.details['revocations_count']).toBe(0);
  });

  it('fails when status is 404', async () => {
    const r = await revocationProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      fetchImpl: fakeFetch({}, 404),
    });
    expect(r.pass).toBe(false);
  });

  it('passes when expected revoked id is present', async () => {
    const probe = createRevocationProbe({ expectedRevokedId: 'conn_abc', waitMs: 500 });
    const r = await probe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      fetchImpl: fakeFetch({
        issuer: 'did:web:ian.self.xyz',
        updated_at: new Date().toISOString(),
        revocations: [{ type: 'connection', id: 'conn_abc', revoked_at: new Date().toISOString() }],
      }),
    });
    expect(r.pass).toBe(true);
    expect(r.details['matched_connection_id']).toBe('conn_abc');
  });

  it('fails when expected revoked id never appears', async () => {
    const probe = createRevocationProbe({ expectedRevokedId: 'conn_missing', waitMs: 300 });
    const r = await probe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      fetchImpl: fakeFetch({
        issuer: 'did:web:ian.self.xyz',
        updated_at: new Date().toISOString(),
        revocations: [{ type: 'connection', id: 'conn_other' }],
      }),
    });
    expect(r.pass).toBe(false);
  });
});
