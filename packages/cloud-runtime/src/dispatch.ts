/**
 * Inbound DIDComm dispatch for the cloud runtime.
 *
 * Differs from @kybernesis/arp-runtime.runtime.evaluateAndDispatch in that:
 *   1. The cloud doesn't execute agent code — it evaluates the PDP against
 *      the stored cedar_policies + runs record-keeping, then pushes the
 *      result over WS for the outbound-client to deliver to the local
 *      agent process.
 *   2. Audit writes go to Postgres (@kybernesis/arp-cloud-runtime/audit).
 *   3. If no WS session is live for the target agent, the message is
 *      persisted in `messages` with status='queued' and delivered on
 *      reconnect (message queue — 7d expiry).
 *
 * Envelope verification is done exactly like the agent-local transport:
 *   parse → lookup peer key → verify ed25519 signature. Peer key lookup
 *   goes through the resolver injected at runtime init (resolves did:web +
 *   HNS). Future: add cache.
 */

import { verifyEnvelope, multibaseEd25519ToRaw } from '@kybernesis/arp-transport';
import type { DidCommMessage } from '@kybernesis/arp-transport';
import { createPdp, type Entity, type Pdp, type PdpDecision } from '@kybernesis/arp-pdp';
import type { ConnectionToken, DidDocument, Obligation } from '@kybernesis/arp-spec';
import type { ConnectionRow, TenantDb } from '@kybernesis/arp-cloud-db';
import type { PostgresAudit } from './audit.js';
import type { SessionRegistry } from './sessions.js';
import type { CloudRuntimeLogger, TenantMetrics, WsServerEvent } from './types.js';

export interface PeerResolver {
  /** Resolve a peer's DID document. */
  resolveDid(did: string): Promise<DidDocument | null>;
}

export interface DispatchContext {
  tenantDb: TenantDb;
  tenantId: string;
  agentDid: string;
  audit: PostgresAudit;
  pdp: Pdp;
  resolver: PeerResolver;
  sessions: SessionRegistry;
  logger: CloudRuntimeLogger;
  metrics: TenantMetrics;
  now: () => number;
}

export interface DispatchResult {
  ok: boolean;
  messageId?: string;
  decision: 'allow' | 'deny';
  reason?: string;
  queued?: boolean;
}

