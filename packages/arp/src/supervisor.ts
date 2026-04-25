/**
 * The supervisor — runs every agent's bridge in this process,
 * with prefixed log lines and exponential-backoff auto-restart.
 *
 * One process holds N WebSocket connections (one per agent). Each
 * agent's bridge gets its own log prefix (the basename of its folder)
 * so a unified terminal stream is still readable. On crash, the
 * supervisor waits, rebuilds the adapter from a fresh `arp.json` read,
 * and restarts that agent's bridge in isolation — other agents are
 * unaffected.
 *
 * Used by both:
 *   - `arpc host` (foreground)        — logs go to the controlling tty
 *   - `arpc host start` (daemon)      — same code, but stdio is the
 *     daemon's redirected log file
 */

import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import {
  startBridge,
  createKyberBotAdapter,
  createGenericHttpAdapter,
  type Adapter,
  type BridgeHandle,
} from '@kybernesis/arp-cloud-bridge';
import { readManifest, type ArpManifest, type Framework } from './manifest.js';
import type { HostAgent } from './host-config.js';

interface SupervisedAgent {
  agent: HostAgent;
  prefix: string;
  bridge: BridgeHandle | null;
  attempts: number;
  stopRequested: boolean;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

function backoffMs(attempt: number): number {
  return Math.min(INITIAL_BACKOFF_MS * 2 ** Math.min(attempt, 10), MAX_BACKOFF_MS);
}

export interface SupervisorHandle {
  stop(): Promise<void>;
}

function loadAgentConfig(root: string): {
  handoffPath: string;
  framework: Framework;
  agentRoot: string;
  url?: string;
  token?: string;
} {
  if (!existsSync(root)) {
    throw new Error(`agent root does not exist: ${root}`);
  }
  let manifest: ArpManifest | null;
  try {
    manifest = readManifest(root);
  } catch (err) {
    throw new Error(`${root}: ${(err as Error).message}`);
  }
  if (!manifest) {
    if (existsSync(resolve(root, 'identity.yaml'))) {
      manifest = { framework: 'kyberbot', kyberbot: { root: '.' } };
    } else {
      throw new Error(`${root}: no arp.json (run \`arpc init\` in that folder first)`);
    }
  }
  const handoffRel = manifest.handoff ?? './arp-handoff.json';
  const handoffPath = resolve(root, handoffRel);
  if (!existsSync(handoffPath)) {
    throw new Error(`${root}: handoff JSON not found at ${handoffPath}`);
  }
  const cfg: {
    handoffPath: string;
    framework: Framework;
    agentRoot: string;
    url?: string;
    token?: string;
  } = {
    handoffPath,
    framework: manifest.framework,
    agentRoot: manifest.kyberbot?.root ? resolve(root, manifest.kyberbot.root) : root,
  };
  if (manifest.framework === 'generic-http') {
    if (!manifest['generic-http']) {
      throw new Error(`${root}: framework="generic-http" requires a "generic-http" block in arp.json`);
    }
    cfg.url = manifest['generic-http'].url;
    if (manifest['generic-http'].token) cfg.token = manifest['generic-http'].token;
  }
  if (manifest.framework === 'openclaw' || manifest.framework === 'hermes') {
    throw new Error(
      `${root}: framework="${manifest.framework}" — adapter not yet implemented. Use generic-http for now.`,
    );
  }
  return cfg;
}

function buildAdapter(cfg: {
  framework: Framework;
  agentRoot: string;
  url?: string;
  token?: string;
}): Adapter {
  if (cfg.framework === 'kyberbot') {
    return createKyberBotAdapter({ root: cfg.agentRoot });
  }
  return createGenericHttpAdapter({
    url: cfg.url!,
    ...(cfg.token ? { token: cfg.token } : {}),
  });
}

function logLine(prefix: string, message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${prefix}] ${message}`);
}

async function startOne(s: SupervisedAgent): Promise<void> {
  if (s.stopRequested) return;
  let cfg: ReturnType<typeof loadAgentConfig>;
  try {
    cfg = loadAgentConfig(s.agent.root);
  } catch (err) {
    logLine(s.prefix, `config error: ${(err as Error).message}`);
    scheduleRestart(s);
    return;
  }
  let adapter: Adapter;
  try {
    adapter = buildAdapter(cfg);
  } catch (err) {
    logLine(s.prefix, `adapter error: ${(err as Error).message}`);
    scheduleRestart(s);
    return;
  }
  logLine(
    s.prefix,
    `starting · framework=${cfg.framework} · handoff=${basename(cfg.handoffPath)}`,
  );
  try {
    s.bridge = await startBridge({
      handoffPath: cfg.handoffPath,
      adapter,
    });
  } catch (err) {
    logLine(s.prefix, `bridge start failed: ${(err as Error).message}`);
    s.bridge = null;
    scheduleRestart(s);
    return;
  }
  logLine(
    s.prefix,
    `connected · agent=${s.bridge.agentDid} · gateway=${s.bridge.gatewayWsUrl}`,
  );
  s.attempts = 0;
}

function scheduleRestart(s: SupervisedAgent): void {
  if (s.stopRequested) return;
  const delay = backoffMs(s.attempts);
  s.attempts += 1;
  logLine(s.prefix, `retrying in ${(delay / 1000).toFixed(1)}s (attempt ${s.attempts})`);
  setTimeout(() => {
    if (!s.stopRequested) void startOne(s);
  }, delay).unref?.();
}

export async function startSupervisor(agents: HostAgent[]): Promise<SupervisorHandle> {
  if (agents.length === 0) {
    // eslint-disable-next-line no-console
    console.log('arp host: no agents configured. Add one with `arpc host add <folder>`.');
  }
  const supervised: SupervisedAgent[] = agents.map((a) => ({
    agent: a,
    prefix: basename(a.root),
    bridge: null,
    attempts: 0,
    stopRequested: false,
  }));

  await Promise.all(supervised.map((s) => startOne(s)));

  return {
    async stop() {
      for (const s of supervised) s.stopRequested = true;
      await Promise.all(
        supervised.map(async (s) => {
          if (s.bridge) {
            try {
              await s.bridge.stop();
              logLine(s.prefix, 'stopped');
            } catch (err) {
              logLine(s.prefix, `stop error: ${(err as Error).message}`);
            }
          }
        }),
      );
    },
  };
}
