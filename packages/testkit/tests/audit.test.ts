import { describe, expect, it } from 'vitest';
import { runAudit } from '../src/audit.js';
import type { Probe } from '../src/types.js';

describe('runAudit', () => {
  it('aggregates a pass + fail + skip correctly', async () => {
    const probes: Probe[] = [
      async () => ({ name: 'dns', pass: true, durationMs: 1, details: {} }),
      async () => ({
        name: 'well-known',
        pass: false,
        durationMs: 2,
        details: {},
        error: { code: 'x', message: 'boom' },
      }),
      async () => ({
        name: 'did-resolution',
        pass: true,
        durationMs: 3,
        details: {},
        skipped: true,
        skipReason: 'nop',
      }),
    ];
    const summary = await runAudit('localhost:4501', 'http://127.0.0.1:4501', { probes });
    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.ok).toBe(false);
  });

  it('derives https://<target> as default baseUrl', async () => {
    const seen: string[] = [];
    const probes: Probe[] = [
      async (ctx) => {
        seen.push(ctx.baseUrl);
        return { name: 'dns', pass: true, durationMs: 0, details: {} };
      },
    ];
    await runAudit('samantha.agent', undefined, { probes });
    expect(seen[0]).toBe('https://samantha.agent');
  });

  it('maps localhost to http://', async () => {
    const seen: string[] = [];
    const probes: Probe[] = [
      async (ctx) => {
        seen.push(ctx.baseUrl);
        return { name: 'dns', pass: true, durationMs: 0, details: {} };
      },
    ];
    await runAudit('localhost:4501', undefined, { probes });
    expect(seen[0]).toBe('http://localhost:4501');
  });
});
