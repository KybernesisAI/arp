/**
 * @kybernesis/arp-testkit — ARP compliance testkit.
 *
 * Public API:
 *   - `runAudit(target)`                       → programmatic audit
 *   - individual probes from `./probes/*`      → scripted use + integration tests
 *   - `formatHuman` / `formatJson` reporters
 *
 * CLI entry point: `arp-testkit` (see `./cli.ts`).
 */

export { runAudit, DEFAULT_PROBE_SUITE, type AuditOptions } from './audit.js';
export { fetchJson, postJson } from './http.js';
export {
  formatHuman,
  formatJson,
  formatJsonLines,
  formatHumanLine,
  type CompareReport,
} from './report.js';
export * from './probes/index.js';
export type {
  AuditSummary,
  Probe,
  ProbeContext,
  ProbeName,
  ProbeResult,
} from './types.js';
