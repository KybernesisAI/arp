/**
 * HTTP surface for the cloud-gateway Hono server.
 *
 * Routes:
 *   GET  /.well-known/did.json              — per-tenant agent DID doc
 *   GET  /.well-known/agent-card.json       — per-tenant agent card
 *   GET  /.well-known/arp.json              — per-tenant arp.json
 *   GET  /.well-known/revocations.json      — per-tenant revocation list
 *   POST /didcomm                           — inbound DIDComm envelope
 *   GET  /health                            — health + queue depth
 *
 * Host routing: each request's `Host` header is parsed to identify the
 * target agent DID. Three shapes supported:
 *   1. `<agent>.agent`                     → agent DID `did:web:<agent>.agent`
 *   2. `<owner>.<agent>.agent`             → still the agent DID
 *   3. `<agent>.agent.hns.to`              → HNS gateway, same agent DID
 *
 * Reserved: the cloud's own control-plane host does not hit this surface —
 * apps/cloud (Next.js) owns the human-facing UX at that hostname.
 */

import { Hono } from 'hono';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { toTenantId, withTenant, agents } from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';
import type { PostgresAudit } from './audit.js';
import type { DispatchContext, PeerResolver } from './dispatch.js';
import { dispatchInbound } from './dispatch.js';
import type { Pdp } from '@kybernesis/arp-pdp';
import type { SessionRegistry } from './sessions.js';
import type { CloudRuntimeLogger, TenantMetrics } from './types.js';

export interface GatewayHonoOptions {
  db: CloudDbClient;
  sessions: SessionRegistry;
  pdp: Pdp;
  resolver: PeerResolver;
  logger: CloudRuntimeLogger;
  metrics: TenantMetrics;
  auditFactory: (tenantDbForAgent: ReturnType<typeof withTenant>) => PostgresAudit;
  now?: () => number;
}

/** Parse Host header into the target agent DID, or null if not routable. */
export function agentDidFromHost(host: string): string | null {
  const normalized = host.toLowerCase().replace(/:[0-9]+$/, '');
  if (!normalized) return null;
  // Strip hns.to gateway suffix.
  const hnsToSuffix = '.hns.to';
  const hostCore = normalized.endsWith(hnsToSuffix)
    ? normalized.slice(0, -hnsToSuffix.length)
    : normalized;
  const labels = hostCore.split('.');
  if (labels.length < 2) return null;
  // Accept only hostnames that terminate with the agent TLD.
  const tld = labels[labels.length - 1];
  if (tld !== 'agent') return null;
  // The agent DID identifies on the first 2 labels from the right that end
  // at `.agent`: e.g. samantha.agent, atlas.agent, ghost.agent.
  const agentLabel = labels[labels.length - 2];
  if (!agentLabel) return null;
  return `did:web:${agentLabel}.agent`;
}

export function createGatewayApp(opts: GatewayHonoOptions): Hono {
  const app = new Hono();
  const now = opts.now ?? (() => Date.now());

  async function resolveAgentContext(host: string): Promise<{
    tenantId: string;
    agentDid: string;
    agentRow: typeof agents.$inferSelect;
  } | null> {
    const agentDid = agentDidFromHost(host);
    if (!agentDid) return null;
    const rows = await opts.db.select().from(agents).where(eq(agents.did, agentDid)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return { tenantId: row.tenantId, agentDid, agentRow: row };
  }

  app.get('/health', async (c) => {
    return c.json({
      ok: true,
      sessions: opts.sessions.size(),
      uptime_ms: now(),
    });
  });

  const wellKnownHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
    'Access-Control-Allow-Origin': '*',
  } as const;

  app.get('/.well-known/did.json', async (c) => {
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '';
    const ctx = await resolveAgentContext(host);
    if (!ctx) return c.json({ error: 'unknown_agent' }, 404);
    return c.newResponse(JSON.stringify(ctx.agentRow.wellKnownDid), 200, wellKnownHeaders);
  });

  app.get('/.well-known/agent-card.json', async (c) => {
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '';
    const ctx = await resolveAgentContext(host);
    if (!ctx) return c.json({ error: 'unknown_agent' }, 404);
    return c.newResponse(JSON.stringify(ctx.agentRow.wellKnownAgentCard), 200, wellKnownHeaders);
  });

  app.get('/.well-known/arp.json', async (c) => {
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '';
    const ctx = await resolveAgentContext(host);
    if (!ctx) return c.json({ error: 'unknown_agent' }, 404);
    return c.newResponse(JSON.stringify(ctx.agentRow.wellKnownArp), 200, wellKnownHeaders);
  });

  app.get('/.well-known/revocations.json', async (c) => {
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '';
    const ctx = await resolveAgentContext(host);
    if (!ctx) return c.json({ error: 'unknown_agent' }, 404);
    const tenantDb = withTenant(opts.db, toTenantId(ctx.tenantId));
    const revocations = await tenantDb.listRevocations(ctx.agentDid);
    return c.json({
      issuer: ctx.agentRow.principalDid,
      updated_at: new Date(now()).toISOString(),
      revocations: revocations.map((r) => ({
        type: r.kind,
        id: r.subjectId,
        revoked_at: r.revokedAt.toISOString(),
        reason: r.reason ?? undefined,
      })),
    });
  });

  app.post('/didcomm', async (c) => {
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '';
    const ctx = await resolveAgentContext(host);
    if (!ctx) return c.json({ error: 'unknown_agent' }, 404);
    const envelope = await c.req.text();
    if (!envelope || !envelope.includes('.')) {
      return c.json({ error: 'invalid_envelope' }, 400);
    }
    const tenantDb = withTenant(opts.db, toTenantId(ctx.tenantId));
    const dispatchCtx: DispatchContext = {
      tenantDb,
      tenantId: ctx.tenantId,
      agentDid: ctx.agentDid,
      audit: opts.auditFactory(tenantDb),
      pdp: opts.pdp,
      resolver: opts.resolver,
      sessions: opts.sessions,
      logger: opts.logger,
      metrics: opts.metrics,
      now,
    };
    const result = await dispatchInbound(dispatchCtx, envelope);
    if (!result.ok) {
      return c.json({ ok: false, error: result.reason }, 400);
    }
    return c.json(
      { ok: true, decision: result.decision, queued: result.queued ?? false, messageId: result.messageId },
      202,
    );
  });

  return app;
}
