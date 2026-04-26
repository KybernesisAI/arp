#!/usr/bin/env node
/**
 * arp — single-command CLI for connecting a local agent to ARP Cloud.
 *
 * Detection precedence (in order, first match wins):
 *   1. `arp.json` in the cwd          — authoritative manifest
 *   2. `identity.yaml` in the cwd     — legacy: assume framework=kyberbot
 *   3. otherwise                      — error, suggest `arpc init`
 *
 * Common usage — non-technical-friendly:
 *
 *   cd ~/atlas
 *   npx @kybernesis/arp                # connects (default subcommand)
 *
 * If detection fails:
 *
 *   npx @kybernesis/arp init           # creates arp.json interactively
 *   npx @kybernesis/arp                # then connect
 *
 * Subcommands:
 *
 *   (default)   Same as `connect`. Boots the bridge.
 *   connect     Explicit form — connect the bridge.
 *   init        Create / overwrite arp.json in this folder.
 *   doctor      Print what we'd connect, without opening the WS.
 *   version     Print version.
 *   help        Print help.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, isAbsolute, basename, dirname } from 'node:path';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import {
  startBridge,
  createKyberBotAdapter,
  createGenericHttpAdapter,
  type Adapter,
} from '@kybernesis/arp-cloud-bridge';
import {
  readManifest,
  serializeManifest,
  manifestPath,
  type ArpManifest,
  type Framework,
} from './manifest.js';
import * as host from './host.js';
import * as service from './service.js';
import * as send from './send.js';
import * as skill from './skill.js';

// Read version from the published package.json so `arpc version` always
// matches `npm view @kybernesis/arp version`. Walks up from the dist
// directory (cli.js → ../package.json) and falls back to a literal
// when the file is unreachable so a misconfigured install never throws
// just for printing the version.
const VERSION: string = (() => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dist/cli.js → ../package.json. Walk up at most 3 levels in case
    // the bundle layout changes in the future.
    for (let i = 0; i < 3; i++) {
      const candidate = resolve(here, '../'.repeat(i + 1), 'package.json');
      if (existsSync(candidate)) {
        const json = JSON.parse(readFileSync(candidate, 'utf-8')) as { name?: string; version?: string };
        if (json.name === '@kybernesis/arp' && typeof json.version === 'string') {
          return json.version;
        }
      }
    }
  } catch {
    /* fall through */
  }
  return '0.0.0-unknown';
})();

interface ResolvedConfig {
  handoffPath: string;
  framework: Framework;
  agentRoot: string;
  // generic-http only
  url?: string;
  token?: string;
  source: 'manifest' | 'auto-detect';
}

function findHandoff(dir: string): string | null {
  const direct = resolve(dir, 'arp-handoff.json');
  if (existsSync(direct)) return direct;
  try {
    const entries = readdirSync(dir);
    const matches = entries.filter((f) => f.endsWith('.arp-handoff.json'));
    if (matches.length === 1) return resolve(dir, matches[0]!);
    if (matches.length > 1) {
      console.error(
        `arpc: multiple handoff files in ${dir} — set "handoff" in arp.json or pass --handoff:\n  ${matches.join('\n  ')}`,
      );
      process.exit(2);
    }
  } catch {
    /* unreadable */
  }
  return null;
}

function resolvePath(dir: string, p: string): string {
  return isAbsolute(p) ? p : resolve(dir, p);
}

function resolveFromManifest(cwd: string, m: ArpManifest, flagHandoff?: string): ResolvedConfig {
  const handoffPath = flagHandoff
    ? resolvePath(cwd, flagHandoff)
    : m.handoff
      ? resolvePath(cwd, m.handoff)
      : findHandoff(cwd);
  if (!handoffPath) {
    console.error(
      `arpc: arp.json found but no handoff JSON. Set "handoff" in arp.json, ` +
        `or place arp-handoff.json next to it.`,
    );
    process.exit(1);
  }

  const cfg: ResolvedConfig = {
    handoffPath,
    framework: m.framework,
    agentRoot: m.kyberbot?.root ? resolvePath(cwd, m.kyberbot.root) : cwd,
    source: 'manifest',
  };
  if (m.framework === 'generic-http') {
    if (!m['generic-http']) {
      console.error(`arpc: framework="generic-http" requires a "generic-http" block in arp.json`);
      process.exit(1);
    }
    cfg.url = m['generic-http'].url;
    if (m['generic-http'].token) cfg.token = m['generic-http'].token;
  }
  if (m.framework === 'openclaw' || m.framework === 'hermes') {
    console.error(
      `arpc: framework="${m.framework}" — adapter not yet implemented. Use framework="generic-http" for now.`,
    );
    process.exit(1);
  }
  return cfg;
}

