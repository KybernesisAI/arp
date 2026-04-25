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
  | 'cross-connection'
  | 'principal-identity-method'
  | 'no-selfxyz-prompt'
  | 'representation-jwt-signer-binding';

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
  /**
   * Pre-built DoH client. When provided, the `dns` probe uses it directly
   * instead of constructing one from `fetchImpl + dohEndpoint`. Tests inject
   * a stub `{ query() }` to bypass the binary wire-format encoding.
   */
  dohClient?: { query(name: string, type: 'A' | 'AAAA' | 'TXT'): Promise<Array<{ name: string; type: number; TTL: number; data: string }>> };
  /**
   * Extra HTTP headers sent on every HTTP probe. When auditing a
   * cloud-hosted tenant, the `--via cloud --cloud-host <host>` flags
   * set this to `{ 'X-Forwarded-Host': <host> }` so the cloud gateway
   * routes the request to the right agent regardless of the real
   * TCP Host header.
   */
  extraHeaders?: Record<string, string>;
  /**
   * When set, every fetched URL gets a `?target=<value>` query string
   * appended. Used with `--via cloud` because Railway (and many other
   * reverse proxies) overwrite X-Forwarded-Host, breaking host-based
   * tenant routing. Query-string targeting works through any proxy.
   */
  targetQuery?: string;
  /**
   * Owner label for owner-scoped probes (principal-identity-method,
   * representation-jwt-signer-binding). `ian` on `samantha.agent` =>
   * TXT record at `_principal.ian.samantha.agent`, representation JWT
   * at `https://ian.samantha.agent/.well-known/representation.jwt`.
   *
   * If unset, owner-scoped probes skip with reason `no owner label`.
   */
  ownerLabel?: string;
  /**
   * Registrar ARP-setup URL, used by the `no-selfxyz-prompt` probe.
   * Probe is warn-only + optional; if unset or unreachable it skips.
   */
  registrarSetupUrl?: string;
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
