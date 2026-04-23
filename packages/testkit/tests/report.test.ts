import { describe, expect, it } from 'vitest';
import {
  formatHuman,
  formatJson,
  formatJsonLines,
  formatHumanLine,
} from '../src/report.js';
import type { AuditSummary } from '../src/types.js';

const summary: AuditSummary = {
  target: 'samantha.agent',
  baseUrl: 'https://samantha.agent',
  startedAt: '2026-04-23T00:00:00Z',
  finishedAt: '2026-04-23T00:00:11Z',
  totalDurationMs: 10800,
  total: 3,
  passed: 2,
  failed: 1,
  skipped: 0,
  ok: false,
  probes: [
    { name: 'dns', pass: true, durationMs: 312, details: {} },
    {
      name: 'well-known',
      pass: false,
      durationMs: 421,
      details: { failures: ['agent-card.json: not json'] },
      error: { code: 'well_known_invalid', message: 'agent-card.json: not json' },
    },
    { name: 'did-resolution', pass: true, durationMs: 189, details: {} },
  ],
};

describe('reporters', () => {
  it('human reporter shows marker + name + duration and lists failures', () => {
    const text = formatHuman(summary);
    expect(text).toContain('✓ dns');
    expect(text).toContain('✗ well-known');
    expect(text).toContain('2/3 passed');
    expect(text).toContain('Failures:');
    expect(text).toContain('agent-card.json: not json');
  });

  it('formatHumanLine shows skipped reason', () => {
    const line = formatHumanLine({
      name: 'cross-connection',
      pass: true,
      durationMs: 0,
      details: {},
      skipped: true,
      skipReason: 'needs driver',
    });
    expect(line).toContain('•');
    expect(line).toContain('(skipped: needs driver)');
  });

  it('JSON reporter emits a stable shape', () => {
    const parsed = JSON.parse(formatJson(summary));
    expect(parsed.target).toBe('samantha.agent');
    expect(Array.isArray(parsed.probes)).toBe(true);
  });

  it('JSON Lines reporter emits one row per probe + summary', () => {
    const rows = formatJsonLines(summary).split('\n');
    expect(rows).toHaveLength(summary.probes.length + 1);
    const last = JSON.parse(rows[rows.length - 1]!);
    expect(last.kind).toBe('summary');
    expect(last.total).toBe(3);
  });
});
