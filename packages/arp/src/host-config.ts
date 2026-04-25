/**
 * `~/.arp/host.yaml` — list of agent folders the supervisor should run.
 *
 *   agents:
 *     - root: ~/atlas
 *     - root: ~/nova
 *     - root: ~/samantha
 *     - root: /opt/some-openclaw-bot
 *
 * Each agent folder is expected to have its own `arp.json` (created
 * via `arp init`) which declares the framework + handoff path.
 *
 * Default location: ~/.arp/host.yaml — a per-user home dir, NOT a
 * cwd file. The supervisor is a singleton per machine; making it cwd-
 * relative would silently fork state if the user runs `arp host` from
 * different folders.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import yaml from 'js-yaml';

export interface HostAgent {
  /** Absolute path to the agent's folder. Tilde expanded at load time. */
  root: string;
}

export interface HostConfig {
  agents: HostAgent[];
}

export function defaultHostConfigPath(): string {
  return join(homedir(), '.arp', 'host.yaml');
}

export function defaultHostStateDir(): string {
  return join(homedir(), '.arp');
}

export function defaultLogsDir(): string {
  return join(homedir(), '.arp', 'logs');
}

export function pidFilePath(): string {
  return join(homedir(), '.arp', 'host.pid');
}

export function hostLogPath(): string {
  return join(homedir(), '.arp', 'host.log');
}

export function readHostConfig(path: string = defaultHostConfigPath()): HostConfig {
  if (!existsSync(path)) {
    return { agents: [] };
  }
  const raw = readFileSync(path, 'utf-8');
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`${path}: invalid YAML — ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${path}: must be a YAML object with an "agents" list`);
  }
  const obj = parsed as Record<string, unknown>;
  const agentsRaw = obj['agents'];
  if (!Array.isArray(agentsRaw)) {
    throw new Error(`${path}: "agents" must be a list`);
  }
  const agents: HostAgent[] = [];
  for (const a of agentsRaw) {
    if (!a || typeof a !== 'object') {
      throw new Error(`${path}: each agent entry must be an object with "root"`);
    }
    const ar = a as Record<string, unknown>;
    if (typeof ar['root'] !== 'string') {
      throw new Error(`${path}: each agent entry needs a string "root"`);
    }
    agents.push({ root: expandHome(ar['root']) });
  }
  return { agents };
}

export function writeHostConfig(cfg: HostConfig, path: string = defaultHostConfigPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const out = yaml.dump(cfg, { lineWidth: 120, noRefs: true });
  writeFileSync(path, out, 'utf-8');
}

export function expandHome(p: string): string {
  if (!p) return p;
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}