export async function dispatchInbound(
  ctx: DispatchContext,
  envelope: string,
): Promise<DispatchResult> {
  const log = ctx.logger.child({ tenantId: ctx.tenantId, agentDid: ctx.agentDid });

  // ---- parse + verify envelope -------------------------------------
  const parts = envelope.split('.');
  if (parts.length !== 3) {
    log.warn({}, 'bad_envelope_segments');
    return { ok: false, decision: 'deny', reason: 'invalid_envelope' };
  }
  const header = safeParse(parts[0]);
  if (!header || typeof header !== 'object' || !('kid' in header)) {
    return { ok: false, decision: 'deny', reason: 'invalid_envelope_header' };
  }
  const kid = (header as { kid?: string }).kid;
  if (!kid) return { ok: false, decision: 'deny', reason: 'missing_kid' };
  const peerDid = kid.split('#')[0];
  if (!peerDid) return { ok: false, decision: 'deny', reason: 'malformed_kid' };

  const peerDoc = await ctx.resolver.resolveDid(peerDid);
  if (!peerDoc) return { ok: false, decision: 'deny', reason: 'unknown_peer' };
  const peerKey = extractEd25519Key(peerDoc);
  if (!peerKey) return { ok: false, decision: 'deny', reason: 'no_peer_ed25519_key' };

  const verified = await verifyEnvelope(envelope, peerKey);
  if (!verified.ok) {
    log.warn({ error: verified.error, peerDid }, 'envelope_verify_failed');
    return { ok: false, decision: 'deny', reason: 'invalid_signature' };
  }
  const msg = verified.message;

  // ---- lookup connection -------------------------------------------
  // Prefer an explicit `connection_id` in the message body; fall back to
  // resolving from (ctx.agentDid, peerDid) → unique active connection.
  // The fallback exists because senders can omit `connection_id` (the
  // contacts.yaml file is a flat name → DID map and doesn't track ids),
  // and the audience side already authenticated peerDid via signature
  // verification — so a single active pair between us and the peer is
  // unambiguous to resolve here. If two or more active pairs exist
  // (rare, e.g. mid-rescope or duplicate accept), require explicit.
  const explicitId = extractConnectionId(msg);
  const resolved = await resolveConnection(ctx, explicitId, peerDid, msg.id, log);
  if (!resolved.ok) return resolved.deny;
  const conn = resolved.conn;
  const connectionId = conn.connectionId;
  if (conn.agentDid !== ctx.agentDid) {
    // Connection is for another agent under the same tenant — route elsewhere
    // via the tenant context in theory, but for an inbound we identify the
    // target from the envelope `to` field. Reject mismatched routing.
    return { ok: false, decision: 'deny', reason: 'wrong_agent' };
  }
  if (conn.status !== 'active') {
    await ctx.audit.append({
      agentDid: ctx.agentDid,
      connectionId,
      msgId: msg.id,
      decision: 'deny',
      policiesFired: [],
      reason: `connection_${conn.status}`,
    });
    return { ok: false, decision: 'deny', reason: `connection_${conn.status}` };
  }
  if (await ctx.tenantDb.isRevoked(ctx.agentDid, 'connection', connectionId)) {
    await ctx.audit.append({
      agentDid: ctx.agentDid,
      connectionId,
      msgId: msg.id,
      decision: 'deny',
      policiesFired: [],
      reason: 'revoked',
    });
    return { ok: false, decision: 'deny', reason: 'revoked' };
  }

  // ---- PDP ---------------------------------------------------------
  const t0 = ctx.now();
  const token = conn.tokenJson as ConnectionToken;
  const mapped = mapRequest(msg);
  const decision = ctx.pdp.evaluate({
    cedarPolicies: conn.cedarPolicies as string[],
    principal: {
      type: 'Agent',
      id: peerDid,
      attrs: {
        connection_id: connectionId,
        owner_did: token.issuer,
      },
    },
    action: mapped.action,
    resource: mapped.resource,
    context: mapped.context ?? {},
  });
  ctx.metrics.pdpLatency(ctx.tenantId, ctx.now() - t0);

  const effectiveObligations: Obligation[] = [
    ...(conn.obligations as Obligation[] | null ?? []),
    ...decision.obligations,
  ];

  await ctx.audit.append({
    agentDid: ctx.agentDid,
    connectionId,
    msgId: msg.id,
    decision: decision.decision,
    obligations: effectiveObligations,
    policiesFired: decision.policies_fired,
    ...(decision.reasons.length > 0 ? { reason: decision.reasons.join('; ') } : {}),
  });
  await ctx.tenantDb.touchConnection(connectionId);

  if (decision.decision === 'deny') {
    log.info({ msgId: msg.id, connectionId, policies: decision.policies_fired }, 'pdp_deny');
    return { ok: true, decision: 'deny', reason: 'policy_denied' };
  }

  // ---- persist the envelope ----------------------------------------
  const expiresAt = new Date(ctx.now() + 7 * 24 * 3600 * 1000);
  const row = await ctx.tenantDb.enqueueMessage({
    agentDid: ctx.agentDid,
    connectionId,
    direction: 'in',
    msgId: msg.id,
    msgType: msg.type,
    envelopeJws: envelope,
    body: msg.body ?? null,
    peerDid,
    expiresAt,
  });
  ctx.metrics.inbound(ctx.tenantId);
  await ctx.tenantDb.incrementUsage(currentUsagePeriod(ctx.now()), { inbound: 1 });

  // ---- deliver if a session is live, else leave queued --------------
  const session = ctx.sessions.getByAgent(ctx.agentDid);
  if (session) {
    const event: WsServerEvent = {
      kind: 'inbound_message',
      messageId: row.id,
      msgId: msg.id,
      msgType: msg.type,
      envelope,
      connectionId,
      peerDid,
      decision: 'allow',
      obligations: effectiveObligations,
      policiesFired: decision.policies_fired,
    };
    try {
      await session.send(event);
      await ctx.tenantDb.markMessageDelivered(row.id);
      return { ok: true, decision: 'allow', messageId: row.id, queued: false };
    } catch (err) {
      log.error({ err: (err as Error).message, msgId: msg.id }, 'ws_send_failed');
      await ctx.tenantDb.markMessageFailed(row.id, 'ws_send_failed');
    }
  }

  log.info({ msgId: msg.id, connectionId }, 'queued_no_session');
  return { ok: true, decision: 'allow', messageId: row.id, queued: true };
}

