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
 * Hot-reload: the supervisor watches `~/.arp/host.yaml` (the path
 * passed in via opts.configPath) using `fs.watchFile` polling. On
 * every change it diffs the new agent list against currently
 * supervised entries — new entries get a SupervisedAgent + startOne;
 * removed entries get stopRequested + bridge.stop. No daemon restart
 * needed after `arpc host add` / `arpc host remove`.
 *
 * Used by both:
 *   - `arpc host` (foreground)        — logs go to the controlling tty
 *   - `arpc host start` (daemon)      — same code, but stdio is the
 *     daemon's redirected log file
 */

import { existsSync, watchFile, unwatchFile } from 'node:fs';
import { resolve, basename } from 'node:path';
import {
  startBridge,
  createKyberBotAdapter,
  createGenericHttpAdapter,
  type Adapter,
  type BridgeHandle,
} from '@kybernesis/arp-cloud-bridge';
import { readManifest, type ArpManifest, type Framework } from './manifest.js';
import {
  defaultHostConfigPath,
  readHostConfig,
  type HostAgent,
} from './host-config.js';

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

export interface SupervisorOptions {
  /** Initial agent set. */
  agents: HostAgent[];
  /**
   * Path to host.yaml; when set the supervisor watches it for changes
   * and hot-reloads agent membership. Pass `null` to disable watching
   * (useful for tests).
   */
  configPath?: string | null;
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

async function stopOne(s: SupervisedAgent): Promise<void> {
  s.stopRequested = true;
  if (s.bridge) {
    try {
      await s.bridge.stop();
      logLine(s.prefix, 'stopped');
    } catch (err) {
      logLine(s.prefix, `stop error: ${(err as Error).message}`);
    }
    s.bridge = null;
  }
}

/**
 * Backwards-compatible thin wrapper kept for callers that pre-date the
 * options-object API.
 */
export async function startSupervisor(
  agentsOrOpts: HostAgent[] | SupervisorOptions,
): Promise<SupervisorHandle> {
  const opts: SupervisorOptions = Array.isArray(agentsOrOpts)
    ? { agents: agentsOrOpts, configPath: null }
    : agentsOrOpts;
  return start(opts);
}

async function start(opts: SupervisorOptions): Promise<SupervisorHandle> {
  if (opts.agents.length === 0) {
    // eslint-disable-next-line no-console
    console.log('arpc host: no agents configured. Add one with `arpc host add <folder>`.');
  }
  const supervised: SupervisedAgent[] = opts.agents.map((a) => ({
    agent: a,
    prefix: basename(a.root),
    bridge: null,
    attempts: 0,
    stopRequested: false,
  }));

  await Promise.all(supervised.map((s) => startOne(s)));

  let stopped = false;

  // ---- hot-reload watcher --------------------------------------------------
  const watchPath = opts.configPath === undefined ? defaultHostConfigPath() : opts.configPath;
  if (watchPath) {
    // watchFile is polling-based but works reliably across macOS file types
    // (atomic-rename writes from `arpc host add` would skip native fs.watch
    // on some filesystems). 1s interval is plenty for a low-rate config file.
    watchFile(watchPath, { interval: 1_000, persistent: false }, () => {
      if (stopped) return;
      void reload(watchPath, supervised);
    });
  }

  return {
    async stop() {
      stopped = true;
      if (watchPath) {
        try {
          unwatchFile(watchPath);
        } catch {
          /* ignore */
        }
      }
      await Promise.all(supervised.map((s) => stopOne(s)));
    },
  };
}

async function reload(configPath: string, supervised: SupervisedAgent[]): Promise<void> {
  let next: HostAgent[];
  try {
    next = readHostConfig(configPath).agents;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`[supervisor] reload failed: ${(err as Error).message}`);
    return;
  }
  const currentRoots = new Set(supervised.filter((s) => !s.stopRequested).map((s) => s.agent.root));
  const nextRoots = new Set(next.map((a) => a.root));

  // Stop agents that were removed.
  for (const s of supervised) {
    if (s.stopRequested) continue;
    if (!nextRoots.has(s.agent.root)) {
      logLine(s.prefix, 'removed from host.yaml');
      void stopOne(s);
    }
  }

  // Add agents that were newly listed.
  for (const a of next) {
    if (currentRoots.has(a.root)) continue;
    const existingStopped = supervised.find((s) => s.agent.root === a.root && s.stopRequested);
    if (existingStopped) {
      // Re-enable a previously-removed entry.
      existingStopped.stopRequested = false;
      existingStopped.attempts = 0;
      logLine(existingStopped.prefix, 're-added from host.yaml');
      void startOne(existingStopped);
    } else {
      const s: SupervisedAgent = {
        agent: a,
        prefix: basename(a.root),
        bridge: null,
        attempts: 0,
        stopRequested: false,
      };
      supervised.push(s);
      logLine(s.prefix, 'picked up from host.yaml');
      void startOne(s);
    }
  }
}
