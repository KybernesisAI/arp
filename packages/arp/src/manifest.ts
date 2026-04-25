/**
 * arp.json manifest — explicit, self-describing declaration of how
 * to connect an agent folder to ARP Cloud.
 *
 *   {
 *     "framework": "kyberbot" | "openclaw" | "hermes" | "generic-http",
 *     "handoff": "./arp-handoff.json",   // optional
 *     "kyberbot":     { "root": "." },                              // when framework=kyberbot
 *     "openclaw":     { "configPath": "./openclaw.json" },          // (future) when framework=openclaw
 *     "hermes":       { "configPath": "./hermes.config.ts" },       // (future) when framework=hermes
 *     "generic-http": { "url": "http://...", "token": "..." }       // when framework=generic-http
 *   }
 *
 * `${ENV_VAR}` substitutions inside string values are expanded at
 * load time — useful for keeping bearer tokens out of the file:
 *   "token": "${SAMANTHA_API_TOKEN}"
 *
 * Detection precedence in @kybernesis/arp's CLI:
 *   1. arp.json present  → use it (authoritative)
 *   2. identity.yaml     → assume framework=kyberbot (legacy auto-detect)
 *   3. otherwise         → error, prompt the user to run `arpc init`
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type Framework = 'kyberbot' | 'openclaw' | 'hermes' | 'generic-http';

export interface ArpManifest {
  framework: Framework;
  handoff?: string;
  kyberbot?: { root?: string };
  openclaw?: { configPath?: string };
  hermes?: { configPath?: string };
  'generic-http'?: { url: string; token?: string };
}

export const MANIFEST_FILENAME = 'arp.json';

const KNOWN_FRAMEWORKS: Framework[] = ['kyberbot', 'openclaw', 'hermes', 'generic-http'];

export function manifestPath(dir: string): string {
  return resolve(dir, MANIFEST_FILENAME);
}

export function readManifest(dir: string): ArpManifest | null {
  const p = manifestPath(dir);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${p}: invalid JSON — ${(err as Error).message}`);
  }
  return validate(parsed, p);
}

function validate(parsed: unknown, source: string): ArpManifest {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${source}: must be an object`);
  }
  const obj = parsed as Record<string, unknown>;
  const fw = obj['framework'];
  if (typeof fw !== 'string' || !KNOWN_FRAMEWORKS.includes(fw as Framework)) {
    throw new Error(
      `${source}: "framework" must be one of ${KNOWN_FRAMEWORKS.join(', ')}; got ${JSON.stringify(fw)}`,
    );
  }
  const m: ArpManifest = { framework: fw as Framework };
  if (typeof obj['handoff'] === 'string') m.handoff = expandEnv(obj['handoff']);
  if (obj['kyberbot'] && typeof obj['kyberbot'] === 'object') {
    const kb = obj['kyberbot'] as Record<string, unknown>;
    m.kyberbot = {};
    if (typeof kb['root'] === 'string') m.kyberbot.root = expandEnv(kb['root']);
  }
  if (obj['openclaw'] && typeof obj['openclaw'] === 'object') {
    const oc = obj['openclaw'] as Record<string, unknown>;
    m.openclaw = {};
    if (typeof oc['configPath'] === 'string') m.openclaw.configPath = expandEnv(oc['configPath']);
  }
  if (obj['hermes'] && typeof obj['hermes'] === 'object') {
    const h = obj['hermes'] as Record<string, unknown>;
    m.hermes = {};
    if (typeof h['configPath'] === 'string') m.hermes.configPath = expandEnv(h['configPath']);
  }
  if (obj['generic-http'] && typeof obj['generic-http'] === 'object') {
    const g = obj['generic-http'] as Record<string, unknown>;
    if (typeof g['url'] !== 'string') {
      throw new Error(`${source}: generic-http.url must be a string`);
    }
    m['generic-http'] = { url: expandEnv(g['url']) };
    if (typeof g['token'] === 'string') m['generic-http'].token = expandEnv(g['token']);
  }
  // Cross-validate: framework must have its own block when required
  if (m.framework === 'generic-http' && !m['generic-http']) {
    throw new Error(`${source}: framework="generic-http" requires a "generic-http" block with at least { url }`);
  }
  return m;
}

/** Expand ${VAR} env-var references inside string values. */
function expandEnv(s: string): string {
  return s.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name) => process.env[name] ?? '');
}

/** Render a manifest object to pretty-printed JSON, ready to write to disk. */
export function serializeManifest(m: ArpManifest): string {
  return JSON.stringify(m, null, 2) + '\n';
}
