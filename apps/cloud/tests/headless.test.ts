import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HeadlessError,
  assertValidSld,
  createHeadlessClient,
  normalizeSld,
  parseHeadlessWebhookEvent,
  verifyHeadlessWebhookSignature,
} from '../lib/headless';

const FIXTURES = resolve(__dirname, 'fixtures', 'headless');
const fixture = (name: string): string => readFileSync(resolve(FIXTURES, name), 'utf8');

type Call = { url: string; init: RequestInit };

function mockFetch(
  handler: (url: string, init: RequestInit) => { status: number; body?: string },
): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init: init ?? {} });
    const r = handler(url, init ?? {});
    return new Response(r.body ?? '', {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('sld normalization + validation', () => {
  it('lowercases, trims, and strips a trailing .agent', () => {
    expect(normalizeSld('  Samantha.agent ')).toBe('samantha');
    expect(normalizeSld('atlas')).toBe('atlas');
  });
  it('rejects malformed labels', () => {
    expect(() => assertValidSld('-bad')).toThrow(HeadlessError);
    expect(() => assertValidSld('has space')).toThrow(/invalid \.agent name/);
    expect(() => assertValidSld('')).toThrow(HeadlessError);
  });
  it('rejects protocol + infrastructure reserved names', () => {
    for (const reserved of ['system', 'registry', 'gateway', 'test']) {
      let code: string | null = null;
      try {
        assertValidSld(reserved);
      } catch (e) {
        code = (e as HeadlessError).code;
      }
      expect(code).toBe('reserved');
    }
  });
});

describe('searchAgentName', () => {
  it('returns the .agent row for an available name (live fixture)', async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ status: 200, body: fixture('search-available.json') }));
    const client = createHeadlessClient({ apiKey: null, fetchImpl });
    const r = await client.searchAgentName('kybernesis-test-zz');
    expect(calls[0]?.url).toBe('https://headlessdomains.com/api/v1/domains/search?q=kybernesis-test-zz');
    expect(r.domain).toBe('kybernesis-test-zz.agent');
    expect(r.available).toBe(true);
    expect(r.retail.humanGems).toBe(50);
    expect(r.retail.agentGems).toBe(1);
    expect(r.retail.agentUsd).toBe(0.52);
    expect(r.launchPhase).toBe('public');
  });

  it('returns unavailable with reason for a taken name (live fixture)', async () => {
    const { fetchImpl } = mockFetch(() => ({ status: 200, body: fixture('search-taken.json') }));
    const client = createHeadlessClient({ apiKey: null, fetchImpl });
    const r = await client.searchAgentName('samantha.agent');
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/^Registered on/);
  });

  it('maps 429 to rate_limited', async () => {
    const { fetchImpl } = mockFetch(() => ({ status: 429, body: '{"error":"slow down"}' }));
    const client = createHeadlessClient({ apiKey: null, fetchImpl });
    await expect(client.searchAgentName('atlas')).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('rejects reserved names before hitting the network', async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ status: 200, body: '{}' }));
    const client = createHeadlessClient({ apiKey: null, fetchImpl });
    await expect(client.searchAgentName('registry')).rejects.toMatchObject({ code: 'reserved' });
    expect(calls).toHaveLength(0);
  });
});

describe('registerDomain', () => {
  const ok = JSON.stringify({
    success: true,
    result: 'success',
    domain: 'atlas.agent',
    domain_id: 4242,
    order_id: 9001,
    status: 'active',
    domain_status: 'active',
    expiry_date: '2027-09-17T00:00:00Z',
    grace_ends_at: '2027-10-27T00:00:00Z',
    payment_method: 'gems',
    owner_id: '77',
    reseller_channel: 'arp.run',
  });

  it('sends the reseller payload and maps the 201 response', async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ status: 201, body: ok }));
    const client = createHeadlessClient({ apiKey: 'hd_live_test', fetchImpl });
    const r = await client.registerDomain({ sld: 'Atlas', years: 2 });
    const sent = JSON.parse(String(calls[0]?.init.body));
    expect(sent).toEqual({
      domain: 'atlas',
      namespace: 'agent',
      years: 2,
      agreed_to_terms: true,
      payment_method: 'gems',
      reseller_channel: 'arp.run',
    });
    expect((calls[0]?.init.headers as Record<string, string>)['x-api-key']).toBe('hd_live_test');
    expect(r.headlessDomainId).toBe('4242');
    expect(r.headlessOrderId).toBe('9001');
    expect(r.status).toBe('active');
    expect(r.expiryAt?.toISOString()).toBe('2027-09-17T00:00:00.000Z');
    expect(r.graceEndsAt?.toISOString()).toBe('2027-10-27T00:00:00.000Z');
  });

  it('refuses to register without an API key', async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ status: 201, body: ok }));
    const client = createHeadlessClient({ apiKey: null, fetchImpl });
    await expect(client.registerDomain({ sld: 'atlas', years: 1 })).rejects.toMatchObject({
      code: 'unauthorized',
    });
    expect(calls).toHaveLength(0);
  });

  it('maps 409 → name_taken, 402 → insufficient_funds, 403 → reserved', async () => {
    for (const [status, code] of [
      [409, 'name_taken'],
      [402, 'insufficient_funds'],
      [403, 'reserved'],
    ] as const) {
      const { fetchImpl } = mockFetch(() => ({ status, body: '{"error":"x"}' }));
      const client = createHeadlessClient({ apiKey: 'hd_live_test', fetchImpl });
      await expect(client.registerDomain({ sld: 'atlas', years: 1 })).rejects.toMatchObject({ code });
    }
  });

  it('honours a custom reseller channel + target owner', async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ status: 201, body: ok }));
    const client = createHeadlessClient({
      apiKey: 'hd_live_test',
      fetchImpl,
      resellerChannel: 'agentid.test',
    });
    await client.registerDomain({ sld: 'atlas', years: 1, targetOwnerId: '555' });
    const sent = JSON.parse(String(calls[0]?.init.body));
    expect(sent.reseller_channel).toBe('agentid.test');
    expect(sent.target_owner_id).toBe('555');
  });
});

