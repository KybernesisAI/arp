import type { AuditSummary, ProbeResult } from './types.js';

/**
 * Convert a ProbeResult to a single status + duration line for the human
 * reporter.
 */
export function formatHumanLine(result: ProbeResult): string {
  const marker = result.skipped ? '•' : result.pass ? '✓' : '✗';
  const name = result.name.padEnd(26, ' ');
  const dur = formatDuration(result.durationMs);
  const suffix = result.skipped
    ? ` (skipped: ${result.skipReason ?? 'no reason'})`
    : '';
  return `  ${marker} ${name} (${dur})${suffix}`;
}

export function formatHuman(summary: AuditSummary): string {
  const lines: string[] = [];
  lines.push(`ARP Compliance Audit — ${summary.target}`);
  lines.push('='.repeat(Math.min(80, `ARP Compliance Audit — ${summary.target}`.length)));
  lines.push('');
  for (const r of summary.probes) {
    lines.push(formatHumanLine(r));
  }
  lines.push('');
  const counts = [
    `${summary.passed}/${summary.total - summary.skipped} passed`,
    summary.skipped > 0 ? `${summary.skipped} skipped` : null,
    summary.failed > 0 ? `${summary.failed} failed` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  lines.push(`  ${counts} · ${formatDuration(summary.totalDurationMs)} total`);
  if (summary.failed > 0) {
    lines.push('');
    lines.push('Failures:');
    for (const r of summary.probes) {
      if (r.pass) continue;
      const detail = r.error?.message ?? JSON.stringify(r.details);
      lines.push(`  - ${r.name}: ${detail}`);
    }
  }
  return lines.join('\n');
}

export function formatJson(summary: AuditSummary): string {
  return JSON.stringify(summary, null, 2);
}

export function formatJsonLines(summary: AuditSummary): string {
  const rows = summary.probes.map((p) => JSON.stringify(p));
  rows.push(
    JSON.stringify({
      kind: 'summary',
      target: summary.target,
      baseUrl: summary.baseUrl,
      startedAt: summary.startedAt,
      finishedAt: summary.finishedAt,
      totalDurationMs: summary.totalDurationMs,
      passed: summary.passed,
      failed: summary.failed,
      skipped: summary.skipped,
      total: summary.total,
      ok: summary.ok,
    }),
  );
  return rows.join('\n');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export interface CompareReport {
  a: string;
  b: string;
  agentCards: { a: unknown; b: unknown };
  didDocs: { a: unknown; b: unknown };
  arpJson: { a: unknown; b: unknown };
  capabilityDiff: {
    onlyInA: string[];
    onlyInB: string[];
  };
  scopeDiff: {
    onlyInA: string[];
    onlyInB: string[];
  };
}
