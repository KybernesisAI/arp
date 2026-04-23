import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Hono } from 'hono';
import { serve, type ServerType } from '@hono/node-server';
import { openAuditLog, type AuditLog } from '@kybernesis/arp-audit';
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

    auditFor(connectionId).append({
      msg_id: msg.id,
      decision: decision.decision,
      policies_fired: decision.policies_fired,
      obligations: decision.obligations,
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
          obligations: decision.obligations,
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
        obligations: decision.obligations,
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

    // Initial settle period: lets the kernel's TCP accept queue flush any
    // connections that were mid-handshake when stop() was called, so they
    // reach the Hono middleware (and thus `inFlight`) before we start
    // polling for quiescence. Without this, on slower runners (CI) a burst
    // of fetches fired right before stop() can still be in the backlog when
    // the first quiet-period check reads `inFlight === 0` and breaks —
    // causing server.close() to reset those pending sockets (the failure
    // mode caught by the phase-3 shutdown test on GitHub Actions).
    // Bounded by graceMs/4 so callers with a tight grace still make forward
    // progress in the quiescence loop.
    const deadline = Date.now() + graceMs;
    const settleMs = Math.min(200, Math.max(50, Math.floor(graceMs / 4)));
    await sleep(settleMs);

    // Wait for a 50 ms quiet period with zero in-flight requests, or until
    // graceMs has elapsed.
    while (Date.now() < deadline) {
      const before = inFlight;
      await sleep(50);
      if (before === 0 && inFlight === 0) break;
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
