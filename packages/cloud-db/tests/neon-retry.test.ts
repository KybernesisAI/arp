import { describe, expect, it } from 'vitest';
import { isConnectFailure, retryingFetch } from '../src/neon';

const connectTimeout = () => {
  const agg = Object.assign(new AggregateError([Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })], ''), { code: 'ETIMEDOUT' });
  return Object.assign(new TypeError('fetch failed'), { cause: agg });
};
const reset = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });

describe('neon fetch retry (connect-phase only)', () => {
  it('classifies connect failures', () => {
    expect(isConnectFailure(connectTimeout())).toBe(true);
    expect(isConnectFailure(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }))).toBe(true);
    expect(isConnectFailure(reset())).toBe(false);
    expect(isConnectFailure(new Error('boom'))).toBe(false);
    expect(isConnectFailure(null)).toBe(false);
  });

  it('retries a connect timeout, then succeeds', async () => {
    let calls = 0;
    const waits: number[] = [];
    const f = retryingFetch((async () => { calls++; if (calls < 3) throw connectTimeout(); return new Response('ok'); }) as unknown as typeof fetch, { sleep: async (ms) => { waits.push(ms); } });
    const res = await f('https://db.example/sql', { method: 'POST' });
    expect(await res.text()).toBe('ok');
    expect(calls).toBe(3);
    expect(waits).toEqual([300, 900]);
  });

  it('gives up after the last attempt', async () => {
    let calls = 0;
    const f = retryingFetch((async () => { calls++; throw connectTimeout(); }) as unknown as typeof fetch, { sleep: async () => {} });
    await expect(f('https://db.example/sql')).rejects.toThrow('fetch failed');
    expect(calls).toBe(3);
  });

  it('never retries once the request may have been sent', async () => {
    let calls = 0;
    const f = retryingFetch((async () => { calls++; throw reset(); }) as unknown as typeof fetch, { sleep: async () => {} });
    await expect(f('https://db.example/sql', { method: 'POST' })).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
