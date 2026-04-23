import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Hono } from 'hono';
import { serve, type ServerType } from '@hono/node-server';
import { openAuditLog, type AuditEntry, type AuditLog } from '@kybernesis/arp-audit';
import { createPdp, type Entity, type Pdp } from '@kybernesis/arp-pdp';
import {
  openRegistry,
  type ConnectionRecord,
  type Registry,
} from '@kybernesis/arp-registry';
import type { Resolver } from '@kybernesis/arp-resolver';
import { ConnectionTokenSchema } from '@kybernesis/arp-spec';
import type { ConnectionToken } from '@kybernesis/arp-spec';
import {
  createResolverAdapter,
  createTransport,
  type DidCommMessage,
  type MessageMeta,
  type Transport,
  type TransportKeyStore,
  type TransportResolver,
} from '@kybernesis/arp-transport';
import { createConnectionMemory, type ConnectionMemory } from './memory.js';
import { buildWellKnownDocs, type WellKnownDocs } from './well-known.js';
import type {
  DispatchHandler,
  DispatchInput,
  DispatchResult,
  RequestMapper,
  RuntimeConfig,
} from './types.js';

export interface RuntimeOptions {
  config: RuntimeConfig;
  keyStore: TransportKeyStore;
  /** Generic resolver used for did:web lookups + (via adapter) transport routing. */
  resolver: Resolver;
  /**
   * Optional custom transport resolver. Overrides the default adapter built
   * on top of `resolver`. Useful for tests or alt-transport setups.
   */
  transportResolver?: TransportResolver;
  /** Optional custom fetch injected into the transport (tests). */
  transportFetch?: typeof fetch;
  /** Cedar schema JSON — passed straight to @kybernesis/arp-pdp. */
  cedarSchemaJson: string;
  /** Filesystem path for the connection registry SQLite file. */
  registryPath: string;
  /** Directory for per-connection audit JSONL files. */
  auditDir: string;
  /** Filesystem path for the transport's mailbox SQLite file. */
  mailboxPath: string;
  /** Application-level handler invoked on allowed requests. */
  dispatch?: DispatchHandler;
  /** Map DIDComm body → PDP action + resource. Defaults sensible. */
  requestMapper?: RequestMapper;
  /** Where the optional revocations proxy reads from. */
  revocationsProxy?: {
    fetchImpl?: typeof fetch;
    /** URL polled on GET /.well-known/revocations.json. */
    sourceUrl: string;
  };
  /**
   * Shared-secret that guards the `/admin/*` surface. When unset, admin
   * routes return 404 (feature disabled). Consumers (the owner app, CLI)
   * pass the token in `Authorization: Bearer <token>`.
   */
  adminToken?: string;
  /**
   * When set, the runtime forwards requests matching the owner-app routing
   * rules to this base URL. Matching rules (Phase 4 §4 Task 14):
   *   - Path prefix `/owner/*` on any host.
   *   - Any request whose `Host` header contains one of `hostSuffixes`
   *     (e.g. `ian.samantha.agent` when the agent apex is
   *     `samantha.agent`). The apex host itself never matches.
   */
  ownerApp?: {
    target: string;
    hostSuffixes?: string[];
    /** Optional custom fetch (tests). */
    fetchImpl?: typeof fetch;
  };
  /** Clock injection. */
  now?: () => number;
}

export interface StopOptions {
  /**
   * Maximum time (ms) to wait for in-flight requests to complete before the
   * server is force-closed. Default: 5000 (matches Phase 3 §8 SIGTERM grace).
   */
  graceMs?: number;
}

