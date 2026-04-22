import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { log } from './log.js';

const SERVICE_UNIT_PATH = '/etc/systemd/system/arp-sidecar.service';
const BINARY_INSTALL_PATH = '/usr/local/bin/arp-sidecar';
const CONFIG_DIR = '/etc/arp-sidecar';
const DATA_DIR = '/var/lib/arp-sidecar';
const UNIX_USER = 'arp';

/** Install the systemd unit, binary, and directories. Linux-only. */
export function installService(opts: { handoffSource?: string } = {}): void {
  requireLinux();
  requireRoot();

  // 1. Create user/group if missing
  ensureUser(UNIX_USER);

  // 2. Create config + data dirs
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o750 });
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o750 });
  chownR(CONFIG_DIR, UNIX_USER, UNIX_USER);
  chownR(DATA_DIR, UNIX_USER, UNIX_USER);

  // 3. Install the arp-sidecar binary
  const selfPath = resolve(fileURLToPath(import.meta.url), '..', '..');
  const cliPath = join(selfPath, 'dist', 'cli.js');
  // The runtime expects a `node` shim wrapping the CLI.
  const shim = `#!/usr/bin/env bash
exec /usr/bin/env node ${cliPath} "$@"
`;
  writeFileSync(BINARY_INSTALL_PATH, shim, { mode: 0o755 });

  // 4. Place the handoff if provided
  const destHandoff = join(CONFIG_DIR, 'handoff.json');
  if (opts.handoffSource) {
    copyFileSync(opts.handoffSource, destHandoff);
    execFileSync('chmod', ['0640', destHandoff]);
    execFileSync('chown', [`${UNIX_USER}:${UNIX_USER}`, destHandoff]);
  } else if (!existsSync(destHandoff)) {
    log().warn(
      { expected_path: destHandoff },
      'no handoff.json found; place it before enabling the service',
    );
  }

  // 5. Install the unit file
  const unitSource = join(selfPath, 'systemd', 'arp-sidecar.service');
  const unit = readFileSync(unitSource, 'utf8');
  writeFileSync(SERVICE_UNIT_PATH, unit, { mode: 0o644 });

  // 6. Reload + enable + start
  execFileSync('systemctl', ['daemon-reload']);
  execFileSync('systemctl', ['enable', '--now', 'arp-sidecar']);

  process.stdout.write(
    [
      'arp-sidecar installed.',
      `  unit:   ${SERVICE_UNIT_PATH}`,
      `  binary: ${BINARY_INSTALL_PATH}`,
      `  config: ${CONFIG_DIR}`,
      `  data:   ${DATA_DIR}`,
      '',
      'Tail logs with:',
      '  journalctl -u arp-sidecar -f',
      '',
    ].join('\n'),
  );
}

/** Remove everything `installService` wrote. Leaves `DATA_DIR` in place. */
export function uninstallService(): void {
  requireLinux();
  requireRoot();

  try {
    execFileSync('systemctl', ['disable', '--now', 'arp-sidecar']);
  } catch {
    // Not running? Nothing to disable — continue.
  }
  for (const f of [SERVICE_UNIT_PATH, BINARY_INSTALL_PATH]) {
    if (existsSync(f)) rmSync(f);
  }
  rmSync(CONFIG_DIR, { recursive: true, force: true });
  execFileSync('systemctl', ['daemon-reload']);

  process.stdout.write(
    [
      'arp-sidecar uninstalled.',
      `  data preserved at: ${DATA_DIR}`,
      '  remove it manually if desired.',
      '',
    ].join('\n'),
  );
}

function requireLinux(): void {
  if (process.platform !== 'linux') {
    throw new Error('install-service / uninstall-service are Linux-only');
  }
}

function requireRoot(): void {
  if (typeof process.getuid === 'function' && process.getuid() !== 0) {
    throw new Error('install-service must be run as root (try: sudo arp-sidecar install-service)');
  }
}

function ensureUser(user: string): void {
  try {
    execFileSync('id', [user], { stdio: 'ignore' });
  } catch {
    execFileSync('useradd', ['--system', '--no-create-home', '--shell', '/usr/sbin/nologin', user]);
  }
}

function chownR(path: string, user: string, group: string): void {
  execFileSync('chown', ['-R', `${user}:${group}`, path]);
}