function resolveFromAutoDetect(cwd: string, flags: Flags): ResolvedConfig {
  const handoffPath = flags.handoff ? resolvePath(cwd, flags.handoff) : findHandoff(cwd);
  if (!handoffPath) {
    console.error(
      `arpc: no handoff file in ${cwd}.\n\n` +
        `Either:\n` +
        `  • Download arp-handoff.json from https://cloud.arp.run/dashboard\n` +
        `    (provision your .agent domain → "Download <domain>.arp-handoff.json")\n` +
        `  • Or run \`arpc init\` in this folder to declare the framework + handoff path.`,
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
      source: 'auto-detect',
    };
  }

  if (existsSync(resolve(cwd, 'identity.yaml'))) {
    return { handoffPath, framework: 'kyberbot', agentRoot: cwd, source: 'auto-detect' };
  }

  console.error(
    `arpc: couldn't auto-detect agent framework in ${cwd}.\n\n` +
      `Run \`arpc init\` to declare the framework explicitly, or pass:\n` +
      `  arp --url http://127.0.0.1:9090/arp [--token <bearer>]\n`,
  );
  process.exit(1);
}

function resolveConfig(cwd: string, flags: Flags): ResolvedConfig {
  const m = (() => {
    try {
      return readManifest(cwd);
    } catch (err) {
      console.error(`arpc: ${(err as Error).message}`);
      process.exit(1);
    }
  })();
  if (m) return resolveFromManifest(cwd, m, flags.handoff);
  return resolveFromAutoDetect(cwd, flags);
}

function buildAdapter(cfg: ResolvedConfig): Adapter {
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
  framework?: Framework;
  yes?: boolean;
  internalSupervisor?: boolean;
  help?: boolean;
  version?: boolean;
  // arpc send
  async?: boolean;
  timeoutSec?: number;
  connectionId?: string;
  as?: string;
  // arpc skill install
  target?: string;
}

function parseArgs(argv: string[]): { cmd: string; sub: string | null; positional: string[]; flags: Flags } {
  let cmd = 'connect';
  let sub: string | null = null;
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
      case '--framework':
        flags.framework = next() as Framework;
        break;
      case '--yes':
      case '-y':
        flags.yes = true;
        break;
      case '--internal-supervisor':
        flags.internalSupervisor = true;
        break;
      case '--async':
        flags.async = true;
        break;
      case '--timeout':
        flags.timeoutSec = Number(next() ?? '30');
        break;
      case '--connection':
        flags.connectionId = next();
        break;
      case '--as':
        flags.as = next();
        break;
      case '--target':
        flags.target = next();
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
  if (positional[0]) cmd = positional[0]!;
  if (
    (cmd === 'host' || cmd === 'service' || cmd === 'contacts' || cmd === 'skill') &&
    positional[1]
  ) {
    sub = positional[1]!;
  }
  return { cmd, sub, positional, flags };
}

const HELP = `arpc — connect local agents to ARP Cloud.

One agent — single-shot:
  arpc [connect]             Connect this folder's agent (default).
  arpc init [--yes]          Create arp.json in this folder. Auto-detects
                             sensible defaults; --yes skips prompts.
  arpc doctor                Show what would connect, without doing it.

Many agents — supervisor (one process for all, daemonised):
  arpc host                  Foreground supervisor — runs every agent
                             listed in ~/.arp/host.yaml. Ctrl-C to stop.
  arpc host start            Daemonise the supervisor. Logs to ~/.arp/host.log.
  arpc host stop             Stop the daemon.
  arpc host status           Daemon state + configured agents.
  arpc host list             Print the agent list.
  arpc host add <folder>     Add an agent folder to host.yaml.
  arpc host remove <folder>  Remove an agent folder.

Send a message (uses the running supervisor):
  arpc send <name|did> "<text>"   Send to a contact (or did:web: directly).
                                   By default waits up to 30s for a reply.
  arpc contacts list               Show this agent's address book.
  arpc contacts add <name> <did>   Add a contact entry.
  arpc contacts remove <name>      Remove a contact entry.

Skills (drop a SKILL.md template into the agent folder):
  arpc skill list                  Show available skills.
  arpc skill install <name>        Drop a SKILL.md into the right place.
                                   --target kyberbot              (default)
                                   --target claude-code           (project)
                                   --target claude-code-global    (user-wide)

Auto-start at login (macOS launchd):
  arpc service install       Run the supervisor automatically on every login.
                             Survives reboots. Logs go to ~/.arp/host.log.
  arpc service uninstall     Stop auto-starting (does not affect a running daemon).
  arpc service status        Whether launchd has the agent loaded.

Misc:
  arpc version
  arpc help

Detection (single-agent mode reads cwd; supervisor reads each folder):
  1. arp.json                — authoritative manifest. Run \`arpc init\`.
  2. identity.yaml           — legacy: assumes framework=kyberbot.
  3. otherwise               — error, suggests \`arpc init\`.

Optional flags (rarely needed; arp.json is the right place for these):
  --handoff <path>           Override handoff JSON path
  --url <url>                Generic-HTTP target (when not kyberbot)
  --token <token>            Bearer token for the generic-HTTP target
  --cloud-ws-url <ws-url>    Override the gateway WS URL embedded in the handoff
  --framework <name>         For \`arpc init\`: skip the prompt
  -h, --help
  -v, --version

Get started:
  Single agent (daemon — recommended even for one):
    arpc host add ~/atlas
    arpc host start

  Single agent (foreground):
    cd ~/atlas
    arpc

  Multiple agents:
    arpc host add ~/atlas
    arpc host add ~/nova
    arpc host add ~/samantha
    arpc host start
`;