export interface Runtime {
  /** Start the HTTP server on the given port. Returns when listening. */
  start(port: number, hostname?: string): Promise<{ port: number; hostname: string }>;
  /**
   * Graceful shutdown. Flips into drain mode (new non-health requests get
   * 503), waits up to `graceMs` for in-flight requests to complete, then
   * closes the server, transport, and registry.
   */
  stop(options?: StopOptions): Promise<void>;
  /** True once `stop()` has been invoked and we are refusing new traffic. */
  isDraining(): boolean;
  /** Current count of in-flight HTTP requests. */
  inFlightCount(): number;
  /** Register (or seed) a connection. */
  addConnection(token: ConnectionToken, tokenJws?: string): Promise<ConnectionRecord>;
  /** Revoke a connection and add to the revocation list. */
  revokeConnection(id: string, reason: string): Promise<void>;
  /** The PDP instance (for out-of-band direct evaluation). */
  readonly pdp: Pdp;
  /** The transport (for out-of-band sends / tests). */
  readonly transport: Transport;
  /** The registry (CRUD on connections). */
  readonly registry: Registry;
  /** Memory accessor. */
  readonly memory: ConnectionMemory;
  /** Snapshot of the three well-known payloads. */
  readonly wellKnown: WellKnownDocs;
  /** Audit log handle for a given connection. Lazily constructed. */
  auditFor(connectionId: string): AuditLog;
}

const DEFAULT_REQUEST_MAPPER: RequestMapper = (msg) => {
  const body = (msg.body ?? {}) as Record<string, unknown>;
  const action = typeof body['action'] === 'string' ? (body['action'] as string) : inferActionFromType(msg.type);
  const resourceSpec = body['resource'];
  return {
    action,
    resource: coerceResource(resourceSpec),
    context: typeof body['context'] === 'object' && body['context'] !== null
      ? (body['context'] as Record<string, unknown>)
      : {},
  };
};

function inferActionFromType(type: string): string {
  const idx = type.lastIndexOf('/');
  return idx >= 0 ? type.slice(idx + 1) : type;
}

function coerceResource(spec: unknown): Entity {
  if (typeof spec === 'string') {
    const [type = 'Resource', id = spec] = spec.split(':', 2);
    return { type, id };
  }
  if (spec && typeof spec === 'object') {
    const s = spec as Record<string, unknown>;
    if (typeof s['type'] === 'string' && typeof s['id'] === 'string') {
      return {
        type: s['type'] as string,
        id: s['id'] as string,
        ...(typeof s['attrs'] === 'object' && s['attrs'] !== null
          ? { attrs: s['attrs'] as Record<string, unknown> }
          : {}),
      };
    }
  }
  return { type: 'Resource', id: 'default' };
}

