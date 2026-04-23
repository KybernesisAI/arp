#!/usr/bin/env node
/**
 * `arp-testkit` CLI.
 *
 * Subcommands:
 *   audit <domain>                 — full 8-probe audit
 *   probe <name> <domain>          — single probe
 *   compare <a> <b>                — diff capabilities between two agents
 *
 * Global flags:
 *   --json            emit JSON (machine-readable) instead of the human summary
 *   --jsonl           emit JSON Lines (one row per probe + summary)
 *   --verbose         include full probe details for failures
 *   --base <url>      override the baseUrl (useful for local Docker probes)
 *   --timeout <ms>    per-probe timeout
 *   --doh <url>       DoH endpoint for the DNS probe (defaults to hnsdoh.com;
 *                     pass `local:hnsd` to use `127.0.0.1:53`)
 *   --help / -h
 *   --version / -v
 */

import { DEFAULT_PROBE_SUITE, runAudit } from './audit.js';
import { formatHuman, formatJson, formatJsonLines } from './report.js';
import { fetchJson } from './http.js';
import type { AgentCard, ArpJson, DidDocument } from '@kybernesis/arp-spec';
import type { AuditSummary, Probe, ProbeContext, ProbeResult } from './types.js';

interface ParsedArgs {
  command: string | null;
  positional: string[];
  flags: {
    json: boolean;
    jsonl: boolean;
    verbose: boolean;
    help: boolean;
    version: boolean;
    base: string | null;
    timeout: number | null;
    doh: string | null;
    via: string | null;
    cloudHost: string | null;
    tenant: string | null;
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = {
    json: false,
    jsonl: false,
    verbose: false,
    help: false,
    version: false,
    base: null as string | null,
    timeout: null as number | null,
    doh: null as string | null,
    via: null as string | null,
    cloudHost: null as string | null,
    tenant: null as string | null,
  };
  const positional: string[] = [];
  let command: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--version' || a === '-v') flags.version = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--jsonl') flags.jsonl = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a === '--base') flags.base = argv[++i] ?? null;
    else if (a === '--timeout') flags.timeout = Number(argv[++i]);
    else if (a === '--doh') flags.doh = argv[++i] ?? null;
    else if (a === '--via') flags.via = argv[++i] ?? null;
    else if (a === '--cloud-host') flags.cloudHost = argv[++i] ?? null;
    else if (a === '--tenant') flags.tenant = argv[++i] ?? null;
    else if (a.startsWith('--')) {
      // Unknown long flag — swallow with a warning on stderr.
      // eslint-disable-next-line no-console
      console.error(`warning: unknown flag ${a}`);
    } else if (command === null) {
      command = a;
    } else {
      positional.push(a);
    }
  }
  return { command, positional, flags };
}

function usage(): string {
  return `arp-testkit — ARP compliance testkit

USAGE
  arp-testkit audit <domain> [--json] [--jsonl] [--verbose] [--base <url>] [--timeout <ms>] [--doh <url>]
                             [--via cloud [--cloud-host <url>] [--tenant <tenant-id>]]
  arp-testkit probe <name> <domain> [--json] [--base <url>] [--timeout <ms>]
  arp-testkit compare <a> <b> [--json]
  arp-testkit --version | --help

PROBES
  ${DEFAULT_PROBE_SUITE.map((p) => p.key).join(', ')}

EXAMPLES
  arp-testkit audit samantha.agent
  arp-testkit audit localhost:4501 --base http://127.0.0.1:4501
  arp-testkit audit atlas.agent --via cloud
  arp-testkit audit atlas.agent --via cloud --cloud-host https://preview.arp.cloud
  arp-testkit probe dns samantha.agent --doh https://hnsdoh.com/dns-query
  arp-testkit compare samantha.agent ghost.agent --json
`;
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.flags.version) {
    // eslint-disable-next-line no-console
    console.log(readVersion());
    return 0;
  }
  if (args.flags.help || args.command === null) {
    // eslint-disable-next-line no-console
    console.log(usage());
    return args.flags.help ? 0 : 1;
  }

  const contextOverrides: Partial<Omit<ProbeContext, 'target' | 'baseUrl'>> = {};
  if (args.flags.timeout !== null && !Number.isNaN(args.flags.timeout)) {
    contextOverrides.timeoutMs = args.flags.timeout;
  }
  if (args.flags.doh !== null) {
    contextOverrides.dohEndpoint = args.flags.doh;
  }
  // --via cloud: route through the cloud gateway. The gateway uses
  // X-Forwarded-Host to identify the target tenant — which is literally
  // the agent's .agent hostname (the `target`). --cloud-host overrides
  // the gateway URL (default: arp.cloud) so dev/staging environments
  // can aim at a preview deploy.
  if (args.flags.via === 'cloud') {
    const tgt = args.positional[0] ?? args.positional[1] ?? '';
    const headers: Record<string, string> = {};
    if (tgt) headers['x-forwarded-host'] = tgt;
    if (args.flags.tenant) headers['x-arp-cloud-tenant'] = args.flags.tenant;
    contextOverrides.extraHeaders = headers;
  }

  switch (args.command) {
    case 'audit':
      return await audit(args, contextOverrides);
    case 'probe':
      return await probe(args, contextOverrides);
    case 'compare':
      return await compare(args);
    default:
      // eslint-disable-next-line no-console
      console.error(`unknown command: ${args.command}`);
      // eslint-disable-next-line no-console
      console.error(usage());
      return 1;
  }
}

