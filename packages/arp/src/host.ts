/**
 * `arpc host` subcommands — single-process supervisor for all agents.
 *
 * Lifecycle commands:
 *   arpc host start           Daemonize. Detached child writes its PID
 *                            and logs to ~/.arp/. Returns immediately.
 *   arpc host stop            SIGTERM the daemon, wait, clean up PID.
 *   arpc host status          Show whether the daemon is up + agent list.
 *   arpc host                 Foreground — same supervisor, attached
 *                            stdio. Ctrl-C to stop. Used for debugging
 *                            and during development.
 *
 * Config commands (mutate ~/.arp/host.yaml):
 *   arpc host list            Print configured agents.
 *   arpc host add <folder>    Append. Folder must contain arp.json or
 *                            identity.yaml + handoff.
 *   arpc host remove <folder> Remove by root path.
 *
 * Internal:
 *   arpc host --internal-supervisor
 *                            Reserved entry point used by `arpc host start`
 *                            after fork() to run the supervisor without
 *                            re-forking. End users never type this.
 */

import { existsSync, openSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  defaultHostConfigPath,
  defaultHostStateDir,
  defaultLogsDir,
  hostLogPath,
  pidFilePath,
  readHostConfig,
  writeHostConfig,
  expandHome,
  type HostAgent,
} from './host-config.js';
import { startSupervisor } from './supervisor.js';

