import { verifyAuditChain } from '@kybernesis/arp-audit';
import { loadBinConfig } from './config.js';
import { startRuntime } from './start.js';

const [, , cmd, ...rest] = process.argv;

async function main() {
  switch (cmd) {
    case undefined:
    case '--help':
    case '-h':
    case 'help': {
      printUsage();
      return;
    }
    case 'start': {
      const handoffPath = takeValue(rest, ['--handoff', '-f']);
      if (!handoffPath) {
        printUsage();
        process.exit(2);
      }
      const portStr = takeValue(rest, ['--port', '-p']);
      const port = portStr ? Number(portStr) : undefined;
      const hostname = takeValue(rest, ['--host']);
      const dataDir = takeValue(rest, ['--data-dir']);
      const cfg = loadBinConfig({
        handoffPath,
        ...(port !== undefined ? { port } : {}),
        ...(hostname ? { hostname } : {}),
        ...(dataDir ? { dataDir } : {}),
      });
      const { runtime, info } = await startRuntime(cfg);
      process.stdout.write(
        `arp-runtime listening on http://${info.hostname}:${info.port}/\n`,
      );
      process.stdout.write(`  DID: ${cfg.handoff.agent_did}\n`);
      process.stdout.write(`  data: ${cfg.dataDir}\n`);
      registerSignals(async () => {
        await runtime.stop();
      });
      return;
    }
    case 'status': {
      const portStr = takeValue(rest, ['--port', '-p']);
      const port = portStr ? Number(portStr) : 4401;
      const host = takeValue(rest, ['--host']) ?? '127.0.0.1';
      const res = await fetch(`http://${host}:${port}/health`);
      if (!res.ok) {
        process.stderr.write(`unhealthy: HTTP ${res.status}\n`);
        process.exit(1);
      }
      const body = await res.text();
      process.stdout.write(body + '\n');
      return;
    }
    case 'audit': {
      const [sub, ...subRest] = rest;
      if (sub !== 'verify') {
        printUsage();
        process.exit(2);
      }
      const connectionId = subRest[0];
      if (!connectionId) {
        process.stderr.write('usage: arp-runtime audit verify <connection_id>\n');
        process.exit(2);
      }
      const dataDir =
        takeValue(subRest, ['--data-dir']) ?? process.env.ARP_DATA_DIR ?? process.cwd();
      const { join } = await import('node:path');
      const auditPath = join(dataDir, 'audit', `${connectionId}.jsonl`);
      const result = verifyAuditChain(auditPath);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(result.valid ? 0 : 1);
      return;
    }
    default: {
      process.stderr.write(`unknown command: ${cmd}\n`);
      printUsage();
      process.exit(2);
    }
  }
}

function printUsage() {
  const text = `
arp-runtime — reference ARP agent binary (Phase 2)

Usage:
  arp-runtime start --handoff <path> [--port 4401] [--host 127.0.0.1] [--data-dir <path>]
  arp-runtime status [--port 4401] [--host 127.0.0.1]
  arp-runtime audit verify <connection_id> [--data-dir <path>]

Environment:
  ARP_DATA_DIR            Per-agent data directory (defaults alongside the handoff)
  ARP_KEYSTORE_PATH       Raw 32-byte Ed25519 key file (default <data>/agent.key)
  ARP_CEDAR_SCHEMA_PATH   Override the Cedar schema (defaults to @kybernesis/arp-spec)
  ARP_PORT                HTTP port (default 4401)
  ARP_HOST                HTTP host (default 127.0.0.1)
  ARP_SCOPE_CATALOG_VERSION  Scope catalog pin (default v1)
  ARP_AGENT_NAME          Agent card "name" (default derived from DID)
  ARP_AGENT_DESCRIPTION   Agent card "description" (default "Personal agent")
  ARP_REVOCATIONS_PROXY_URL  If set, /.well-known/revocations.json is proxied
  ARP_TLS_FINGERPRINT     Pre-computed TLS fingerprint (hex, no prefix)
`.trim();
  process.stdout.write(text + '\n');
}

function takeValue(argv: string[], flags: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (flags.includes(a) && i + 1 < argv.length) {
      return argv[i + 1];
    }
    for (const f of flags) {
      const prefix = `${f}=`;
      if (a.startsWith(prefix)) return a.slice(prefix.length);
    }
  }
  return undefined;
}

function registerSignals(onStop: () => Promise<void>) {
  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(`received ${signal}, shutting down…\n`);
    try {
      await onStop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));
}

main().catch((err) => {
  process.stderr.write(`fatal: ${(err as Error).stack ?? String(err)}\n`);
  process.exit(1);
});
