import { a2aCardProbe } from './probes/a2a-card.js';
import type { AuditSummary, Probe, ProbeContext, ProbeResult } from './types.js';
import {
  crossConnectionProbe,
  didCommProbe,
  didResolutionProbe,
  dnsProbe,
  noSelfxyzPromptProbe,
  pairingProbe,
  principalIdentityMethodProbe,
  representationJwtSignerBindingProbe,
  revocationProbe,
  tlsFingerprintProbe,
  wellKnownProbe,
} from './probes/index.js';

/**
 * Default suite of 11 probes run by `arp-testkit audit <domain>`. Order is
 * stable so reports line up run-to-run and the most foundational checks
 * (DNS → well-known → DID → TLS) fail early if the wiring is off. Phase 9
 * added the v2.1 trio: principal-identity-method, no-selfxyz-prompt (warn-
 * only), representation-jwt-signer-binding.
 */
/** Probes that only make sense against a Handshake-resolved apex. */
const HNS_DEPENDENT_PROBES = new Set(['dns', 'did-resolution', 'tls-fingerprint', 'principal-identity-method', 'representation-jwt-signer-binding']);

export const DEFAULT_PROBE_SUITE: ReadonlyArray<{ key: string; probe: Probe }> = [
  { key: 'dns', probe: dnsProbe },
  { key: 'well-known', probe: wellKnownProbe },
  { key: 'did-resolution', probe: didResolutionProbe },
  { key: 'tls-fingerprint', probe: tlsFingerprintProbe },
  { key: 'didcomm-probe', probe: didCommProbe },
  { key: 'pairing-probe', probe: pairingProbe },
  { key: 'revocation', probe: revocationProbe },
  { key: 'cross-connection', probe: crossConnectionProbe },
  { key: 'principal-identity-method', probe: principalIdentityMethodProbe },
  { key: 'no-selfxyz-prompt', probe: noSelfxyzPromptProbe },
  { key: 'representation-jwt-signer-binding', probe: representationJwtSignerBindingProbe },
  { key: 'a2a-card', probe: a2aCardProbe },
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
    // AgentID S5: auditing the ICANN mirror — HNS-dependent probes (DNS TXT
    // records, DoH DID resolution, DID-pinned TLS) have nothing to check on
    // an ICANN host and public HNS resolvers are unreliable; skip them
    // explicitly rather than failing on infrastructure that isn't in play.
    if (ctx.resolver === 'mirror') {
      const key = DEFAULT_PROBE_SUITE.find((x) => x.probe === probe)?.key;
      if (key && HNS_DEPENDENT_PROBES.has(key)) {
        results.push({
          name: key as ProbeResult['name'],
          pass: true,
          skipped: true,
          skipReason: 'resolver=mirror: probe depends on HNS DNS',
          durationMs: 0,
          details: {},
        });
        continue;
      }
    }
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
