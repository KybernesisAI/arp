/**
 * HTTP surface for the cloud-gateway Hono server.
 *
 * Routes:
 *   GET  /.well-known/did.json              — per-tenant agent DID doc
 *   GET  /.well-known/agent-card.json       — per-tenant A2A card (S5); arp-card.json = ARP card
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

import { Hono, type Context } from 'hono';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { toTenantId, withTenant, agents, agentLinks, registrarBindings, findAgentCredentialByHash, touchAgentCredential } from '@kybernesis/arp-cloud-db';
import { createHash } from 'node:crypto';
import { awaitReply, cancelPendingReply, sendFromCloudIdentity, type PushContext } from './push.js';
import { connectionTokenBearer, createA2aTransport, type FetchLike } from '@kybernesis/arp-transport-a2a';
import { handleA2aRequest, type JsonRpcRequest } from './a2a.js';
import { ed25519ToJwk, multibaseEd25519ToRaw, signAgentCard } from '@kybernesis/arp-transport';
import { buildA2aAgentCard } from '@kybernesis/arp-templates';
import { openPrivateKey } from './custody.js';
import { and, desc, eq } from 'drizzle-orm';
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
  /**
   * AgentID S2: ICANN mirror suffix. `<sld>.agent<suffix>` (e.g.
   * `samantha.agent.arp.run` with suffix `.arp.run`) resolves to
   * `did:web:samantha.agent` exactly like the HNS hostname does.
   * Note the suffix is what follows `.agent`, so `.agent.arp.run` and
   * `.arp.run` are both accepted for the same host.
   */
  mirrorSuffix?: string | null;
  /** AgentID S2: `GET /` on a mirror host 302s to `${profileBase}/<sld>`. */
  profileBase?: string | null;
  /** AgentID S4: push delivery + agent-API signer; absent = push disabled. */
  push?: PushContext;
  /** AgentID S5: how long message/send waits for a reply (ms). Default 120s. */
  a2aWaitMs?: number;
  /**
   * AgentID S5 / A4: outbound A2A for peers not hosted on this gateway.
   * The agent-API `send` falls back to the peer's signed A2A card
   * (`https://<did:web host>/.well-known/agent-card.json`, or the mirror for
   * `.agent` names) and `message/send` with the Connection Token as bearer.
   * `fetchImpl` is injectable for tests; `enabled: false` turns it off.
   */
  a2aOutbound?: { enabled?: boolean; fetchImpl?: FetchLike; originForDid?: (did: string) => string | null };
}

/**
 * Parse Host header into the target agent DID, or null if not routable.
 *
 * `mirrorSuffix` (optional) is an ICANN suffix appended to the `.agent`
 * name for browsers + A2A clients that cannot resolve HNS — e.g.
 * `samantha.agent.arp.run`. Public HNS resolvers were measured unreliable
 * on 2026-09-17, so the mirror is the primary reachable face of an identity.
 */
