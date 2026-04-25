#!/usr/bin/env node
/**
 * arp — single-command CLI for connecting a local agent to ARP Cloud.
 *
 * Auto-detects from the current directory:
 *   1. The handoff JSON (looks for `arp-handoff.json` or `*.arp-handoff.json`)
 *   2. The agent framework (kyberbot if `identity.yaml` exists; falls back
 *      to a generic-http target you wire yourself)
 *
 * Common usage — non-technical-friendly:
 *
 *   cd ~/atlas        # your agent folder
 *   npx @kybernesis/arp
 *
 * No flags. Bridge connects, stays running, relays inbound DIDComm to
 * the local agent. Ctrl-C to stop.
 *
 * Subcommands:
 *
 *   (default)   Same as `connect`. Boots the bridge.
 *   connect     Explicit form of the default — connect the bridge.
 *   doctor      Print what we found in this directory + what we'd
 *               connect with. Doesn't actually open the WS.
 *   version     Print version.
 *   help        Print help.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, isAbsolute, basename } from 'node:path';
import { readdirSync } from 'node:fs';
import {
  startBridge,
  createKyberBotAdapter,
  createGenericHttpAdapter,
  type Adapter,
} from '@kybernesis/arp-cloud-bridge';

const VERSION = '0.1.0';

interface DetectedConfig {
  handoffPath: string;
  framework: 'kyberbot' | 'generic-http';
  agentRoot: string;
  // generic-http only:
  url?: string;
  token?: string;
}

function findHandoff(dir: string): string | null {
  const direct = resolve(dir, 'arp-handoff.json');
  if (existsSync(direct)) return direct;
  // Fallback: any *.arp-handoff.json (like atlas.agent.arp-handoff.json)
  try {
    const entries = readdirSync(dir);
    const matches = entries.filter((f) => f.endsWith('.arp-handoff.json'));
    if (matches.length === 1) return resolve(dir, matches[0]!);
    if (matches.length > 1) {
      console.error(
        `arp: multiple handoff files in ${dir} — pass one explicitly with --handoff:\n  ${matches.join('\n  ')}`,
      );
      process.exit(2);
    }
  } catch {
    /* unreadable dir */
  }
  return null;
}

function detect(cwd: string, flags: { handoff?: string; url?: string; token?: string }): DetectedConfig {
  const handoffPath = flags.handoff
    ? isAbsolute(flags.handoff)
      ? flags.handoff
      : resolve(cwd, flags.handoff)
    : findHandoff(cwd);
  if (!handoffPath) {
    console.error(
      `arp: no handoff file in ${cwd}.\n\n` +
        `Download arp-handoff.json from https://cloud.arp.run/dashboard\n` +
        `(provision your .agent domain, click "Download <domain>.arp-handoff.json")\n` +
        `and save it next to your agent's identity.yaml. Then re-run \`arp\`.`,
    );
    process.exit(1);
  }

  if (flags.url) {
    return {
      handoffPath,
      framework: 'generic-http',
      agentRoot: cwd,
      url: flags.url,
      ...(flags.token ? { token: flags.token } : {}),
    };
  }

  if (existsSync(resolve(cwd, 'identity.yaml'))) {
    return { handoffPath, framework: 'kyberbot', agentRoot: cwd };
  }

  console.error(
    `arp: couldn't auto-detect agent framework in ${cwd}.\n\n` +
      `Supported auto-detect:\n` +
      `  • kyberbot       — looks for identity.yaml in cwd\n` +
      `\n` +
      `For other frameworks, point at your agent's HTTP endpoint:\n` +
      `  arp --url http://127.0.0.1:9090/arp [--token <bearer>]\n`,
  );
  process.exit(1);
}

function buildAdapter(cfg: DetectedConfig): Adapter {
  if (cfg.framework === 'kyberbot') {
    return createKyberBotAdapter({ root: cfg.agentRoot });
  }
  return createGenericHttpAdapter({
    url: cfg.url!,
    ...(cfg.token ? { token: cfg.token } : {}),
  });
}

interface Flags {
  handoff?: string;
  url?: string;
  token?: string;
  cloudWsUrl?: string;
  help?: boolean;
  version?: boolean;
}

