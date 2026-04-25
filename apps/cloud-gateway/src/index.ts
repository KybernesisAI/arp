/**
 * Programmatic entry point for the cloud gateway. Starts a Hono HTTP
 * server + attaches the WS upgrade handler. Used by apps/cloud-gateway/
 * src/bin.ts (CLI) and tests/phase-7/*.
 */

import { createAdaptorServer } from '@hono/node-server';
import { readFileSync } from 'node:fs';
import { createPdp, type Pdp } from '@kybernesis/arp-pdp';
import { createResolver, type Resolver } from '@kybernesis/arp-resolver';
import {
  createCloudWsServer,
  createPostgresAudit,
  createGatewayApp,
  createSessionRegistry,
  createLogger,
  createInMemoryMetrics,
  createCloudAwareResolver,
  type CloudRuntimeLogger,
  type TenantMetrics,
  type PeerResolver,
  type SessionRegistry,
  type PostgresAudit,
} from '@kybernesis/arp-cloud-runtime';
import type { CloudDbClient, TenantDb } from '@kybernesis/arp-cloud-db';
import type { Server as HttpServer } from 'node:http';

export interface GatewayOptions {
  db: CloudDbClient;
  cedarSchemaJson: string;
  /** Optional resolver override (tests). Production uses built-in did:web + HNS. */
  peerResolver?: PeerResolver;
  logger?: CloudRuntimeLogger;
  metrics?: TenantMetrics;
  /**
   * Bind hostname. Defaults to `127.0.0.1` for local + tests so dev
   * boxes don't accidentally expose the gateway. Production deploys
   * (Railway, Fly, etc) MUST set this to `0.0.0.0` so the platform's
   * load balancer can reach the container.
   */
  hostname?: string;
  /** Optional clock injection. */
  now?: () => number;
}

export interface GatewayHandle {
  httpServer: HttpServer;
  port: number;
  sessions: SessionRegistry;
  close(): Promise<void>;
}

export async function startGateway(port: number, opts: GatewayOptions): Promise<GatewayHandle> {
  const logger = opts.logger ?? createLogger({ bindings: { service: 'arp-cloud-gateway' } });
  const metrics = opts.metrics ?? createInMemoryMetrics();
  const sessions = createSessionRegistry();
  const pdp: Pdp = createPdp(opts.cedarSchemaJson);
  const peerResolver: PeerResolver = opts.peerResolver ?? buildCloudAwareResolver(opts.db);

  const auditFactory = (tenantDb: TenantDb): PostgresAudit =>
    createPostgresAudit({ tenantDb, logger });

  const app = createGatewayApp({
    db: opts.db,
    sessions,
    pdp,
    resolver: peerResolver,
    logger,
    metrics,
    auditFactory,
    ...(opts.now ? { now: opts.now } : {}),
  });

  const hostname = opts.hostname ?? '127.0.0.1';
  const server = createAdaptorServer({
    fetch: app.fetch,
    port,
    hostname,
  }) as unknown as HttpServer;

  const ws = createCloudWsServer({ db: opts.db, sessions, logger });
  ws.attach(server);

  const actualPort = await new Promise<number>((resolve) => {
    server.listen(port, hostname, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
      else resolve(port);
    });
  });

  return {
    httpServer: server,
    port: actualPort,
    sessions,
    async close() {
      await ws.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

function buildDefaultResolver(): PeerResolver {
  const r: Resolver = createResolver();
  return {
    async resolveDid(did) {
      const result = await r.resolveDidWeb(did);
      if (!result.ok) return null;
      return result.value;
    },
  };
}

/**
 * Resolver that first checks the cloud's own `agents` table — peers
 * provisioned through cloud.arp.run have their public keys stored
 * locally and don't need (and often can't be reached via) public DNS.
 * Falls back to standard did:web HTTPS resolution for anyone outside
 * our tenant graph.
 *
 * Implementation lives in @kybernesis/arp-cloud-runtime where the
 * drizzle dep is already on the dependency tree.
 */
function buildCloudAwareResolver(db: CloudDbClient): PeerResolver {
  const fallback = buildDefaultResolver();
  return createCloudAwareResolver(db, fallback);
}

export function loadCedarSchema(path: string): string {
  return readFileSync(path, 'utf8');
}
