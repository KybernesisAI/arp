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
  createForwardOutboundEnvelope,
  type CloudRuntimeLogger,
  type TenantMetrics,
  type PeerResolver,
  type SessionRegistry,
  type PostgresAudit,
  createForwardEnvelope,
  pushSignerFromJwk,
  sealingKeyFromEnv,
  type PushContext,
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
  /** AgentID S2: ICANN mirror suffix (default from AGENTID_MIRROR_SUFFIX, `.agent.arp.run`). */
  mirrorSuffix?: string | null;
  /** AgentID S2: profile base for `/` redirects (default from AGENTID_PROFILE_BASE). */
  profileBase?: string | null;
  /** AgentID S4: push signer JWK (default from ARP_CLOUD_PUSH_SIGNING_JWK); null disables push. */
  pushSigningJwk?: string | null;
  /** AgentID S4: issuer origin for push tokens (default ARP_CLOUD_PUSH_ISSUER or https://gateway.arp.run). */
  pushIssuer?: string;
  /** AgentID S4: sealing key override (default from ARP_CLOUD_KEY_ENCRYPTION_KEY / dev key). */
  sealingKey?: Uint8Array;
  /** AgentID S4: fetch override for push delivery (tests). */
  pushFetch?: typeof fetch;
  /** AgentID S5: A2A message/send reply wait (ms); default from ARP_A2A_WAIT_MS or 120s. */
  a2aWaitMs?: number;
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

  // AgentID S4: push delivery context. The forward function is filled in
  // after the forwarder exists (it needs the same push ctx for the peer's
  // own push delivery) — a two-step init that avoids a module cycle.
  const jwkJson = opts.pushSigningJwk !== undefined ? opts.pushSigningJwk : (process.env['ARP_CLOUD_PUSH_SIGNING_JWK'] ?? null);
  let push: PushContext | undefined;
  if (jwkJson) {
    const signer = await pushSignerFromJwk(jwkJson);
    push = {
      issuer: opts.pushIssuer ?? process.env['ARP_CLOUD_PUSH_ISSUER'] ?? 'https://gateway.arp.run',
      signer,
      sealingKey: opts.sealingKey ?? sealingKeyFromEnv(),
      ...(opts.pushFetch ? { fetchImpl: opts.pushFetch } : {}),
      forward: async () => null,
    };
  }

  const app = createGatewayApp({
    db: opts.db,
    sessions,
    pdp,
    resolver: peerResolver,
    logger,
    metrics,
    auditFactory,
    ...(opts.now ? { now: opts.now } : {}),
    ...(push ? { push } : {}),
    a2aWaitMs: opts.a2aWaitMs ?? Number(process.env['ARP_A2A_WAIT_MS'] ?? 120_000),
    mirrorSuffix:
      opts.mirrorSuffix !== undefined
        ? opts.mirrorSuffix
        : (process.env['AGENTID_MIRROR_SUFFIX'] ?? '.agent.arp.run'),
    profileBase:
      opts.profileBase !== undefined
        ? opts.profileBase
        : (process.env['AGENTID_PROFILE_BASE'] ?? 'https://agent.arp.run'),
  });

  const hostname = opts.hostname ?? '127.0.0.1';
  const server = createAdaptorServer({
    fetch: app.fetch,
    port,
    hostname,
  }) as unknown as HttpServer;

  const forwardOpts = {
    db: opts.db,
    sessions,
    pdp,
    resolver: peerResolver,
    logger,
    metrics,
    auditFactory,
    ...(opts.now ? { now: opts.now } : {}),
    ...(push ? { push } : {}),
  };
  if (push) {
    const forwardEnvelope = createForwardEnvelope(forwardOpts);
    push.forward = (params) => forwardEnvelope(params);
  }
  const onOutboundEnvelope = createForwardOutboundEnvelope({
    ...forwardOpts,
  });
  const ws = createCloudWsServer({
    db: opts.db,
    sessions,
    logger,
    onOutboundEnvelope,
  });
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