/** Dispatch all queued messages for an agent now that a session is live. */
export async function drainQueue(
  ctx: Pick<DispatchContext, 'tenantDb' | 'sessions' | 'logger' | 'agentDid' | 'tenantId'>,
): Promise<number> {
  const session = ctx.sessions.getByAgent(ctx.agentDid);
  if (!session) return 0;
  const queued = await ctx.tenantDb.claimQueuedMessages(ctx.agentDid, 500);
  let delivered = 0;
  for (const m of queued) {
    const event: WsServerEvent = {
      kind: 'inbound_message',
      messageId: m.id,
      msgId: m.msgId,
      msgType: m.msgType,
      envelope: m.envelopeJws,
      connectionId: m.connectionId,
      peerDid: m.peerDid,
      decision: 'allow',
      obligations: [],
      policiesFired: [],
    };
    try {
      await session.send(event);
      await ctx.tenantDb.markMessageDelivered(m.id);
      delivered++;
    } catch (err) {
      ctx.logger.warn({ err: (err as Error).message, messageId: m.id }, 'drain_send_failed');
      break;
    }
  }
  return delivered;
}

export function createCloudPdp(cedarSchemaJson: string): Pdp {
  return createPdp(cedarSchemaJson);
}

export function currentUsagePeriod(nowMs: number): string {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

// ---------------------------------------------------------- helpers

function safeParse(b64?: string): unknown {
  if (!b64) return null;
  try {
    const raw = Buffer.from(b64, 'base64url').toString('utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractConnectionId(msg: DidCommMessage): string | null {
  const body = (msg.body ?? {}) as Record<string, unknown>;
  const raw = body['connection_id'];
  return typeof raw === 'string' ? raw : null;
}

type ResolveConnectionResult =
  | { ok: true; conn: ConnectionRow }
  | { ok: false; deny: DispatchResult };

async function resolveConnection(
  ctx: DispatchContext,
  explicitId: string | null,
  peerDid: string,
  msgId: string,
  log: ReturnType<CloudRuntimeLogger['child']>,
): Promise<ResolveConnectionResult> {
  // Explicit id takes precedence — it's the canonical wire-level handle.
  if (explicitId) {
    const conn = await ctx.tenantDb.getConnection(explicitId);
    if (conn) return { ok: true, conn };
  }
  // Fallback: unique active connection for (this agent, this peer).
  const candidates = await ctx.tenantDb.listConnections({
    agentDid: ctx.agentDid,
    status: 'active',
  });
  const matches = candidates.filter((c) => c.peerDid === peerDid);
  if (matches.length === 1) {
    return { ok: true, conn: matches[0]! };
  }
  if (matches.length === 0) {
    if (!explicitId) {
      log.warn({ msgId, peerDid }, 'missing_connection_id_no_match');
      return { ok: false, deny: { ok: false, decision: 'deny', reason: 'missing_connection_id' } };
    }
    log.warn({ msgId, connectionId: explicitId }, 'unknown_connection');
    return { ok: false, deny: { ok: false, decision: 'deny', reason: 'unknown_connection' } };
  }
  log.warn(
    { msgId, peerDid, candidates: matches.map((m) => m.connectionId) },
    'ambiguous_connection',
  );
  return { ok: false, deny: { ok: false, decision: 'deny', reason: 'ambiguous_connection' } };
}

function mapRequest(msg: DidCommMessage): { action: string; resource: Entity; context?: Record<string, unknown> } {
  const body = (msg.body ?? {}) as Record<string, unknown>;
  const action =
    typeof body['action'] === 'string'
      ? (body['action'] as string)
      : inferActionFromType(msg.type);
  const resource = coerceResource(body['resource']);
  const context =
    typeof body['context'] === 'object' && body['context'] !== null
      ? (body['context'] as Record<string, unknown>)
      : {};
  return { action, resource, context };
}

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

function extractEd25519Key(doc: DidDocument): Uint8Array | null {
  const methods = doc.verificationMethod ?? [];
  for (const m of methods) {
    if (m.type === 'Ed25519VerificationKey2020' && m.publicKeyMultibase) {
      try {
        return multibaseEd25519ToRaw(m.publicKeyMultibase);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export type { Pdp, PdpDecision };
