/**
 * `arpc service` — manage the macOS launchd LaunchAgent that auto-
 * starts the host supervisor at login.
 *
 * Subcommands:
 *   install    Generate the plist + load it. Survives reboots.
 *   uninstall  Unload the plist + delete it.
 *   status     Whether launchd has the agent loaded.
 *
 * The LaunchAgent runs `node <cli.js> host --internal-supervisor` at
 * user login (not at boot — agents under ~/Library/LaunchAgents only
 * activate when the user logs in, which is what you want for a
 * personal AI agent). KeepAlive=true so launchd respawns it on
 * crash; logs are appended to ~/.arp/host.log (same as `arpc host
 * start`).
 *
 * macOS only for now. Linux/systemd in a follow-up — same shape,
 * different unit file.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultLogsDir, hostLogPath, defaultHostStateDir } from './host-config.js';

const LABEL = 'com.kybernesis.arpc-host';

function plistPath(): string {
  return join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
}

function assertDarwin(): void {
  if (platform() !== 'darwin') {
    console.error(
      `arpc service: only macOS (launchd) is supported today. ` +
        `Linux/systemd support is planned. For now, run \`arpc host start\` ` +
        `at boot via your distro's init system, or in a tmux session.`,
    );
    process.exit(1);
  }
}

function cliJsPath(): string {
  return fileURLToPath(import.meta.url).replace(/service\.js$/, 'cli.js');
}

function buildPlist(): string {
  const node = process.execPath;
  const cli = cliJsPath();
  const log = hostLogPath();
  const home = homedir();
  const path = process.env['PATH'] ?? '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(node)}</string>
    <string>${escapeXml(cli)}</string>
    <string>host</string>
    <string>--internal-supervisor</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(log)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${escapeXml(home)}</string>
    <key>PATH</key>
    <string>${escapeXml(path)}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>${escapeXml(home)}</string>
</dict>
</plist>
`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function install(): void {
  assertDarwin();

  // Make sure ~/.arp + log file exist before launchd touches them.
  mkdirSync(defaultHostStateDir(), { recursive: true });
  mkdirSync(defaultLogsDir(), { recursive: true });
  if (!existsSync(hostLogPath())) {
    writeFileSync(hostLogPath(), '', 'utf-8');
  }

  const target = plistPath();
  mkdirSync(dirname(target), { recursive: true });

  const wasInstalled = existsSync(target);
  if (wasInstalled) {
    // Unload first so the new plist takes effect on reload.
    spawnSync('launchctl', ['unload', '-w', target], { stdio: 'ignore' });
  }

  writeFileSync(target, buildPlist(), 'utf-8');

  const result = spawnSync('launchctl', ['load', '-w', target], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    console.error(`arpc service: launchctl load failed:`);
    if (result.stderr) console.error(result.stderr);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`${wasInstalled ? 'Reloaded' : 'Installed'} ${LABEL}`);
  // eslint-disable-next-line no-console
  console.log(`  plist:  ${target}`);
  // eslint-disable-next-line no-console
  console.log(`  log:    ${hostLogPath()}`);
  // eslint-disable-next-line no-console
  console.log(`\nThe supervisor will auto-start on every login.`);
  // eslint-disable-next-line no-console
  console.log(`Check it's running:  arpc service status`);
  // eslint-disable-next-line no-console
  console.log(`Stop auto-start:     arpc service uninstall`);
}

export function uninstall(): void {
  assertDarwin();
  const target = plistPath();
  if (!existsSync(target)) {
    // eslint-disable-next-line no-console
    console.log(`arpc service: not installed (no plist at ${target})`);
    return;
  }
  const result = spawnSync('launchctl', ['unload', '-w', target], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
  });
  if (result.status !== 0 && !(result.stderr ?? '').includes('Could not find')) {
    console.error(`arpc service: launchctl unload failed:`);
    if (result.stderr) console.error(result.stderr);
    // continue — we still want to delete the plist
  }
  try {
    unlinkSync(target);
  } catch {
    /* ignore */
  }
  // eslint-disable-next-line no-console
  console.log(`Uninstalled ${LABEL}`);
}

export function status(): void {
  assertDarwin();
  const target = plistPath();
  const present = existsSync(target);
  let loaded = false;
  let pid: number | null = null;

  try {
    const out = execFileSync('launchctl', ['list', LABEL], { encoding: 'utf-8' });
    loaded = true;
    const m = out.match(/"PID"\s*=\s*(\d+);/);
    if (m) pid = Number(m[1]);
  } catch {
    loaded = false;
  }

  // eslint-disable-next-line no-console
  console.log(`arpc service · ${present ? 'installed' : 'not installed'}${loaded ? ' · loaded' : ''}${pid ? ` · pid ${pid}` : ''}`);
  // eslint-disable-next-line no-console
  console.log(`  plist:  ${target}`);
  if (present) {
    // eslint-disable-next-line no-console
    console.log(`  log:    ${hostLogPath()}`);
  }
}
