import type { AuditSummary, Probe, ProbeContext, ProbeResult } from './types.js';
import {
  crossConnectionProbe,
  didCommProbe,
  didResolutionProbe,
  dnsProbe,
  pairingProbe,
  revocationProbe,
  tlsFingerprintProbe,
  wellKnownProbe,
} from './probes/index.js';

/**
 * Default suite of 8 probes run by `arp-testkit audit <domain>`. Order is
 * stable so reports line up run-to-run and the most foundational checks
 * (DNS → well-known → DID → TLS) fail early if the wiring is off.
 */
export const DEFAULT_PROBE_SUITE: ReadonlyArray<{ key: string; probe: Probe }> = [
  { key: 'dns', probe: dnsProbe },
  { key: 'well-known', probe: wellKnownProbe },
  { key: 'did-resolution', probe: didResolutionProbe },
  { key: 'tls-fingerprint', probe: tlsFingerprintProbe },
  { key: 'didcomm-probe', probe: didCommProbe },
  { key: 'pairing-probe', probe: pairingProbe },
  { key: 'revocation', probe: revocationProbe },
  { key: 'cross-connection', probe: crossConnectionProbe },
];

export interface AuditOptions {
  /** Override the probe suite. Defaults to `DEFAULT_PROBE_SUITE`. */
  probes?: ReadonlyArray<Probe>;
  /** Inject ProbeContext values (timeoutMs, fetchImpl, dohEndpoint, …). */
  context?: Partial<Omit<ProbeContext, 'target' | 'baseUrl'>>;
}

/**
 * Run the audit suite against a target. Probes run sequentially for clean
 * report ordering (v0 decision — phase doc §8).
 */
export async function runAudit(
  target: string,
  baseUrl?: string,
  opts: AuditOptions = {},
): Promise<AuditSummary> {
  const resolvedBase = baseUrl ?? defaultBaseUrl(target);
  const ctx: ProbeContext = {
    target,
    baseUrl: resolvedBase,
    ...opts.context,
  };
  const suite = opts.probes ?? DEFAULT_PROBE_SUITE.map((x) => x.probe);
  const startedAt = new Date();
  const results: ProbeResult[] = [];
  const suiteStart = Date.now();
  for (const probe of suite) {
    const r = await probe(ctx);
    results.push(r);
  }
  const finishedAt = new Date();

  const passed = results.filter((r) => r.pass && !r.skipped).length;
  const failed = results.filter((r) => !r.pass).length;
  const skipped = results.filter((r) => r.skipped).length;

  return {
    target,
    baseUrl: resolvedBase,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    totalDurationMs: Date.now() - suiteStart,
    probes: results,
    passed,
    failed,
    skipped,
    total: results.length,
    ok: failed === 0,
  };
}

function defaultBaseUrl(target: string): string {
  if (/^https?:\/\//i.test(target)) return target;
  if (target.startsWith('localhost') || target.startsWith('127.0.0.1')) {
    return `http://${target}`;
  }
  return `https://${target}`;
}