// ---- subcommands -----------------------------------------------------------

async function cmdConnect(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const cfg = resolveConfig(cwd, flags);
  const adapter = buildAdapter(cfg);

  console.log(`arpc · framework=${cfg.framework} · source=${cfg.source} · cwd=${cwd}`);
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
  const cfg = resolveConfig(cwd, flags);
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
  console.log(`arpc doctor — what we'd connect:`);
  console.log(`  cwd:           ${cwd}`);
  console.log(`  detection:     ${cfg.source}`);
  console.log(`  handoff:       ${cfg.handoffPath} (${basename(cfg.handoffPath)})`);
  console.log(`  framework:     ${cfg.framework}`);
  console.log(`  agent root:    ${cfg.agentRoot}`);
  console.log(`  agent did:     ${agentDid}`);
  console.log(`  gateway ws:    ${gatewayWsUrl}`);
  if (cfg.framework === 'generic-http') {
    console.log(`  generic url:   ${cfg.url}`);
    console.log(`  generic token: ${cfg.token ? '<set>' : '<not set>'}`);
  }
  console.log(`\nLooks good? Run \`arpc\` (no args) to actually connect.`);
}

async function cmdInit(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const target = manifestPath(cwd);

  if (existsSync(target) && !flags.yes) {
    const ok = await confirm(`arp.json already exists in ${cwd}. Overwrite?`, false);
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  // Auto-detect defaults
  const hasIdentityYaml = existsSync(resolve(cwd, 'identity.yaml'));
  const handoff = findHandoff(cwd);
  const handoffSuggestion = handoff ? `./${basename(handoff)}` : './arp-handoff.json';

  let framework: Framework | null = flags.framework ?? null;
  if (!framework) {
    if (flags.yes && hasIdentityYaml) framework = 'kyberbot';
    else framework = (await pick(
      'Which framework powers this agent?',
      [
        { value: 'kyberbot', label: hasIdentityYaml ? 'kyberbot   (detected — identity.yaml is here)' : 'kyberbot' },
        { value: 'openclaw', label: 'openclaw   (adapter not yet implemented — placeholder)' },
        { value: 'hermes', label: 'hermes     (adapter not yet implemented — placeholder)' },
        { value: 'generic-http', label: 'generic-http  (custom: any HTTP endpoint that takes { prompt })' },
      ],
      hasIdentityYaml ? 'kyberbot' : 'generic-http',
    )) as Framework;
  }

  const m: ArpManifest = { framework, handoff: handoffSuggestion };

  if (framework === 'kyberbot') {
    m.kyberbot = { root: '.' };
  } else if (framework === 'generic-http') {
    let url = '';
    let token: string | undefined;
    if (!flags.yes) {
      url = (await prompt('Local HTTP endpoint URL', 'http://127.0.0.1:8080/arp')).trim();
      const tokenIn = (await prompt('Bearer token (blank to skip; use ${ENV_VAR} for interpolation)', '')).trim();
      if (tokenIn) token = tokenIn;
    } else {
      url = 'http://127.0.0.1:8080/arp';
    }
    m['generic-http'] = { url, ...(token ? { token } : {}) };
  } else if (framework === 'openclaw') {
    m.openclaw = { configPath: './openclaw.json' };
  } else if (framework === 'hermes') {
    m.hermes = { configPath: './hermes.config.ts' };
  }

  writeFileSync(target, serializeManifest(m));
  console.log(`\nWrote ${target}`);
  console.log('\nContents:');
  console.log(serializeManifest(m).split('\n').map((l) => `  ${l}`).join('\n'));
  if (framework === 'kyberbot' || framework === 'generic-http') {
    console.log('Next:  arp');
  } else {
    console.log(`Next:  ${framework} adapter is not yet implemented. Switch to "generic-http" for now.`);
  }
}

// ---- prompts (no external deps) -------------------------------------------

async function prompt(question: string, defaultValue: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question}${defaultValue ? ` [${defaultValue}]` : ''}: `);
    return answer.trim() === '' ? defaultValue : answer;
  } finally {
    rl.close();
  }
}

async function confirm(question: string, defaultValue: boolean): Promise<boolean> {
  const hint = defaultValue ? 'Y/n' : 'y/N';
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} [${hint}]: `)).trim().toLowerCase();
    if (!answer) return defaultValue;
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