describe('lookup', () => {
  it('surfaces the v2.1 _arp binding from the live fixture', async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ status: 200, body: fixture('lookup-samantha.json') }));
    const client = createHeadlessClient({ apiKey: null, fetchImpl });
    const r = await client.lookup('samantha');
    expect(calls[0]?.url).toBe('https://headlessdomains.com/api/v1/lookup/samantha.agent');
    expect(r?.domain).toBe('samantha.agent');
    expect(r?.status).toBe('active');
    expect(r?.expiryAt?.getUTCFullYear()).toBe(2027);
    expect(r?.arpChatEnabled).toBe(false);
    expect(r?.arpBinding?.ownerLabel).toBe('owner');
    expect(r?.arpBinding?.representationJwt?.split('.')).toHaveLength(3);
  });

  it('returns null on 404', async () => {
    const { fetchImpl } = mockFetch(() => ({ status: 404, body: '{"error":"not found"}' }));
    const client = createHeadlessClient({ apiKey: null, fetchImpl });
    expect(await client.lookup('nobody-here')).toBeNull();
  });
});

describe('getAgentPricing', () => {
  it('extracts the .agent row from the live pricing fixture', async () => {
    const { fetchImpl } = mockFetch(() => ({ status: 200, body: fixture('pricing.json') }));
    const client = createHeadlessClient({ apiKey: null, fetchImpl });
    const p = await client.getAgentPricing();
    expect(p).toEqual({
      registrationHumanUsd: 26,
      registrationAgentUsd: 0.52,
      renewalHumanUsd: 26,
      renewalAgentUsd: 0.52,
    });
  });
});

describe('myDomains', () => {
  it('maps the owned list', async () => {
    const body = JSON.stringify({
      status: 'success',
      data: [
        { id: 1, name: 'atlas.agent', tld: 'agent', status: 'active', expiry_date: '2027-01-01T00:00:00Z' },
        { id: '2', name: 'nova.agent', tld: 'agent', status: 'expired' },
      ],
    });
    const { fetchImpl } = mockFetch(() => ({ status: 200, body }));
    const client = createHeadlessClient({ apiKey: 'hd_live_test', fetchImpl });
    const rows = await client.myDomains();
    expect(rows.map((r) => [r.headlessDomainId, r.domain, r.status])).toEqual([
      ['1', 'atlas.agent', 'active'],
      ['2', 'nova.agent', 'expired'],
    ]);
    expect(rows[1]?.expiryAt).toBeNull();
  });
});

describe('webhooks', () => {
  const secret = 'whsec-test';
  const raw = JSON.stringify({
    event_id: 'evt_1',
    event_type: 'domain.registered',
    timestamp: '2026-09-17T00:00:00Z',
    data: { domain: 'atlas.agent' },
  });
  const sig = createHmac('sha256', secret).update(raw).digest('hex');

  it('accepts a valid hex HMAC-SHA256 signature', () => {
    expect(verifyHeadlessWebhookSignature(raw, sig, secret)).toBe(true);
    expect(verifyHeadlessWebhookSignature(raw, sig.toUpperCase(), secret)).toBe(true);
  });
  it('rejects tampered bodies, wrong secrets, and malformed signatures', () => {
    expect(verifyHeadlessWebhookSignature(`${raw} `, sig, secret)).toBe(false);
    expect(verifyHeadlessWebhookSignature(raw, sig, 'other')).toBe(false);
    expect(verifyHeadlessWebhookSignature(raw, 'zz', secret)).toBe(false);
    expect(verifyHeadlessWebhookSignature(raw, null, secret)).toBe(false);
    expect(verifyHeadlessWebhookSignature(raw, sig.slice(0, 10), secret)).toBe(false);
  });
  it('parses known event types and rejects unknown ones', () => {
    expect(parseHeadlessWebhookEvent(JSON.parse(raw))?.event_type).toBe('domain.registered');
    expect(parseHeadlessWebhookEvent({ event_id: 'x', event_type: 'domain.hacked' })).toBeNull();
  });

  it('subscribeWebhook posts the documented payload', async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ status: 201, body: '{"status":"success"}' }));
    const client = createHeadlessClient({ apiKey: 'hd_live_test', fetchImpl });
    await client.subscribeWebhook({
      targetUrl: 'https://cloud.arp.run/api/webhooks/headless',
      events: ['domain.registered', 'domain.expired'],
      secret,
    });
    expect(calls[0]?.url).toBe('https://headlessdomains.com/api/v1/webhooks/subscribe');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      target_url: 'https://cloud.arp.run/api/webhooks/headless',
      events: ['domain.registered', 'domain.expired'],
      secret,
    });
  });
});
