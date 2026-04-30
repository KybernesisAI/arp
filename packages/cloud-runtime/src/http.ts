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
import { verifyAgentBearer } from './bearer.js';

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
    try {
      const rows = await opts.db.select().from(agents).where(eq(agents.did, agentDid)).limit(1);
      const row = rows[0];
      if (!row) return null;
      return { tenantId: row.tenantId, agentDid, agentRow: row };
    } catch (err) {
      opts.logger.error({ err: (err as Error).message, agentDid }, 'agent_lookup_failed');
      return null;
    }
  }

  /**
   * Pick the effective agent hostname from a request. Tries (in order):
   *
   *   1. `?target=<host>` query string — works through any reverse proxy
   *      (Railway, Fly, Cloudflare) that rewrites Host headers.
   *   2. `X-Forwarded-Host` header — set by sane proxies that preserve
   *      the original incoming Host.
   *   3. `Host` header — works on direct connections + custom domains.
   *
   * Required because Railway overwrites X-Forwarded-Host with its own
   * load-balancer hostname, breaking Host-based multi-tenant routing.
   * Until the gateway sits behind a custom domain (gateway.arp.run),
   * callers must pass ?target=atlas.agent or the gateway returns
   * unknown_agent.
   */
  function effectiveHost(c: { req: { header(n: string): string | undefined; query(n: string): string | undefined } }): string {
    return (
      c.req.query('target') ??
      c.req.header('x-forwarded-host') ??
      c.req.header('host') ??
      ''
    );
  }

  app.get('/health', async (c) => {
    return c.json({
      ok: true,
      sessions: opts.sessions.size(),
      uptime_ms: now(),
    });
  });

  // Debug endpoint — echoes the headers the gateway received and the agent
  // DID it would resolve them to. Used to diagnose Host-header routing
  // issues behind reverse proxies (Railway, Fly, Cloudflare, etc).
  app.get('/__debug/host', async (c) => {
    const host = c.req.header('host') ?? null;
    const xfh = c.req.header('x-forwarded-host') ?? null;
    const xfp = c.req.header('x-forwarded-proto') ?? null;
    const xfor = c.req.header('x-forwarded-for') ?? null;
    const target = c.req.query('target') ?? null;
    const effective = target ?? xfh ?? host ?? '';
    const agentDid = agentDidFromHost(effective);
    let agentRowFound = false;
    if (agentDid) {
      const rows = await opts.db
        .select({ did: agents.did })
        .from(agents)
        .where(eq(agents.did, agentDid))
        .limit(1);
      agentRowFound = rows.length > 0;
    }
    return c.json({
      headers: { host, 'x-forwarded-host': xfh, 'x-forwarded-proto': xfp, 'x-forwarded-for': xfor },
      query_target: target,
      effective_host: effective,
      parsed_agent_did: agentDid,
      agent_row_found: agentRowFound,
    });
  });

  const wellKnownHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
    'Access-Control-Allow-Origin': '*',
  } as const;

  app.get('/.well-known/did.json', async (c) => {
    const host = effectiveHost(c);
    const ctx = await resolveAgentContext(host);
    if (!ctx) return c.json({ error: 'unknown_agent' }, 404);
    return c.newResponse(JSON.stringify(ctx.agentRow.wellKnownDid), 200, wellKnownHeaders);
  });

  app.get('/.well-known/agent-card.json', async (c) => {
    const host = effectiveHost(c);
    const ctx = await resolveAgentContext(host);
    if (!ctx) return c.json({ error: 'unknown_agent' }, 404);
    return c.newResponse(JSON.stringify(ctx.agentRow.wellKnownAgentCard), 200, wellKnownHeaders);
  });

  app.get('/.well-known/arp.json', async (c) => {
    const host = effectiveHost(c);
    const ctx = await resolveAgentContext(host);
    if (!ctx) return c.json({ error: 'unknown_agent' }, 404);
    return c.newResponse(JSON.stringify(ctx.agentRow.wellKnownArp), 200, wellKnownHeaders);
  });

  app.get('/.well-known/revocations.json', async (c) => {
    const host = effectiveHost(c);
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

  /**
   * GET /agent-connections — bearer-authenticated; lists the calling
   * agent's active connections with peer DIDs + scope-selections so an
   * arpc-driven contact skill can introspect what typed actions are
   * available on each peer.
   *
   * Auth: same `<ts>.<sigB64>` bearer the WS uses. Pass `?did=<agent>`
   * (or set `Authorization: Bearer <ts>.<sig> <did>`) so the server
   * knows which agent is asking.
   *
   * Response shape:
   *   {
   *     agent_did: string,
   *     connections: [{
   *       connection_id, peer_did, status, purpose,
   *       scope_selections: [{ id, params }],
   *       expires_at,
   *     }]
   *   }
   *
   * Excludes revoked connections by default. Active + expiring are
   * returned; the bridge filters for what the LLM should consider.
   */
  app.get('/agent-connections', async (c) => {
    const did = c.req.query('did');
    if (!did) return c.json({ error: 'missing_did' }, 400);
    const authHeader = c.req.header('authorization') ?? '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!bearer) return c.json({ error: 'missing_bearer' }, 401);

    const auth = await verifyAgentBearer(did, bearer, { db: opts.db, now });
    if (!auth.ok) {
      return c.json({ error: auth.reason }, auth.status as 401 | 500);
    }

    const tenantDb = withTenant(opts.db, toTenantId(auth.tenantId));
    const conns = await tenantDb.listConnections({ agentDid: auth.agentDid });
    const out = conns
      .filter((c) => c.status === 'active' || c.status === 'expiring')
      .map((conn) => {
        // scope_selections live in `metadata.scopeSelections` on each
        // connection row (accept route stores them there explicitly so
        // the connection-edit UI can pre-fill the picker). Fall back to
        // `tokenJson.scope_selections` for legacy rows from earlier
        // builds where the field was on the token. Both shapes use the
        // same `[{id, params?}]` payload.
        const meta = conn.metadata as
          | { scopeSelections?: Array<{ id: string; params?: Record<string, unknown> }> }
          | null;
        const token = conn.tokenJson as
          | {
              scope_selections?: Array<{ id: string; params?: Record<string, unknown> }>;
              expires_at?: string;
              expires?: string;
            }
          | null;
        const scopeSelections =
          meta?.scopeSelections ?? token?.scope_selections ?? [];
        return {
          connection_id: conn.connectionId,
          peer_did: conn.peerDid,
          status: conn.status,
          purpose: conn.purpose,
          scope_selections: scopeSelections,
          expires_at: token?.expires_at ?? token?.expires ?? null,
        };
      });
    return c.json({ agent_did: auth.agentDid, connections: out });
  });

  app.post('/didcomm', async (c) => {
    const host = effectiveHost(c);
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
      {
        ok: true,
        decision: result.decision,
        queued: result.queued ?? false,
        messageId: result.messageId,
        // Surface the deny reason so senders' CLI can print something
        // actionable instead of timing out on awaitReply. PDP denies set
        // reason='policy_denied'; transport-layer denies (revoked,
        // suspended) carry their own reason strings.
        ...(result.reason ? { reason: result.reason } : {}),
      },
      202,
    );
  });

  return app;
}
