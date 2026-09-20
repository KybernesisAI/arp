import { describe, expect, it } from 'vitest';
import { agentLiveness } from '../lib/agent-liveness';

const fetchOk = (async () => new Response('{"ok":true}', { status: 200 })) as typeof fetch;
const fetchDown = (async () => { throw new Error('ECONNREFUSED'); }) as typeof fetch;
const fetch500 = (async () => new Response('x', { status: 500 })) as typeof fetch;
const NOW = 1_800_000_000_000;

describe('agentLiveness', () => {
  it('no runtime → identity only, without probing', async () => {
    let probed = false;
    const f = (async () => { probed = true; return new Response('ok'); }) as typeof fetch;
    expect(await agentLiveness({ runtimeKind: 'none' }, { fetchImpl: f })).toBe('identity_only');
    expect(probed).toBe(false);
  });

  it('a fresh last-seen stamp is online for any runtime kind, without probing', async () => {
    expect(await agentLiveness({ runtimeKind: 'push', pushKind: 'eve', pushUrl: 'https://a.example', lastSeenAt: new Date(NOW - 60_000) }, { fetchImpl: fetchDown, now: NOW })).toBe('online');
    expect(await agentLiveness({ runtimeKind: 'bridge', lastSeenAt: new Date(NOW - 60_000) }, { fetchImpl: fetchDown, now: NOW })).toBe('online');
  });

  it('a stale bridge agent is offline (no endpoint to ask)', async () => {
    expect(await agentLiveness({ runtimeKind: 'bridge', lastSeenAt: new Date(NOW - 3_600_000) }, { fetchImpl: fetchOk, now: NOW })).toBe('offline');
  });

  it('a stale or never-seen push agent is asked directly', async () => {
    const calls: string[] = [];
    const f = (async (input: RequestInfo | URL) => { calls.push(String(input)); return new Response('{"ok":true}', { status: 200 }); }) as typeof fetch;
    expect(await agentLiveness({ runtimeKind: 'push', pushKind: 'eve', pushUrl: 'https://kyber.example/', lastSeenAt: null }, { fetchImpl: f, now: NOW })).toBe('online');
    expect(calls).toEqual(['https://kyber.example/eve/v1/arp/health']);
    expect(await agentLiveness({ runtimeKind: 'push', pushKind: 'generic', pushUrl: 'https://g.example', lastSeenAt: new Date(NOW - 3_600_000) }, { fetchImpl: f, now: NOW })).toBe('online');
    expect(calls[1]).toBe('https://g.example/.well-known/agentid-verification');
  });

  it('a push agent that does not answer is offline', async () => {
    expect(await agentLiveness({ runtimeKind: 'push', pushKind: 'eve', pushUrl: 'https://a.example', lastSeenAt: null }, { fetchImpl: fetchDown, now: NOW })).toBe('offline');
    expect(await agentLiveness({ runtimeKind: 'push', pushKind: 'eve', pushUrl: 'https://a.example', lastSeenAt: null }, { fetchImpl: fetch500, now: NOW })).toBe('offline');
  });
});