async function pick(
  question: string,
  options: Array<{ value: string; label: string }>,
  defaultValue: string,
): Promise<string> {
  console.log(question);
  for (let i = 0; i < options.length; i++) {
    const o = options[i]!;
    const marker = o.value === defaultValue ? '›' : ' ';
    console.log(`  ${marker} ${i + 1}. ${o.label}`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`Choose 1-${options.length} or hit enter for default [${defaultValue}]: `)).trim();
    if (!answer) return defaultValue;
    const idx = Number(answer);
    if (Number.isInteger(idx) && idx >= 1 && idx <= options.length) {
      return options[idx - 1]!.value;
    }
    if (options.find((o) => o.value === answer)) return answer;
    console.error(`invalid choice: ${answer}`);
    process.exit(2);
  } finally {
    rl.close();
  }
}

// ---- main ------------------------------------------------------------------

async function main(): Promise<void> {
  const { cmd, sub, positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || cmd === 'help') {
    process.stdout.write(HELP);
    return;
  }
  if (flags.version || cmd === 'version') {
    console.log(`@kybernesis/arp ${VERSION}`);
    return;
  }
  switch (cmd) {
    case 'connect':
    case 'run':
      await cmdConnect(flags);
      return;
    case 'doctor':
      await cmdDoctor(flags);
      return;
    case 'init':
      await cmdInit(flags);
      return;
    case 'host':
      await cmdHost(sub, positional, flags);
      return;
    case 'service':
      cmdService(sub);
      return;
    case 'send':
      await send.cmdSend(positional, {
        async: flags.async,
        ...(flags.timeoutSec !== undefined ? { timeoutSec: flags.timeoutSec } : {}),
        ...(flags.connectionId ? { connectionId: flags.connectionId } : {}),
        ...(flags.as ? { as: flags.as } : {}),
      });
      return;
    case 'contacts':
      send.cmdContacts(sub, positional);
      return;
    case 'skill':
      skill.cmdSkill(sub, positional, flags.target);
      return;
    default:
      console.error(`unknown command: ${cmd}\n`);
      process.stdout.write(HELP);
      process.exit(2);
  }
}

function cmdService(sub: string | null): void {
  if (!sub || sub === 'status') {
    service.status();
    return;
  }
  switch (sub) {
    case 'install':
      service.install();
      return;
    case 'uninstall':
      service.uninstall();
      return;
    default:
      console.error(`unknown service subcommand: ${sub}\n`);
      process.stdout.write(HELP);
      process.exit(2);
  }
}

async function cmdHost(sub: string | null, positional: string[], flags: Flags): Promise<void> {
  if (flags.internalSupervisor) {
    // Reserved entry point used by `arpc host start` after fork.
    await host.runForeground();
    return;
  }
  if (!sub) {
    await host.runForeground();
    return;
  }
  switch (sub) {
    case 'start':
      await host.start();
      return;
    case 'stop':
      await host.stop();
      return;
    case 'status':
      host.status();
      return;
    case 'list':
      host.list();
      return;
    case 'add':
      host.add(positional[2] ?? '');
      return;
    case 'remove':
    case 'rm':
      host.remove(positional[2] ?? '');
      return;
    default:
      console.error(`unknown host subcommand: ${sub}\n`);
      process.stdout.write(HELP);
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(`arpc: fatal: ${(err as Error).message}`);
  process.exit(1);
});
