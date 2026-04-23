import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createConnection } from 'node:net';
import { log } from './log.js';

export interface OwnerAppSpawnOptions {
  /** Absolute path to the owner-app directory (contains `.next/` + `package.json`). */
  dir: string;
  /** Port the owner-app Node server listens on. */
  port: number;
  /** Hostname the owner-app binds to. Default `127.0.0.1`. */
  hostname?: string;
  /** Admin token forwarded into the owner-app env. */
  adminToken: string;
  /** Runtime URL the owner-app calls (e.g. `http://127.0.0.1:443`). */
  runtimeUrl: string;
  /** Agent DID. */
  agentDid: string;
  /** Principal DID. */
  principalDid: string;
  /** External URL the owner app renders in QR codes. */
  ownerAppBaseUrl: string;
  /** Session-cookie secret. */
  sessionSecret: string;
  /** Principal-keys JSON file. */
  principalKeysPath?: string;
  /** Scope catalog directory (optional). */
  scopeCatalogDir?: string;
  /** Scope catalog version label (optional). */
  scopeCatalogVersion?: string;
}

export interface SpawnedOwnerApp {
  /** Base URL of the local Next.js server. */
  url: string;
  child: ChildProcess;
  stop(): Promise<void>;
}

/**
 * Spawn the Next.js owner app as a child process. Resolves once the child
 * is listening on the requested port (TCP-probe loop with a 30s budget).
 *
 * The sidecar's Hono runtime proxies `/owner/*` and the owner-subdomain
 * host to `url` — see `ownerApp` option on the runtime.
 */
export async function spawnOwnerApp(
  opts: OwnerAppSpawnOptions,
): Promise<SpawnedOwnerApp> {
  const standalone = resolve(opts.dir, '.next', 'standalone');
  const serverJs = join(standalone, 'server.js');
  if (!existsSync(serverJs)) {
    throw new Error(
      `owner-app standalone build not found at ${serverJs}. Run \`pnpm --filter @kybernesis/arp-owner-app build\`.`,
    );
  }

  const hostname = opts.hostname ?? '127.0.0.1';
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(opts.port),
    HOSTNAME: hostname,
    ARP_RUNTIME_URL: opts.runtimeUrl,
    ARP_ADMIN_TOKEN: opts.adminToken,
    ARP_AGENT_DID: opts.agentDid,
    ARP_PRINCIPAL_DID: opts.principalDid,
    ARP_OWNER_APP_BASE_URL: opts.ownerAppBaseUrl,
    ARP_SESSION_SECRET: opts.sessionSecret,
  };
  if (opts.principalKeysPath) env.ARP_PRINCIPAL_KEYS_PATH = opts.principalKeysPath;
  if (opts.scopeCatalogDir) env.ARP_SCOPE_CATALOG_DIR = opts.scopeCatalogDir;
  if (opts.scopeCatalogVersion)
    env.ARP_SCOPE_CATALOG_VERSION = opts.scopeCatalogVersion;

  const child = spawn(process.execPath, [serverJs], {
    cwd: standalone,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logger = log();
  child.stdout?.on('data', (chunk: Buffer) => logger.info({ src: 'owner-app' }, chunk.toString('utf8').trimEnd()));
  child.stderr?.on('data', (chunk: Buffer) => logger.error({ src: 'owner-app' }, chunk.toString('utf8').trimEnd()));

  await waitForPort(hostname, opts.port, 30_000);

  return {
    url: `http://${hostname}:${opts.port}`,
    child,
    async stop() {
      if (child.killed) return;
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        // Hard-kill after 5s.
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 5000);
      });
    },
  };
}

function waitForPort(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = createConnection({ host, port });
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`owner-app did not start on ${host}:${port} within ${timeoutMs}ms`));
          return;
        }
        setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}