export async function createRuntime(opts: RuntimeOptions): Promise<Runtime> {
  ensureDir(opts.registryPath);
  ensureDir(opts.mailboxPath);
  mkdirSync(opts.auditDir, { recursive: true });

  const now = opts.now ?? (() => Date.now());
  const registry = openRegistry(opts.registryPath, { now });
  const pdp = createPdp(opts.cedarSchemaJson);
  const memory = createConnectionMemory();
  const wellKnown = buildWellKnownDocs(opts.config);

  const transport = createTransport({
    did: opts.config.did,
    keyStore: opts.keyStore,
    resolver: opts.transportResolver ?? createResolverAdapter(opts.resolver),
    mailboxPath: opts.mailboxPath,
    now,
    ...(opts.transportFetch ? { fetchImpl: opts.transportFetch } : {}),
  });

  const auditLogs = new Map<string, AuditLog>();
  function auditFor(connectionId: string): AuditLog {
    let log = auditLogs.get(connectionId);
    if (!log) {
      log = openAuditLog({ connectionId, dir: opts.auditDir });
      auditLogs.set(connectionId, log);
    }
    return log;
  }

  const requestMapper = opts.requestMapper ?? DEFAULT_REQUEST_MAPPER;

  transport.listen(async (msg, meta) => {
    if (isResponseType(msg.type)) return;
    try {
      await evaluateAndDispatch(msg, meta);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[arp-runtime] dispatch error for ${msg.id}:`, err);
    }
  });

  async function evaluateAndDispatch(msg: DidCommMessage, meta: MessageMeta) {
    const connectionId = extractConnectionId(msg);
    if (!connectionId) return;
    const record = await registry.getConnection(connectionId);
    if (!record) return;
    if (record.status !== 'active') {
      auditFor(connectionId).append({
        msg_id: msg.id,
        decision: 'deny',
        policies_fired: [],
        reason: `connection_${record.status}`,
      });
      await replyDeny(msg, meta, connectionId, `connection_${record.status}`);
      return;
    }
    if (await registry.isRevoked('connection', connectionId)) {
      auditFor(connectionId).append({
        msg_id: msg.id,
        decision: 'deny',
        policies_fired: [],
        reason: 'revoked',
      });
      await replyDeny(msg, meta, connectionId, 'revoked');
      return;
    }
    await registry.touchLastMessage(connectionId, now());

    const mapped = requestMapper(msg);
    const decision = pdp.evaluate({
      cedarPolicies: record.cedar_policies,
      principal: {
        type: 'Agent',
        id: meta.peerDid,
        attrs: { connection_id: connectionId, owner_did: record.token.issuer },
      },
      action: mapped.action,
      resource: mapped.resource,
      context: mapped.context ?? {},
    });

    // The Connection Token carries the static per-connection obligations
    // compiled from the bundle catalog (redact_fields, rate_limit, etc.).
    // The PDP's `decision.obligations` is for future dynamic obligation
    // policies (not yet wired). For every allowed message, both sources
    // apply, so combine them for audit and outbound reply purposes.
    const effectiveObligations = [
      ...(record.token.obligations ?? []),
      ...decision.obligations,
    ];

    auditFor(connectionId).append({
      msg_id: msg.id,
      decision: decision.decision,
      policies_fired: decision.policies_fired,
      obligations: effectiveObligations,
      ...(decision.reasons.length > 0 ? { reason: decision.reasons.join('; ') } : {}),
    });

    if (decision.decision === 'deny') {
      await replyDeny(msg, meta, connectionId, 'policy_denied', decision.policies_fired);
      return;
    }

    let dispatchResult: DispatchResult = {};
    if (opts.dispatch) {
      const dispatchInput: DispatchInput = {
        message: msg,
        meta,
        connection: record.token,
        connectionId,
        decision: {
          decision: decision.decision,
          obligations: effectiveObligations,
          policies_fired: decision.policies_fired,
        },
        memory: {
          set: (key, value) => memory.set(connectionId, key, value),
          get: (key) => memory.get(connectionId, key),
        },
      };
      dispatchResult = await opts.dispatch(dispatchInput);
    }

    await transport.send(meta.peerDid, {
      id: `${msg.id}.reply`,
      type: dispatchResult.replyType ?? 'https://didcomm.org/arp/1.0/response',
      from: opts.config.did,
      to: [meta.peerDid],
      ...(msg.thid ? { thid: msg.thid } : { thid: msg.id }),
      body: {
        connection_id: connectionId,
        decision: 'allow',
        obligations: effectiveObligations,
        result: dispatchResult.reply ?? { ok: true },
      },
    });
  }

  async function replyDeny(
    msg: DidCommMessage,
    meta: MessageMeta,
    connectionId: string,
    reason: string,
    policiesFired: string[] = [],
  ) {
    try {
      await transport.send(meta.peerDid, {
        id: `${msg.id}.deny`,
        type: 'https://didcomm.org/arp/1.0/response',
        from: opts.config.did,
        to: [meta.peerDid],
        ...(msg.thid ? { thid: msg.thid } : { thid: msg.id }),
        body: {
          connection_id: connectionId,
          decision: 'deny',
          reason,
          policies_fired: policiesFired,
        },
      });
    } catch {
      // Deny-replies are best-effort; the audit log is the source of truth.
    }
  }

  function extractConnectionId(msg: DidCommMessage): string | null {
    const body = msg.body as Record<string, unknown> | undefined;
    const raw = body?.['connection_id'];
    return typeof raw === 'string' ? raw : null;
  }

  /* ------------------------ HTTP layer ------------------------ */

  const app = new Hono();

  const didDocumentJson = JSON.stringify(wellKnown.didDocument);
  const agentCardJson = JSON.stringify(wellKnown.agentCard);
  const arpJsonPayload = JSON.stringify(wellKnown.arpJson);

  let draining = false;
  let inFlight = 0;

  app.use('*', async (c, next) => {
    // Health is always served — load balancers still need to see us during drain.
    if (c.req.path === '/health') return next();
    if (draining) {
      return c.json({ error: 'draining' }, 503);
    }
    inFlight += 1;
    try {
      await next();
    } finally {
      inFlight -= 1;
    }
  });

  // Owner-app proxy. Runs before every other route so `/owner/*` and the
  // owner subdomain never hit the DIDComm-scoped handlers below.
  if (opts.ownerApp) {
    const proxy = opts.ownerApp;
    const fetchProxy = proxy.fetchImpl ?? globalThis.fetch;
    app.use('*', async (c, next) => {
      const host = (c.req.header('host') ?? '').toLowerCase();
      const path = c.req.path;
      const hostMatch =
        !!proxy.hostSuffixes &&
        proxy.hostSuffixes.some(
          (suffix) =>
            host === suffix.toLowerCase() ||
            host.endsWith(`.${suffix.toLowerCase()}`),
        );
      const pathMatch = path.startsWith('/owner/') || path === '/owner';
      if (!hostMatch && !pathMatch) return next();

      // Preserve full path+query when forwarding.
      const target = proxy.target.replace(/\/$/, '');
      const suffix = pathMatch ? path.slice('/owner'.length) || '/' : path;
      const search = c.req.url.includes('?')
        ? c.req.url.slice(c.req.url.indexOf('?'))
        : '';
      const forwardedUrl = `${target}${suffix}${search}`;

      const headers = new Headers(c.req.raw.headers);
      headers.delete('host');
      headers.set('x-forwarded-host', host);
      headers.set('x-forwarded-proto', c.req.header('x-forwarded-proto') ?? 'https');

      const body =
        c.req.method === 'GET' || c.req.method === 'HEAD'
          ? undefined
          : await c.req.raw.arrayBuffer();

      let upstream: Response;
      try {
        upstream = await fetchProxy(forwardedUrl, {
          method: c.req.method,
          headers,
          ...(body ? { body } : {}),
          redirect: 'manual',
        });
      } catch (err) {
        return c.json(
          { error: 'owner_proxy_failed', reason: (err as Error).message },
          502,
        );
      }

      // Strip hop-by-hop headers before forwarding back.
      const respHeaders = new Headers(upstream.headers);
      for (const h of [
        'connection',
        'transfer-encoding',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailers',
        'upgrade',
      ]) {
        respHeaders.delete(h);
      }
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: respHeaders,
      });
    });
  }

  app.get('/health', async (c) => {
    const connections = await registry.listConnections();
    return c.json({
      ok: true,
      version: opts.config.scopeCatalogVersion,
      did: opts.config.did,
      uptime_ms: now() - bootedAt,
      cert_fingerprint: opts.config.tlsFingerprint,
      connections_count: connections.length,
      audit_seq: auditSeqTotal(),
      draining,
    });
  });

  app.get('/.well-known/did.json', (c) =>
    c.newResponse(didDocumentJson, 200, wellKnownHeaders()),
  );
  app.get('/.well-known/agent-card.json', (c) =>
    c.newResponse(agentCardJson, 200, wellKnownHeaders()),
  );
  app.get('/.well-known/arp.json', (c) =>
    c.newResponse(arpJsonPayload, 200, wellKnownHeaders()),
  );

  app.get('/.well-known/revocations.json', async (c) => {
    if (opts.revocationsProxy) {
      try {
        const fetchImpl = opts.revocationsProxy.fetchImpl ?? globalThis.fetch;
        const r = await fetchImpl(opts.revocationsProxy.sourceUrl);
        const body = await r.text();
        return c.newResponse(body, r.ok ? 200 : 502, wellKnownHeaders());
      } catch {
        return c.json({ error: 'revocations_unavailable' }, 502);
      }
    }
    const revocations = await registry.listRevocations();
    return c.json({
      issuer: opts.config.principalDid,
      updated_at: new Date(now()).toISOString(),
      revocations: revocations.map((r) => ({
        type: r.type,
        id: r.id,
        revoked_at: new Date(r.revoked_at).toISOString(),
        reason: r.reason ?? undefined,
      })),
    });
  });

  app.post('/didcomm', async (c) => {
    const body = await c.req.text();
    const result = await transport.receiveEnvelope(body);
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, 400);
    }
    return c.json({ ok: true, msg_id: result.msgId });
  });

  app.post('/pair', (c) => c.json({ error: 'not_implemented' }, 501));

  /* ------------------------ Admin surface --------------------- */

  // In-memory pending invitations keyed by connection_id. Persisted only
  // while the runtime is up — the owner app re-issues on restart.
  const pendingInvitations = new Map<
    string,
    { proposal: unknown; invitationUrl: string | null; createdAt: string }
  >();

  app.use('/admin/*', async (c, next) => {
    if (!opts.adminToken) {
      return c.json({ error: 'admin_disabled' }, 404);
    }
    const header = c.req.header('authorization') ?? '';
    const expected = `Bearer ${opts.adminToken}`;
    if (header !== expected) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    return next();
  });

  app.get('/admin/connections', async (c) => {
    const records = await registry.listConnections({ includeExpired: true });
    return c.json({
      connections: records.map((r) => ({
        connection_id: r.connection_id,
        label: r.label,
        self_did: r.self_did,
        peer_did: r.peer_did,
        purpose: r.purpose,
        status: r.status,
        created_at: r.created_at,
        expires_at: r.expires_at,
        last_message_at: r.last_message_at,
        cedar_policies: r.cedar_policies,
        obligations: r.token.obligations,
        issuer: r.token.issuer,
        scope_catalog_version: r.token.scope_catalog_version,
      })),
    });
  });

  app.get('/admin/connections/:id', async (c) => {
    const id = c.req.param('id');
    const record = await registry.getConnection(id);
    if (!record) return c.json({ error: 'not_found' }, 404);
    return c.json({
      connection: {
        ...record,
        metadata: record.metadata ?? null,
      },
    });
  });

  app.post('/admin/connections', async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const tokenInput = body.token ?? body;
    const parsed = ConnectionTokenSchema.safeParse(tokenInput);
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid_token',
          issues: parsed.error.issues,
        },
        400,
      );
    }
    try {
      const tokenJws =
        typeof body.token_jws === 'string' ? body.token_jws : undefined;
      const record = await registry.createConnection({
        token: parsed.data,
        token_jws: tokenJws ?? JSON.stringify(parsed.data),
        self_did: opts.config.did,
        ...(typeof body.label === 'string' ? { label: body.label } : {}),
      });
      pendingInvitations.delete(parsed.data.connection_id);
      return c.json({ connection: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = /conflict|already exists/i.test(msg) ? 409 : 500;
      return c.json({ error: 'create_failed', reason: msg }, status);
    }
  });

  app.post('/admin/connections/:id/revoke', async (c) => {
    const id = c.req.param('id');
    let reason = 'owner_revoked';
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      if (typeof body.reason === 'string') reason = body.reason;
    } catch {
      /* ignore malformed */
    }
    try {
      await revokeConnection(id, reason);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  app.post('/admin/connections/:id/suspend', async (c) => {
    const id = c.req.param('id');
    try {
      await registry.updateStatus(id, 'suspended');
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  app.post('/admin/connections/:id/resume', async (c) => {
    const id = c.req.param('id');
    try {
      await registry.updateStatus(id, 'active');
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  app.get('/admin/audit/:id', async (c) => {
    const id = c.req.param('id');
    const record = await registry.getConnection(id);
    if (!record) return c.json({ error: 'not_found' }, 404);
    const log = auditFor(id);
    const entries = readAuditEntries(log.path);
    const limit = clampInt(c.req.query('limit'), 1, 500, 50);
    const offset = clampInt(c.req.query('offset'), 0, entries.length, 0);
    const total = entries.length;
    const slice = entries
      .slice()
      .reverse()
      .slice(offset, offset + limit);
    return c.json({
      connection_id: id,
      total,
      offset,
      limit,
      entries: slice,
      verification: log.verify(),
    });
  });

  app.post('/admin/audit/:id/verify', async (c) => {
    const id = c.req.param('id');
    const record = await registry.getConnection(id);
    if (!record) return c.json({ error: 'not_found' }, 404);
    return c.json({ verification: auditFor(id).verify() });
  });

  app.get('/admin/pairing/invitations', async (c) => {
    const rows = Array.from(pendingInvitations.entries()).map(
      ([connectionId, entry]) => ({
        connection_id: connectionId,
        invitation_url: entry.invitationUrl,
        created_at: entry.createdAt,
        proposal: entry.proposal,
      }),
    );
    return c.json({ invitations: rows });
  });

  app.post('/admin/pairing/invitations', async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const proposal = body.proposal as Record<string, unknown> | undefined;
    if (!proposal || typeof proposal !== 'object') {
      return c.json({ error: 'missing_proposal' }, 400);
    }
    const connectionId =
      typeof proposal.connection_id === 'string'
        ? proposal.connection_id
        : null;
    if (!connectionId) {
      return c.json({ error: 'missing_connection_id' }, 400);
    }
    pendingInvitations.set(connectionId, {
      proposal,
      invitationUrl:
        typeof body.invitation_url === 'string' ? body.invitation_url : null,
      createdAt: new Date(now()).toISOString(),
    });
    return c.json({
      ok: true,
      connection_id: connectionId,
      invitation_url: body.invitation_url ?? null,
    });
  });

  app.post('/admin/pairing/accept', async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const tokenInput = body.token ?? body;
    const parsed = ConnectionTokenSchema.safeParse(tokenInput);
    if (!parsed.success) {
      return c.json(
        { error: 'invalid_token', issues: parsed.error.issues },
        400,
      );
    }
    try {
      const tokenJws =
        typeof body.token_jws === 'string' ? body.token_jws : undefined;
      const record = await registry.createConnection({
        token: parsed.data,
        token_jws: tokenJws ?? JSON.stringify(parsed.data),
        self_did: opts.config.did,
      });
      pendingInvitations.delete(parsed.data.connection_id);
      return c.json({ connection: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = /conflict|already exists/i.test(msg) ? 409 : 500;
      return c.json({ error: 'accept_failed', reason: msg }, status);
    }
  });

  app.post('/admin/keys/rotate', async (c) => {
    // v0: the runtime does not hold the principal key, and the agent key is
    // fixed at boot (owned by the TransportKeyStore). A full hot-rotation
    // lands in Phase 5 alongside the TLS cert pipeline. For now we return
    // 501 so the owner app can render a "restart required" hint.
    return c.json(
      {
        error: 'not_implemented',
        reason:
          'Agent key rotation requires restarting the runtime with a new keystore path in v0.',
      },
      501,
    );
  });

  app.all('*', (c) => c.json({ error: 'not_found' }, 404));

  /* ------------------------ Lifecycle ------------------------- */

  let server: ServerType | null = null;
  const bootedAt = now();

  async function start(port: number, hostname = '127.0.0.1') {
    if (server) throw new Error('runtime already started');
    const serverInfo = await new Promise<{ port: number; hostname: string }>(
      (resolve, reject) => {
        try {
          server = serve(
            { fetch: app.fetch, hostname, port },
            (info) => resolve({ port: info.port, hostname: info.address }),
          );
        } catch (err) {
          reject(err);
        }
      },
    );
    return serverInfo;
  }

  async function stop(options: StopOptions = {}) {
    const graceMs = options.graceMs ?? 5000;
    draining = true;

    // Settle period: lets the kernel's TCP accept queue flush connections
    // that were mid-handshake when stop() was called, so they reach the
    // Hono middleware (and thus `inFlight`) before we start polling.
    // Bounded by graceMs/4 so tight graces still make forward progress.
    const deadline = Date.now() + graceMs;
    const settleMs = Math.min(200, Math.max(50, Math.floor(graceMs / 4)));
    await sleep(settleMs);

    // Close idle keep-alive TCP connections that aren't actively serving a
    // request — otherwise they'd keep the getConnections() count above 0
    // and block the quiescence loop until the deadline. Request-bearing
    // connections stay open; they drain naturally as their handlers finish.
    closeIdleServerConnections(server);

    // Quiescence loop: wait until BOTH the application-level in-flight
    // counter AND the kernel-level TCP connection count reach zero, OR
    // until graceMs elapses.
    //
    // Prior versions used only `inFlight` as the signal. That's an
    // application-level counter, incremented when a request hits the Hono
    // middleware. On slower runners (GitHub Actions), a burst of fetches
    // fired right before stop() can still be in the TCP accept queue when
    // the quiescence loop first sees `inFlight === 0` and breaks —
    // server.close() then resets those pending sockets, producing fetch
    // rejections with status 0 (the failure mode seen in PR #5 and again
    // after the Phase 7 merge). Tracking getConnections() closes that
    // window because TCP-level connections count from accept() onward,
    // before the middleware ever runs.
    while (Date.now() < deadline) {
      const tcpCount = await countServerConnections(server);
      if (inFlight === 0 && tcpCount === 0) break;
      await sleep(50);
    }

    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
    await transport.close();
    registry.close();
    for (const log of auditLogs.values()) {
      void log;
    }
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  function countServerConnections(srv: unknown): Promise<number> {
    return new Promise((resolve) => {
      const s = srv as {
        getConnections?: (cb: (err: Error | null, n: number) => void) => void;
      } | null;
      if (s && typeof s.getConnections === 'function') {
        s.getConnections((err, n) => resolve(err ? 0 : n));
      } else {
        resolve(0);
      }
    });
  }

  function closeIdleServerConnections(srv: unknown): void {
    const s = srv as { closeIdleConnections?: () => void } | null;
    if (s && typeof s.closeIdleConnections === 'function') {
      s.closeIdleConnections();
    }
  }

  function auditSeqTotal(): number {
    let total = 0;
    for (const log of auditLogs.values()) total += log.size;
    return total;
  }

  /* ------------------------ Connection ops -------------------- */

  async function addConnection(token: ConnectionToken, tokenJws?: string) {
    const parsed = ConnectionTokenSchema.parse(token);
    return registry.createConnection({
      token: parsed,
      token_jws: tokenJws ?? JSON.stringify(parsed),
      self_did: opts.config.did,
    });
  }

  async function revokeConnection(id: string, reason: string) {
    await registry.revokeConnection(id, reason);
  }

  return {
    start,
    stop,
    isDraining: () => draining,
    inFlightCount: () => inFlight,
    addConnection,
    revokeConnection,
    pdp,
    transport,
    registry,
    memory,
    wellKnown,
    auditFor,
  };
}

function ensureDir(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function wellKnownHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Access-Control-Allow-Origin': '*',
  };
}

function isResponseType(type: string): boolean {
  return type.endsWith('/response') || type.endsWith('/reply');
}

function readAuditEntries(path: string): AuditEntry[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const out: AuditEntry[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as AuditEntry);
    } catch {
      // skip malformed — verify() will surface the break
    }
  }
  return out;
}

function clampInt(
  raw: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}