export function agentDidFromHost(host: string, mirrorSuffix?: string | null): string | null {
  const normalized = host.toLowerCase().replace(/:[0-9]+$/, '');
  if (!normalized) return null;
  // Strip the ICANN mirror suffix (accept both `.agent.arp.run` and `.arp.run` forms).
  let hostCore = normalized;
  if (mirrorSuffix) {
    const suffix = mirrorSuffix.toLowerCase().replace(/^\.?/, '.');
    // Accept `<sld>.agent.arp.run` for either configured form of the suffix.
    const full = suffix.startsWith('.agent.') ? suffix : `.agent${suffix}`;
    if (hostCore.endsWith(full) && hostCore.length > full.length) {
      hostCore = `${hostCore.slice(0, -full.length)}.agent`;
    }
  }
  // Strip hns.to gateway suffix.
  const hnsToSuffix = '.hns.to';
  hostCore = hostCore.endsWith(hnsToSuffix)
    ? hostCore.slice(0, -hnsToSuffix.length)
    : hostCore;
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
    const agentDid = agentDidFromHost(host, opts.mirrorSuffix ?? null);
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
    const agentDid = agentDidFromHost(effective, opts.mirrorSuffix ?? null);
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

  // AgentID S2: a browser landing on the mirror host root gets the public
  // profile page; everything machine-readable stays under /.well-known.
  app.get('/', async (c) => {
    const host = effectiveHost(c);
    const agentDid = agentDidFromHost(host, opts.mirrorSuffix ?? null);
    if (agentDid && opts.profileBase) {
      const sld = agentDid.replace(/^did:web:/, '').replace(/\.agent$/, '');
      return c.redirect(`${opts.profileBase.replace(/\/+$/, '')}/${encodeURIComponent(sld)}`, 302);
    }
    return c.json({ error: 'not_found' }, 404);
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

  // AgentID S5: /.well-known/agent-card.json is the A2A v1.0 card (the
  // standard's path); ARP's own card lives at /.well-known/arp-card.json.
  // Rows minted before S5 have no A2A card yet → fall back to the ARP card so
  // nothing 404s during the transition.
  /**
   * AgentID S5: identities minted before the A2A card existed (or whose card
   * was cleared) get one built on first fetch and persisted. The gateway
   * holds the sealing key, so cloud-custody rows get a card signed with the
   * identity's own key; exported-custody rows get an unsigned card (schema-
   * valid, discoverable) until their runtime signs it via `arpc` (S5b).
   */
  async function lazyA2aCard(ctx: NonNullable<Awaited<ReturnType<typeof resolveAgentContext>>>): Promise<Record<string, unknown> | null> {
    const row = ctx.agentRow;
    if (row.wellKnownA2aCard) return row.wellKnownA2aCard as Record<string, unknown>;
    const canSign = row.keyCustody === 'cloud' && !!row.privateKeyEnc && !!opts.push;
    const sld = ctx.agentDid.replace(/^did:web:/, '').replace(/\.agent$/, '');
    const fromDoc = (row.wellKnownDid as { service?: Array<{ type: string; serviceEndpoint: string }> } | null)?.service?.find(
      (svc) => svc.type === 'AgentCard',
    )?.serviceEndpoint;
    let origin: string;
    try {
      origin = fromDoc ? new URL(fromDoc).origin : `https://${sld}.agent${opts.mirrorSuffix ?? ''}`;
    } catch {
      origin = `https://${sld}.agent${opts.mirrorSuffix ?? ''}`;
    }
    try {
      const card = buildA2aAgentCard({
        name: row.agentName,
        description: row.agentDescription || 'Personal agent',
        did: ctx.agentDid,
        origin,
        pairUrl: `https://cloud.arp.run/pair?peer=${encodeURIComponent(ctx.agentDid)}`,
        provider: { organization: sld, url: `https://agent.arp.run/${sld}` },
      }) as Record<string, unknown>;
      let out = card;
      if (canSign && row.privateKeyEnc && opts.push) {
        const seed = openPrivateKey(row.privateKeyEnc, opts.push.sealingKey);
        const sig = await signAgentCard(card, { privateKey: seed, kid: `${ctx.agentDid}#key-1`, jku: `${origin}/.well-known/jwks.json` });
        seed.fill(0);
        out = { ...card, signatures: [sig] };
      }
      await withTenant(opts.db, toTenantId(ctx.tenantId)).updateAgent(ctx.agentDid, { wellKnownA2aCard: out });
      opts.logger.info({ agentDid: ctx.agentDid, signed: canSign }, 'a2a_card_backfilled');
      return out;
    } catch (err) {
      opts.logger.error({ err: (err as Error).message, agentDid: ctx.agentDid }, 'a2a_card_backfill_failed');
      return null;
    }
  }

  app.get('/.well-known/agent-card.json', async (c) => {
    const host = effectiveHost(c);
    const ctx = await resolveAgentContext(host);
    if (!ctx) return c.json({ error: 'unknown_agent' }, 404);
    const card = (await lazyA2aCard(ctx)) ?? ctx.agentRow.wellKnownAgentCard;
    return c.newResponse(JSON.stringify(card), 200, wellKnownHeaders);
  });

  app.get('/.well-known/arp-card.json', async (c) => {
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

  // AgentID S2 / T6: the owner's representation JWT, self-hosted. The DID
  // document's `principal.representationVC` points here. Served raw as
  // application/jwt so verifiers (testkit, peers) can fetch + verify it
  // without any DNS TXT lookup.
  const serveRepresentationJwt = async (c: Context): Promise<Response> => {
    const host = effectiveHost(c);
    const ctx = await resolveAgentContext(host);
    if (!ctx) return c.json({ error: 'unknown_agent' }, 404);
    const domain = ctx.agentDid.replace(/^did:web:/, '');
    const rows = await opts.db
      .select({ jwt: registrarBindings.representationJwt })
      .from(registrarBindings)
      .where(eq(registrarBindings.domain, domain))
      .orderBy(desc(registrarBindings.createdAt))
      .limit(1);
    const row = rows[0];
    if (!row) return c.json({ error: 'no_owner_binding' }, 404);
    return c.newResponse(row.jwt, 200, {
      'Content-Type': 'application/jwt',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    });
  };
  app.get('/representation.jwt', serveRepresentationJwt);
  app.get('/.well-known/representation.jwt', serveRepresentationJwt);

  // AgentID S3 / L4: NIP-05 identifier document. `_@<sld>.agent` (and the
  // mirror form) maps to the verified nostr key linked to this identity, so
  // any nostr client shows the name as verified once the profile sets nip05.
  app.get('/.well-known/nostr.json', async (c) => {
    const host = effectiveHost(c);
    const ctx = await resolveAgentContext(host);
    if (!ctx) return c.json({ names: {} }, 404);
    const name = c.req.query('name');
    const rows = await opts.db
      .select({ value: agentLinks.value })
      .from(agentLinks)
      .where(and(eq(agentLinks.agentDid, ctx.agentDid), eq(agentLinks.kind, 'nostr'), eq(agentLinks.status, 'verified')))
      .orderBy(desc(agentLinks.verifiedAt))
      .limit(1);
    const hex = rows[0]?.value;
    const names: Record<string, string> = {};
    if (hex && (!name || name === '_')) names['_'] = hex;
    return c.newResponse(JSON.stringify({ names }), 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    });
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

  // ---------------------------------------------------------------- AgentID S4
  // JWKS for push tokens (runtimes verify offline; see @kybernesis/identity).
  app.get('/.well-known/jwks.json', async (c) => {
    // AgentID S5: on an identity host (mirror / HNS), the JWKS is the
    // identity's own Ed25519 key — the `jku` its signed A2A card points at.
    // On the bare gateway host it is the push-token signer.
    const ctx = await resolveAgentContext(effectiveHost(c));
    if (ctx) {
      const jwk = ed25519ToJwk(multibaseEd25519ToRaw(ctx.agentRow.publicKeyMultibase), `${ctx.agentDid}#key-1`);
      return c.newResponse(JSON.stringify({ keys: [jwk] }), 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      });
    }
    if (!opts.push) return c.json({ keys: [] }, 404);
    return c.newResponse(JSON.stringify(opts.push.signer.jwks), 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    });
  });

  // Agent-API: an attached runtime acts as its cloud-custody identity.
  // Bearer = agent credential (random token; only the SHA-256 hash is stored).
  async function agentFromBearer(c: Context): Promise<{ tenantId: string; row: typeof agents.$inferSelect } | null> {
    const auth = c.req.header('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) return null;
    const cred = await findAgentCredentialByHash(opts.db, createHash('sha256').update(token).digest('hex'));
    if (!cred) return null;
    const rows = await opts.db.select().from(agents).where(eq(agents.did, cred.agentDid)).limit(1);
    const row = rows[0];
    if (!row || row.tenantId !== cred.tenantId) return null;
    void touchAgentCredential(opts.db, cred.id).catch(() => undefined);
    return { tenantId: cred.tenantId, row };
  }

  app.get('/agent-api/me', async (c) => {
    const me = await agentFromBearer(c);
    if (!me) return c.json({ error: 'unauthorized' }, 401);
    return c.json({ agent_did: me.row.did, name: me.row.agentName, runtime_kind: me.row.runtimeKind });
  });

  /**
   * Active connections for an agent, seen from that agent's side. When both
   * agents live in one tenant the (tenant_id, connection_id) PK permits a
   * single row, oriented from the accepting agent — so a connection where
   * this agent is the `peer_did` is equally its own. `peer` is the other side.
   */
  async function activeConnectionsFor(tenantDb: ReturnType<typeof withTenant>, did: string) {
    const all = await tenantDb.listConnections({ status: 'active' });
    return all
      .filter((k) => k.agentDid === did || k.peerDid === did)
      .map((k) => ({ row: k, peer: k.agentDid === did ? k.peerDid : k.agentDid }));
  }

  app.get('/agent-api/connections', async (c) => {
    const me = await agentFromBearer(c);
    if (!me) return c.json({ error: 'unauthorized' }, 401);
    const tenantDb = withTenant(opts.db, toTenantId(me.tenantId));
    const conns = await activeConnectionsFor(tenantDb, me.row.did);
    return c.json({
      agent_did: me.row.did,
      connections: conns.map(({ row: k, peer }) => ({
        connection_id: k.connectionId,
        peer_did: peer,
        peer_name: peer.replace(/^did:web:/, '').replace(/\.agent$/, ''),
        purpose: k.purpose,
        label: k.label,
        expires_at: k.expiresAt?.toISOString() ?? null,
      })),
    });
  });

  app.post('/agent-api/send', async (c) => {
    const me = await agentFromBearer(c);
    if (!me) return c.json({ error: 'unauthorized' }, 401);
    if (!opts.push) return c.json({ error: 'push_disabled' }, 503);
    let body: { peer_did?: string; connection_id?: string; text?: string; thid?: string; wait_ms?: number; action?: string };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: 'bad_json' }, 400);
    }
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text) return c.json({ error: 'bad_request', message: 'text is required' }, 400);
    const tenantDb = withTenant(opts.db, toTenantId(me.tenantId));
    const match = (await activeConnectionsFor(tenantDb, me.row.did)).find(({ row: k, peer }) =>
      body.connection_id ? k.connectionId === body.connection_id : body.peer_did ? peer === body.peer_did : false,
    );
    if (!match) return c.json({ error: 'no_connection', message: 'No active connection with that peer.' }, 404);
    const conn = { ...match.row, peerDid: match.peer };
    const action = typeof body.action === 'string' && body.action ? body.action : undefined;
    const waitMs = Math.min(Math.max(body.wait_ms ?? 120_000, 1_000), 280_000);
    try {
      const sent = await sendFromCloudIdentity(opts.push, me.row, {
        peerDid: conn.peerDid,
        text,
        connectionId: conn.connectionId,
        ...(body.thid ? { thid: body.thid } : {}),
        ...(action ? { action } : {}),
      });
      const fwd = sent.forwarded as { ok?: boolean; decision?: string; reason?: string } | null;
      // A PDP deny comes back as `{ ok: true, decision: 'deny' }` (the dispatch
      // succeeded; the policy said no) — it is a denial to the caller, not a
      // reply that never arrived.
      if (fwd && (fwd.ok === false || fwd.decision === 'deny')) {
        cancelPendingReply(sent.thid);
        return c.json({ ok: false, error: 'denied', reason: fwd.reason ?? fwd.decision ?? 'denied', msg_id: sent.msgId, thid: sent.thid }, 403);
      }
      if (fwd === null) {
        // AgentID S5 / A4: the peer is not hosted here — try its A2A card.
        if (opts.a2aOutbound?.enabled === false) {
          return c.json({ ok: false, error: 'peer_not_hosted', msg_id: sent.msgId, thid: sent.thid }, 502);
        }
        const a2a = createA2aTransport({
          did: me.row.did,
          bearerFor: () => connectionTokenBearer(conn.tokenJson as Record<string, unknown>),
          waitMs,
          now,
          ...(opts.a2aOutbound?.fetchImpl ? { fetchImpl: opts.a2aOutbound.fetchImpl } : {}),
          ...(opts.a2aOutbound?.originForDid ? { originForDid: opts.a2aOutbound.originForDid } : {}),
          ...(opts.mirrorSuffix ? { mirrorSuffix: opts.mirrorSuffix } : {}),
        });
        const iface = await a2a.resolve(conn.peerDid);
        if (!iface) {
          return c.json({ ok: false, error: 'peer_unreachable', message: 'Peer is not hosted here and publishes no A2A card.', msg_id: sent.msgId, thid: sent.thid }, 502);
        }
        try {
          const out = await a2a.sendAndCollect(conn.peerDid, {
            id: sent.msgId,
            type: 'https://didcomm.org/arp/1.0/request',
            from: me.row.did,
            to: [conn.peerDid],
            thid: sent.thid,
            body: { text, connection_id: conn.connectionId },
          });
          if (out.denied) {
            opts.logger.info({ agentDid: me.row.did, peerDid: conn.peerDid, state: out.denied.state }, 'agent_api_a2a_denied');
            return c.json({ ok: false, error: 'denied', reason: out.denied.reason, a2a_state: out.denied.state, msg_id: sent.msgId, thid: sent.thid }, 403);
          }
          if (!out.response) {
            return c.json({ ok: true, msg_id: sent.msgId, thid: sent.thid, reply: null, timed_out: true, via: 'a2a', a2a_task_id: out.task.id }, 202);
          }
          await tenantDb.touchConnection(conn.connectionId);
          return c.json({
            ok: true,
            msg_id: sent.msgId,
            thid: sent.thid,
            reply: out.response.body['text'],
            reply_msg_id: out.response.id,
            via: 'a2a',
            a2a_task_id: out.task.id,
          });
        } catch (err) {
          opts.logger.error({ err: (err as Error).message, agentDid: me.row.did, peerDid: conn.peerDid }, 'agent_api_a2a_failed');
          return c.json({ ok: false, error: 'send_failed', via: 'a2a', msg_id: sent.msgId, thid: sent.thid }, 502);
        }
      }
      try {
        const reply = await awaitReply(sent.thid, waitMs);
        return c.json({ ok: true, msg_id: sent.msgId, thid: sent.thid, reply: reply.text, reply_msg_id: reply.msgId });
      } catch {
        return c.json({ ok: true, msg_id: sent.msgId, thid: sent.thid, reply: null, timed_out: true }, 202);
      }
    } catch (err) {
      opts.logger.error({ err: (err as Error).message, agentDid: me.row.did }, 'agent_api_send_failed');
      return c.json({ ok: false, error: 'send_failed' }, 500);
    }
  });

  // AgentID S5 / A3: A2A v1.0 JSON-RPC endpoint on the identity's host.
  app.post('/a2a', async (c) => {
    const host = effectiveHost(c);
    const ctx = await resolveAgentContext(host);
    if (!ctx) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32004, message: 'Unknown agent' } }, 404);
    let req: JsonRpcRequest;
    try {
      req = (await c.req.json()) as JsonRpcRequest;
    } catch {
      return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
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
      ...(opts.push ? { push: opts.push } : {}),
    };
    const res = await handleA2aRequest(
      { resolver: opts.resolver, now, ...(opts.a2aWaitMs !== undefined ? { waitMs: opts.a2aWaitMs } : {}) },
      { agentDid: ctx.agentDid, card: (ctx.agentRow.wellKnownA2aCard as Record<string, unknown> | null) ?? null, ctx: dispatchCtx },
      req,
      c.req.header('authorization'),
    );
    const ext = c.req.header('a2a-extensions');
    return c.newResponse(JSON.stringify(res), res.error && res.error.code === -32600 ? 400 : 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      ...(ext ? { 'A2A-Extensions': ext } : {}),
    });
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
      ...(opts.push ? { push: opts.push } : {}),
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