async function audit(
  args: ParsedArgs,
  contextOverrides: Partial<Omit<ProbeContext, 'target' | 'baseUrl'>>,
): Promise<number> {
  const target = args.positional[0];
  if (!target) {
    // eslint-disable-next-line no-console
    console.error('audit requires a target domain');
    return 1;
  }
  // When --via cloud is active, rewrite baseUrl to the cloud host. Probes
  // still target URLs like `<base>/.well-known/*` but requests carry the
  // x-forwarded-host override set above.
  let baseUrl: string | undefined = args.flags.base ?? undefined;
  if (args.flags.via === 'cloud' && !baseUrl) {
    baseUrl = args.flags.cloudHost ?? 'https://arp.cloud';
  }
  const summary = await runAudit(target, baseUrl, { context: contextOverrides });
  emit(summary, args);
  return summary.ok ? 0 : 2;
}

async function probe(
  args: ParsedArgs,
  contextOverrides: Partial<Omit<ProbeContext, 'target' | 'baseUrl'>>,
): Promise<number> {
  const [name, target] = args.positional;
  if (!name || !target) {
    // eslint-disable-next-line no-console
    console.error('probe requires <name> <domain>');
    return 1;
  }
  const entry = DEFAULT_PROBE_SUITE.find((p) => p.key === name);
  if (!entry) {
    // eslint-disable-next-line no-console
    console.error(
      `unknown probe "${name}"; known: ${DEFAULT_PROBE_SUITE.map((p) => p.key).join(', ')}`,
    );
    return 1;
  }
  const ctx: ProbeContext = {
    target,
    baseUrl: args.flags.base ?? defaultBaseUrl(target),
    ...contextOverrides,
  };
  const result = await (entry.probe as Probe)(ctx);
  emitSingle(result, args);
  return result.pass && !result.error ? 0 : 2;
}

