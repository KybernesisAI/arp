/**
 * @kybernesis/arp-cloud-runtime — multi-tenant engine shared by
 * apps/cloud (Next.js UI + REST API) and apps/cloud-gateway (Hono + ws
 * gateway). Exposes:
 *
 *   - dispatchInbound      — verify envelope, evaluate PDP, enqueue or
 *                            deliver over WS
 *   - PostgresAudit        — hash-chained audit per agent+connection in
 *                            Postgres
 *   - SessionRegistry      — in-process map of active WS sessions
 *   - CloudWsServer        — ws handler that attaches to any HTTP server
 *   - createGatewayApp     — Hono app for /didcomm + /.well-known/*
 *   - InMemoryMetrics +
 *     LogBasedMetrics      — TenantMetrics implementations
 *   - createLogger         — pino wrapper
 */

export * from './types.js';
export * from './audit.js';
export * from './sessions.js';
export * from './dispatch.js';
export * from './ws-server.js';
export * from './http.js';
export * from './forward.js';
export * from './logger.js';
export * from './metrics.js';
export * from './resolver.js';

// AgentID S4: push delivery + agent-API.
export { createForwardEnvelope } from './forward.js';
export {
  awaitReply,
  deliverEve,
  deliverGeneric,
  deliverPush,
  extractText,
  mintPushToken,
  pendingReplyCount,
  pushSignerFromJwk,
  resolvePendingReply,
  sendFromCloudIdentity,
} from './push.js';
export type { PushContext, PushSigner, PushClaims, DeliveryInput, DeliverPushResult } from './push.js';
export { openPrivateKey, sealingKeyFromEnv } from './custody.js';
