/**
 * Shared types for testkit probes.
 *
 * Every probe is an async function returning a `ProbeResult`. Probes are
 * categorised in the audit summary by `category`; `pass` is the single source
 * of truth for whether this check should hold up a release.
 *
 * `details` is the structured machine-readable payload (shown as JSON in
 * `--json` mode and summarised in the human reporter). `error` captures the
 * first fatal failure; non-fatal issues go into `details.warnings`.
 */

export type ProbeName =
  | 'dns'
  | 'well-known'
  | 'did-resolution'
  | 'tls-fingerprint'
  | 'didcomm-probe'
  | 'pairing-probe'
  | 'revocation'
  | 'cross-connection';

export interface ProbeResult {
  name: ProbeName;
  pass: boolean;
  durationMs: number;
  /** Structured payload; `warnings` is the canonical non-fatal channel. */
  details: Record<string, unknown> & { warnings?: string[] };
  /** First fatal error, if any. */
  error?: { code: string; message: string };
  /** Skipped probes (e.g. nightly with no target domain) set this flag. */
  skipped?: boolean;
  skipReason?: string;
}

export interface ProbeContext {
  /** Target domain, e.g. `samantha.agent` or `localhost:4501`. */
  target: string;
  /**
   * Base URL of the agent under test. Defaults to
   * `https://<target>`; tests can override to `http://127.0.0.1:<port>`.
   */
  baseUrl: string;
  /** Per-probe timeout in ms. Default 10000. */
  timeoutMs?: number;
  /** Injected fetch (tests). Defaults to global. */
  fetchImpl?: typeof fetch;
  /** DNS DoH endpoint for the `dns` probe. Defaults to hnsdoh.com. */
  dohEndpoint?: string;
}

export type Probe = (ctx: ProbeContext) => Promise<ProbeResult>;

export interface AuditSummary {
  target: string;
  baseUrl: string;
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  probes: ProbeResult[];
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  ok: boolean;
}