async function compare(args: ParsedArgs): Promise<number> {
  const [a, b] = args.positional;
  if (!a || !b) {
    // eslint-disable-next-line no-console
    console.error('compare requires <a> <b>');
    return 1;
  }
  const baseA = defaultBaseUrl(a);
  const baseB = defaultBaseUrl(b);
  const ctxA: ProbeContext = { target: a, baseUrl: baseA };
  const ctxB: ProbeContext = { target: b, baseUrl: baseB };

  const [didA, didB, cardA, cardB, arpA, arpB] = await Promise.all([
    fetchJson(`${baseA}/.well-known/did.json`, ctxA),
    fetchJson(`${baseB}/.well-known/did.json`, ctxB),
    fetchJson(`${baseA}/.well-known/agent-card.json`, ctxA),
    fetchJson(`${baseB}/.well-known/agent-card.json`, ctxB),
    fetchJson(`${baseA}/.well-known/arp.json`, ctxA),
    fetchJson(`${baseB}/.well-known/arp.json`, ctxB),
  ]);

  const capsA = ((arpA.body as ArpJson | null)?.capabilities ?? []) as string[];
  const capsB = ((arpB.body as ArpJson | null)?.capabilities ?? []) as string[];
  const scopesA = ((cardA.body as AgentCard | null)?.supported_scopes ?? []) as string[];
  const scopesB = ((cardB.body as AgentCard | null)?.supported_scopes ?? []) as string[];

  const report = {
    a,
    b,
    agent_cards: { a: cardA.body as unknown, b: cardB.body as unknown },
    did_docs: {
      a: (didA.body as DidDocument | null)?.id ?? null,
      b: (didB.body as DidDocument | null)?.id ?? null,
    },
    arp_json: { a: arpA.body as unknown, b: arpB.body as unknown },
    capability_diff: {
      onlyInA: capsA.filter((c) => !capsB.includes(c)),
      onlyInB: capsB.filter((c) => !capsA.includes(c)),
    },
    scope_diff: {
      onlyInA: scopesA.filter((s) => !scopesB.includes(s)),
      onlyInB: scopesB.filter((s) => !scopesA.includes(s)),
    },
  };

  if (args.flags.json || args.flags.jsonl) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log(humanCompare(report));
  }
  return 0;
}

function humanCompare(r: {
  a: string;
  b: string;
  capability_diff: { onlyInA: string[]; onlyInB: string[] };
  scope_diff: { onlyInA: string[]; onlyInB: string[] };
}): string {
  const lines: string[] = [];
  lines.push(`ARP Compare — ${r.a} vs ${r.b}`);
  lines.push('');
  lines.push(`Capabilities only in ${r.a}:`);
  if (r.capability_diff.onlyInA.length === 0) lines.push('  (none)');
  for (const c of r.capability_diff.onlyInA) lines.push(`  + ${c}`);
  lines.push(`Capabilities only in ${r.b}:`);
  if (r.capability_diff.onlyInB.length === 0) lines.push('  (none)');
  for (const c of r.capability_diff.onlyInB) lines.push(`  + ${c}`);
  lines.push('');
  lines.push(`Scopes only in ${r.a}: ${r.scope_diff.onlyInA.length}`);
  lines.push(`Scopes only in ${r.b}: ${r.scope_diff.onlyInB.length}`);
  return lines.join('\n');
}

function emit(summary: AuditSummary, args: ParsedArgs): void {
  if (args.flags.json) {
    // eslint-disable-next-line no-console
    console.log(formatJson(summary));
  } else if (args.flags.jsonl) {
    // eslint-disable-next-line no-console
    console.log(formatJsonLines(summary));
  } else {
    // eslint-disable-next-line no-console
    console.log(formatHuman(summary));
    if (args.flags.verbose) {
      for (const p of summary.probes) {
        if (!p.pass && !p.skipped) {
          // eslint-disable-next-line no-console
          console.log(`\n--- ${p.name} details ---`);
          // eslint-disable-next-line no-console
          console.log(JSON.stringify(p.details, null, 2));
        }
      }
    }
  }
}

function emitSingle(result: ProbeResult, args: ParsedArgs): void {
  if (args.flags.json || args.flags.jsonl) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
  } else {
    const mark = result.skipped ? '•' : result.pass ? '✓' : '✗';
    // eslint-disable-next-line no-console
    console.log(
      `${mark} ${result.name} (${result.durationMs}ms)${
        result.skipped ? ` — skipped: ${result.skipReason ?? ''}` : ''
      }`,
    );
    if (!result.pass && result.error) {
      // eslint-disable-next-line no-console
      console.log(`  error: ${result.error.message}`);
    }
    if (args.flags.verbose) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result.details, null, 2));
    }
  }
}

function defaultBaseUrl(target: string): string {
  if (/^https?:\/\//i.test(target)) return target;
  if (target.startsWith('localhost') || target.startsWith('127.0.0.1')) {
    return `http://${target}`;
  }
  return `https://${target}`;
}

function readVersion(): string {
  return '0.1.0';
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error((err as Error).stack ?? err);
    process.exitCode = 3;
  });