function parseArgs(argv: string[]): { cmd: string; flags: Flags } {
  let cmd = 'connect';
  const flags: Flags = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = (): string | undefined => argv[++i];
    switch (a) {
      case '--handoff':
        flags.handoff = next();
        break;
      case '--url':
        flags.url = next();
        break;
      case '--token':
        flags.token = next();
        break;
      case '--cloud-ws-url':
        flags.cloudWsUrl = next();
        break;
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '-v':
      case '--version':
        flags.version = true;
        break;
      default:
        if (a.startsWith('--')) {
          console.error(`unknown flag: ${a}`);
          process.exit(2);
        }
        positional.push(a);
    }
  }
  if (positional[0]) cmd = positional[0];
  return { cmd, flags };
}

const HELP = `arp — connect a local agent to ARP Cloud.

Usage:
  arp [connect]              Connect this folder's agent to the cloud (default).
  arp doctor                 Print what we'd connect, without opening the WS.
  arp version                Print CLI version.
  arp help                   This help.

Auto-detection:
  Reads ${resolve('arp-handoff.json')} (or *.arp-handoff.json) from the cwd.
  Detects KyberBot when identity.yaml is present.

Optional flags (rarely needed):
  --handoff <path>           Override handoff JSON path
  --url <url>                Generic-HTTP target (when not kyberbot)
  --token <token>            Bearer token for the generic-HTTP target
  --cloud-ws-url <ws-url>    Override the gateway WS URL embedded in the handoff
  -h, --help
  -v, --version

Get started:
  1. Open https://cloud.arp.run/dashboard, register a .agent domain,
     click "Provision agent", download the handoff JSON.
  2. Save it next to your agent's identity.yaml (e.g. ~/atlas/arp-handoff.json).
  3. cd into that folder.
  4. Run:  npx @kybernesis/arp
`;

async function cmdConnect(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const cfg = detect(cwd, flags);
  const adapter = buildAdapter(cfg);

  console.log(`arp · framework=${cfg.framework} · cwd=${cwd}`);
  const bridge = await startBridge({
    handoffPath: cfg.handoffPath,
    adapter,
    ...(flags.cloudWsUrl ? { cloudWsUrl: flags.cloudWsUrl } : {}),
  });
  console.log('─────────────────────────────────────────────');
  console.log(`agent did:   ${bridge.agentDid}`);
  console.log(`gateway:     ${bridge.gatewayWsUrl}`);
  console.log(`adapter:     ${bridge.adapterName}`);
  console.log(`handoff:     ${cfg.handoffPath}`);
  console.log('─────────────────────────────────────────────');
  console.log(`Connected. Ctrl-C to stop.`);

  const shutdown = async (sig: string) => {
    console.log(`\n${sig} received, shutting down`);
    await bridge.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

async function cmdDoctor(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const cfg = detect(cwd, flags);
  let agentDid = '<unknown>';
  let gatewayWsUrl = '<unknown>';
  try {
    const bundle = JSON.parse(readFileSync(cfg.handoffPath, 'utf-8'));
    agentDid = bundle.agent_did ?? agentDid;
    gatewayWsUrl = bundle.gateway_ws_url ?? gatewayWsUrl;
  } catch (err) {
    console.error(`could not parse handoff: ${(err as Error).message}`);
    process.exit(2);
  }
  console.log('arp doctor — what we\'d connect:');
  console.log(`  cwd:           ${cwd}`);
  console.log(`  handoff:       ${cfg.handoffPath} (${basename(cfg.handoffPath)})`);
  console.log(`  framework:     ${cfg.framework}`);
  console.log(`  agent root:    ${cfg.agentRoot}`);
  console.log(`  agent did:     ${agentDid}`);
  console.log(`  gateway ws:    ${gatewayWsUrl}`);
  if (cfg.framework === 'generic-http') {
    console.log(`  generic url:   ${cfg.url}`);
    console.log(`  generic token: ${cfg.token ? '<set>' : '<not set>'}`);
  }
  console.log(`\nLooks good? Run \`arp\` (no args) to actually connect.`);
}

async function main(): Promise<void> {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || cmd === 'help') {
    process.stdout.write(HELP);
    return;
  }
  if (flags.version || cmd === 'version') {
    console.log(`@kybernesis/arp ${VERSION}`);
    return;
  }
  if (cmd === 'connect' || cmd === 'run') {
    await cmdConnect(flags);
    return;
  }
  if (cmd === 'doctor') {
    await cmdDoctor(flags);
    return;
  }
  console.error(`unknown command: ${cmd}\n`);
  process.stdout.write(HELP);
  process.exit(2);
}

main().catch((err) => {
  console.error(`arp: fatal: ${(err as Error).message}`);
  process.exit(1);
});
