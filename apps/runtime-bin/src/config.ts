import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { HandoffBundleSchema, type HandoffBundle } from '@kybernesis/arp-spec';

const require_ = createRequire(import.meta.url);

/**
 * Runtime bin uses a handoff bundle as its canonical bootstrap input (per
 * Phase 2 §4 Task 7.3). Additional agent-local settings live in the env.
 */

export interface BinConfig {
  handoff: HandoffBundle;
  keystorePath: string;
  dataDir: string;
  port: number;
  hostname: string;
  scopeCatalogVersion: string;
  agentName: string;
  agentDescription: string;
  revocationsProxyUrl?: string;
}

export function loadHandoff(path: string): HandoffBundle {
  const absolute = isAbsolute(path) ? path : resolve(process.cwd(), path);
  const raw = readFileSync(absolute, 'utf8');
  const parsed = JSON.parse(raw);
  return HandoffBundleSchema.parse(parsed);
}

export function loadBinConfig(params: {
  handoffPath: string;
  port?: number;
  hostname?: string;
  dataDir?: string;
}): BinConfig {
  const handoff = loadHandoff(params.handoffPath);
  const dataDir =
    params.dataDir ?? process.env.ARP_DATA_DIR ?? join(dirname(resolve(params.handoffPath)), 'data');
  const keystorePath =
    process.env.ARP_KEYSTORE_PATH ?? join(dataDir, 'agent.key');
  const port =
    params.port ?? (process.env.ARP_PORT ? Number(process.env.ARP_PORT) : 4401);
  const hostname = params.hostname ?? process.env.ARP_HOST ?? '127.0.0.1';
  const scopeCatalogVersion = process.env.ARP_SCOPE_CATALOG_VERSION ?? 'v1';
  const agentName = process.env.ARP_AGENT_NAME ?? deriveAgentName(handoff.agent_did);
  const agentDescription = process.env.ARP_AGENT_DESCRIPTION ?? 'Personal agent';
  const config: BinConfig = {
    handoff,
    keystorePath,
    dataDir,
    port,
    hostname,
    scopeCatalogVersion,
    agentName,
    agentDescription,
  };
  if (process.env.ARP_REVOCATIONS_PROXY_URL) {
    config.revocationsProxyUrl = process.env.ARP_REVOCATIONS_PROXY_URL;
  }
  return config;
}

function deriveAgentName(did: string): string {
  const parts = did.split(':');
  const host = parts[2];
  if (!host) return 'agent';
  const firstLabel = host.split('.')[0];
  if (!firstLabel) return 'agent';
  return firstLabel.charAt(0).toUpperCase() + firstLabel.slice(1);
}

export function resolveCedarSchema(): string {
  const override = process.env.ARP_CEDAR_SCHEMA_PATH;
  if (override && existsSync(override)) {
    return readFileSync(override, 'utf8');
  }
  // Fall back to the schema bundled with @kybernesis/arp-spec. The package
  // exposes `./cedar-schema.json` in its exports map.
  const schemaPath = require_.resolve('@kybernesis/arp-spec/cedar-schema.json');
  return readFileSync(schemaPath, 'utf8');
}
