import { describe, expect, it } from 'vitest';
import { dnsProbe } from '../src/probes/dns.js';
import type { ProbeContext } from '../src/types.js';

// We stub out DoH by patching `fetch`. DoH queries go through
// `createFetchDohClient`, which reads `?name=<n>&type=<T>` parameters and
// expects an `application/dns-json` response. Our mock fetch matches that.

function mockFetch(
  mapping: Record<string, Array<{ name: string; type: number; data: string; TTL?: number }>>,
): typeof fetch {
  return (async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const u = new URL(url);
    const name = u.searchParams.get('name') ?? '';
    const typeStr = u.searchParams.get('type') ?? 'A';
    const answers = mapping[`${name}|${typeStr}`] ?? [];
    return new Response(JSON.stringify({ Status: 0, Answer: answers }), {
      status: 200,
      headers: { 'content-type': 'application/dns-json' },
    });
  }) as typeof fetch;
}

describe('dnsProbe', () => {
  it('skips for localhost target', async () => {
    const result = await dnsProbe({
      target: 'localhost:4501',
      baseUrl: 'http://127.0.0.1:4501',
      fetchImpl: mockFetch({}),
    } as ProbeContext);
    expect(result.skipped).toBe(true);
    expect(result.pass).toBe(true);
  });

  it('passes when all four TXT records are present and well-shaped', async () => {
    const apex = 'samantha.agent';
    const fp = 'a'.repeat(64);
    const answers = {
      [`${apex}|A`]: [{ name: apex, type: 1, data: '1.2.3.4' }],
      [`${apex}|AAAA`]: [],
      [`${apex}|TXT`]: [],
      [`_arp.${apex}|TXT`]: [
        { name: `_arp.${apex}`, type: 16, data: '"v=1; caps=didcomm; pdp=cedar"' },
      ],
      [`_did.${apex}|TXT`]: [
        { name: `_did.${apex}`, type: 16, data: `"did=did:web:${apex}; fp=${fp}"` },
      ],
      [`_didcomm.${apex}|TXT`]: [
        { name: `_didcomm.${apex}`, type: 16, data: `"url=https://${apex}/didcomm; v=2"` },
      ],
      [`_revocation.${apex}|TXT`]: [
        {
          name: `_revocation.${apex}`,
          type: 16,
          data: `"url=https://ian.${apex}/revocations.json; poll=300"`,
        },
      ],
      [`_principal.${apex}|TXT`]: [],
    };
    const result = await dnsProbe({
      target: apex,
      baseUrl: `https://${apex}`,
      fetchImpl: mockFetch(answers),
      dohEndpoint: 'https://hnsdoh.example/dns-query',
    });
    expect(result.pass).toBe(true);
    expect(result.skipped).toBeFalsy();
    expect(result.details['missing']).toBeUndefined();
  });

  it('fails when a TXT record is missing', async () => {
    const apex = 'missing.agent';
    const answers = {
      [`_arp.${apex}|TXT`]: [
        { name: `_arp.${apex}`, type: 16, data: 'v=1; caps=didcomm; pdp=cedar' },
      ],
      // _did and _didcomm intentionally missing
      [`_revocation.${apex}|TXT`]: [
        {
          name: `_revocation.${apex}`,
          type: 16,
          data: `url=https://ian.${apex}/revocations.json; poll=300`,
        },
      ],
    };
    const result = await dnsProbe({
      target: apex,
      baseUrl: `https://${apex}`,
      fetchImpl: mockFetch(answers),
      dohEndpoint: 'https://hnsdoh.example/dns-query',
    });
    expect(result.pass).toBe(false);
    expect(result.details['missing']).toEqual(expect.arrayContaining(['_did', '_didcomm']));
  });

  it('fails when _did fp is malformed', async () => {
    const apex = 'bad-fp.agent';
    const answers = {
      [`_arp.${apex}|TXT`]: [
        { name: `_arp.${apex}`, type: 16, data: 'v=1; caps=didcomm; pdp=cedar' },
      ],
      [`_did.${apex}|TXT`]: [
        { name: `_did.${apex}`, type: 16, data: `did=did:web:${apex}; fp=nope` },
      ],
      [`_didcomm.${apex}|TXT`]: [
        { name: `_didcomm.${apex}`, type: 16, data: `url=https://${apex}/didcomm; v=2` },
      ],
      [`_revocation.${apex}|TXT`]: [
        { name: `_revocation.${apex}`, type: 16, data: `url=https://ian.${apex}/r.json; poll=300` },
      ],
    };
    const result = await dnsProbe({
      target: apex,
      baseUrl: `https://${apex}`,
      fetchImpl: mockFetch(answers),
      dohEndpoint: 'https://hnsdoh.example/dns-query',
    });
    expect(result.pass).toBe(false);
    expect(result.details['malformed']).toBeDefined();
  });
});