function isLaunchdLoaded(): boolean {
  if (process.platform !== 'darwin') return false;
  try {
    execFileSync('launchctl', ['list', 'com.kybernesis.arpc-host'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the pid of the launchd-managed daemon if it's currently
 * running. `launchctl list <label>` prints a plist-style dict — NOT a
 * tabular row — so we extract the `"PID" = <n>;` line. When the job
 * is loaded but not running, the dict has no PID key and we return
 * null. Used by `arpc host status` so the daemon shows as running
 * when started via `arpc service install`, not just `arpc host start`.
 */
function launchdPidIfRunning(): number | null {
  if (process.platform !== 'darwin') return null;
  let out: string;
  try {
    out = execFileSync('launchctl', ['list', 'com.kybernesis.arpc-host'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
  // Sample line we want: `\t"PID" = 32636;`
  const m = out.match(/"PID"\s*=\s*(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function readPid(): number | null {
  const p = pidFilePath();
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf-8').trim();
  const pid = Number(raw);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function clearPid(): void {
  const p = pidFilePath();
  if (existsSync(p)) {
    try {
      unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

// ----- foreground supervisor -----

export async function runForeground(): Promise<void> {
  const cfg = readHostConfig();
  // eslint-disable-next-line no-console
  console.log(
    `arpc host (foreground) · agents=${cfg.agents.length} · config=${defaultHostConfigPath()}`,
  );
  const handle = await startSupervisor({
    agents: cfg.agents,
    configPath: defaultHostConfigPath(),
  });
  const shutdown = async (sig: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n${sig} received, stopping all agents`);
    await handle.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// ----- daemon -----

export async function start(): Promise<void> {
  const existing = readPid();
  if (existing && isAlive(existing)) {
    // eslint-disable-next-line no-console
    console.log(`arpc host already running (pid ${existing}). Use \`arpc host status\` or \`arpc host stop\`.`);
    return;
  }
  if (existing) clearPid();

  mkdirSync(defaultHostStateDir(), { recursive: true });
  mkdirSync(defaultLogsDir(), { recursive: true });

  const logFd = openSync(hostLogPath(), 'a');
  const cliPath = fileURLToPath(import.meta.url).replace(/host\.js$/, 'cli.js');
  if (!existsSync(cliPath)) {
    throw new Error(`internal: cannot find cli.js at ${cliPath}`);
  }

  const child = spawn(process.execPath, [cliPath, 'host', '--internal-supervisor'], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
  });
  child.unref();
  if (!child.pid) {
    throw new Error('failed to spawn supervisor child');
  }
  writeFileSync(pidFilePath(), String(child.pid), 'utf-8');

  // Give the child ~500ms to fail fast on startup; if it dies immediately
  // the user wants to know now, not on the next status check.
  await new Promise((r) => setTimeout(r, 500));
  if (!isAlive(child.pid)) {
    clearPid();
    // eslint-disable-next-line no-console
    console.error(
      `arpc host: supervisor died on startup. Check ${hostLogPath()}.`,
    );
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`arpc host started (pid ${child.pid})`);
  // eslint-disable-next-line no-console
  console.log(`  log:    ${hostLogPath()}`);
  // eslint-disable-next-line no-console
  console.log(`  pid:    ${pidFilePath()}`);
  // eslint-disable-next-line no-console
  console.log(`  agents: ${readHostConfig().agents.length} (\`arpc host list\`)`);
}

export async function stop(): Promise<void> {
  const pid = readPid();
  if (!pid) {
    // eslint-disable-next-line no-console
    console.log("arpc host: not running.");
    return;
  }
  if (!isAlive(pid)) {
    clearPid();
    // eslint-disable-next-line no-console
    console.log(`arpc host: stale pid ${pid} cleaned up.`);
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`failed to signal pid ${pid}: ${(err as Error).message}`);
    process.exit(1);
  }
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (!isAlive(pid)) break;
  }
  if (isAlive(pid)) {
    // eslint-disable-next-line no-console
    console.log(`arpc host: pid ${pid} still alive after 6s, sending SIGKILL`);
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* ignore */
    }
  }
  clearPid();
  // eslint-disable-next-line no-console
  console.log(`arpc host stopped (pid ${pid}).`);
}

export function status(): void {
  const pid = readPid();
  const cfg = readHostConfig();
  // Either path counts as running:
  //   - foreground/manual: pid file written by `arpc host start`
  //   - launchd-managed: process owned by `arpc service install`, no pid
  //     file. Fall through to `launchctl list` so we don't say "stopped"
  //     when the daemon is healthy under launchd.
  let runningPid: number | null = null;
  let source: 'pidfile' | 'launchd' | null = null;
  if (pid && isAlive(pid)) {
    runningPid = pid;
    source = 'pidfile';
  } else {
    if (pid) clearPid();
    const launchdPid = launchdPidIfRunning();
    if (launchdPid) {
      runningPid = launchdPid;
      source = 'launchd';
    }
  }
  if (runningPid) {
    // eslint-disable-next-line no-console
    console.log(`arpc host · running · pid ${runningPid}${source === 'launchd' ? ' (via launchd)' : ''}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`arpc host · stopped`);
  }
  // eslint-disable-next-line no-console
  console.log(`  config: ${defaultHostConfigPath()}`);
  // eslint-disable-next-line no-console
  console.log(`  log:    ${hostLogPath()}`);
  // eslint-disable-next-line no-console
  console.log(`  agents: ${cfg.agents.length}`);
  for (const a of cfg.agents) {
    // eslint-disable-next-line no-console
    console.log(`    • ${a.root}`);
  }
}

// ----- config commands -----

export function list(): void {
  const cfg = readHostConfig();
  if (cfg.agents.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`arpc host: no agents configured.`);
    // eslint-disable-next-line no-console
    console.log(`  Add one with: arpc host add <folder>`);
    return;
  }
  for (const a of cfg.agents) {
    // eslint-disable-next-line no-console
    console.log(a.root);
  }
}

export function add(folderArg: string): void {
  if (!folderArg) {
    // eslint-disable-next-line no-console
    console.error('arpc host add: folder required');
    process.exit(2);
  }
  const folder = expandHome(folderArg);
  if (!existsSync(folder)) {
    // eslint-disable-next-line no-console
    console.error(`arpc host add: ${folder} does not exist`);
    process.exit(1);
  }
  const hasManifest = existsSync(resolve(folder, 'arp.json'));
  const hasIdentity = existsSync(resolve(folder, 'identity.yaml'));
  if (!hasManifest && !hasIdentity) {
    // eslint-disable-next-line no-console
    console.error(
      `arpc host add: ${folder} has no arp.json or identity.yaml.\n` +
        `  Run: cd ${folder} && arpc init`,
    );
    process.exit(1);
  }
  const cfg = readHostConfig();
  if (cfg.agents.some((a) => a.root === folder)) {
    // eslint-disable-next-line no-console
    console.log(`arpc host: ${folder} already in host.yaml`);
    return;
  }
  cfg.agents.push({ root: folder });
  writeHostConfig(cfg);
  // eslint-disable-next-line no-console
  console.log(`Added ${folder} to ${defaultHostConfigPath()}`);
  if (readPid() || isLaunchdLoaded()) {
    // eslint-disable-next-line no-console
    console.log(`Supervisor is running — will auto-pickup within a second.`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`Start the supervisor:  arpc host start  (or arpc service install)`);
  }
}

export function remove(folderArg: string): void {
  if (!folderArg) {
    // eslint-disable-next-line no-console
    console.error('arpc host remove: folder required');
    process.exit(2);
  }
  const folder = expandHome(folderArg);
  const cfg = readHostConfig();
  const before = cfg.agents.length;
  cfg.agents = cfg.agents.filter((a) => a.root !== folder);
  if (cfg.agents.length === before) {
    // eslint-disable-next-line no-console
    console.log(`arpc host: ${folder} not in host.yaml`);
    return;
  }
  writeHostConfig(cfg);
  // eslint-disable-next-line no-console
  console.log(`Removed ${folder}`);
  if (readPid() || isLaunchdLoaded()) {
    // eslint-disable-next-line no-console
    console.log(`Supervisor is running — will drop it within a second.`);
  }
}

// ----- exports for the CLI dispatcher -----

export type { HostAgent };
