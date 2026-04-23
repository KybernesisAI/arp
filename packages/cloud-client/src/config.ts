/**
 * Config file support. The user-facing CLI reads + writes
 * ~/.arp-cloud/config.json. Schema:
 *
 *   {
 *     "cloud_ws_url": "wss://arp.cloud/ws",
 *     "agent_did": "did:web:samantha.agent",
 *     "agent_api_url": "http://127.0.0.1:4500",
 *     "private_key_path": "~/.arp-cloud/private.key"
 *   }
 *
 * The private key is a raw ed25519 32-byte file (mode 0600). Separating
 * the key from the json lets users manage the key with standard unix
 * tooling without accidental leaks via config backups.
 */

import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';

export interface CloudClientConfigFile {
  cloud_ws_url: string;
  agent_did: string;
  agent_api_url: string;
  private_key_path: string;
}

export interface LoadedConfig extends CloudClientConfigFile {
  privateKey: Uint8Array;
}

export function defaultConfigDir(): string {
  return join(homedir(), '.arp-cloud');
}

export function defaultConfigPath(): string {
  return join(defaultConfigDir(), 'config.json');
}

export function readConfigFile(path: string): CloudClientConfigFile {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as CloudClientConfigFile;
  validate(parsed);
  return parsed;
}

export function writeConfigFile(path: string, cfg: CloudClientConfigFile): void {
  validate(cfg);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  try {
    chmodSync(path, 0o600);
  } catch {
    /* ignore: windows etc */
  }
}

export function loadConfig(path: string = defaultConfigPath()): LoadedConfig {
  if (!existsSync(path)) {
    throw new Error(`no config at ${path} — run "npx @kybernesis/arp-cloud-client init"`);
  }
  const cfg = readConfigFile(path);
  const keyPath = expandHome(cfg.private_key_path);
  if (!existsSync(keyPath)) {
    throw new Error(`private key missing at ${keyPath}`);
  }
  const raw = readFileSync(keyPath);
  if (raw.length !== 32) {
    throw new Error(`private key at ${keyPath} must be 32 raw bytes; got ${raw.length}`);
  }
  return { ...cfg, privateKey: new Uint8Array(raw) };
}

export function writePrivateKey(path: string, key: Uint8Array): void {
  if (key.length !== 32) throw new Error('ed25519 private key must be 32 bytes');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(key));
  try {
    chmodSync(path, 0o600);
  } catch {
    /* ignore */
  }
}

export function expandHome(p: string): string {
  if (!p) return p;
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  if (!isAbsolute(p)) return join(process.cwd(), p);
  return p;
}

function validate(cfg: CloudClientConfigFile): void {
  for (const key of ['cloud_ws_url', 'agent_did', 'agent_api_url', 'private_key_path'] as const) {
    if (typeof cfg[key] !== 'string' || cfg[key].length === 0) {
      throw new Error(`invalid config: missing ${key}`);
    }
  }
  if (!cfg.cloud_ws_url.startsWith('ws://') && !cfg.cloud_ws_url.startsWith('wss://')) {
    throw new Error(`cloud_ws_url must be ws(s)://`);
  }
  if (!cfg.agent_did.startsWith('did:')) {
    throw new Error('agent_did must be a DID URI');
  }
  try {
    new URL(cfg.agent_api_url);
  } catch {
    throw new Error('agent_api_url must be a valid URL');
  }
}
